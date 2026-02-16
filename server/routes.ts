import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { HostStatsResponse, Vm } from "@shared/schema";
import { z } from "zod";
import si from "systeminformation";
import { exec } from "child_process";
import { promisify } from "util";
import path, { join } from "path";
import { createProxyMiddleware } from 'http-proxy-middleware';

const execAsync = promisify(exec);

/**
 * Periodically checks Docker container status and updates the storage
 * to reflect if a VM was stopped externally (e.g. from within the guest OS).
 */
function startStatusSync() {
  setInterval(async () => {
    try {
      const vms = await storage.getVms();
      const { stdout } = await execAsync("docker ps --format '{{.Names}}'", { cwd: process.cwd() });
      const runningContainers = new Set(stdout.split("\n").map(n => n.trim()).filter(n => n !== ""));

      for (const vm of vms) {
        const containerName = vm.name;
        const isActuallyRunning = runningContainers.has(containerName);

        if (vm.status === "running" && !isActuallyRunning) {
          console.log(`VM "${vm.name}" detected as stopped externally. Updating status.`);
          await storage.updateVm(vm.id, { status: "stopped" });
        } else if (vm.status === "stopped" && isActuallyRunning) {
          // This handles cases where someone might have manually started the container via CLI
          console.log(`VM "${vm.name}" detected as running externally. Updating status.`);
          await storage.updateVm(vm.id, { status: "running" });
        }
      }
    } catch (error) {
      // Docker might not be available or command failed, ignore to prevent crash
    }
  }, 5000); // Check every 5 seconds
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Start the background status synchronization
  startStatusSync();

  // Host Stats Endpoint
  app.get(api.stats.host.path, async (req, res) => {
    try {
      const [cpu, mem, disk, time, os, netIfaces, netStats] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.fsSize(),
        si.time(),
        si.osInfo(),
        si.networkInterfaces(),
        si.networkInterfaceDefault()
      ]);
      // Calculate "Available" memory (Active memory) which is a more accurate representation of "Used"
      // on Linux systems where free memory includes buffers/cache.
      // si.mem().active is often a better "Used" metric for users.
      const usedMemory = mem.active;
      const usedPercent = (usedMemory / mem.total) * 100;
      // Use the filesystem where the data is stored
      const projectRoot = process.cwd();
      const isWinKvmManagerDir = projectRoot.endsWith('win-kvm-manager');
      const storageDir = isWinKvmManagerDir ? join(projectRoot, 'storage') : join(projectRoot, 'win-kvm-manager', 'storage');

      // Better detection of the correct mount point for the project/storage
      const mainDisk = disk.find(d => storageDir === d.mount) || 
                       disk.sort((a, b) => b.mount.length - a.mount.length)
                           .find(d => storageDir.startsWith(d.mount) || projectRoot.startsWith(d.mount)) || 
                       disk[0] || 
                       { size: 0, used: 0, available: 0, use: 0 };
      // Ensure we are in a valid working directory for subprocesses
      const execOptions = { cwd: projectRoot };
      // Get current network throughput
      const netThroughput = await si.networkStats();
      const stats: HostStatsResponse = {
        cpu: {
          cores: cpu.cores,
          usagePercent: 0,
          model: `${cpu.manufacturer} ${cpu.brand}`,
        },
        mem: {
          total: mem.total,
          free: mem.available, // Use 'available' instead of 'free' as it accounts for cache
          used: usedMemory,
          usedPercent: usedPercent,
        },
        disk: {
          total: mainDisk.size,
          used: mainDisk.used,
          free: mainDisk.available,
          usedPercent: mainDisk.use,
        },
        network: netThroughput.map(n => ({
          iface: n.iface,
          operstate: n.operstate,
          rx_sec: n.rx_sec,
          tx_sec: n.tx_sec
        })),
        uptime: time.uptime,
        platform: `${os.platform} ${os.release}`,
      };
      // Get CPU load separately
      const load = await si.currentLoad();
      stats.cpu.usagePercent = load.currentLoad;
      res.json(stats);
    } catch (error) {
      console.error("Error fetching host stats:", error);
      res.status(500).json({ message: "Failed to fetch host stats" });
    }
  });

  // Proxy for VM Console
  app.use('/proxy/:port', (req, res, next) => {
    const port = req.params.port;
    return createProxyMiddleware({
      target: `http://127.0.0.1:${port}`,
      changeOrigin: true,
      ws: true,
      xfwd: true,
      pathRewrite: {
        [`^/proxy/${port}`]: '',
      },
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'websocket'
      },
      logger: console,
      on: {
        proxyReq: (proxyReq, req, res) => {
          // Replit/Proxy specific: ensure the host header is set correctly for the internal target
          proxyReq.setHeader('Host', '127.0.0.1');
          if (req.headers.upgrade === 'websocket') {
            proxyReq.setHeader('Connection', 'Upgrade');
            proxyReq.setHeader('Upgrade', 'websocket');
          }
        },
        proxyReqWs: (proxyReq, req, socket, options, head) => {
          // Explicitly handle WebSocket upgrade requests
          proxyReq.setHeader('Connection', 'Upgrade');
          proxyReq.setHeader('Upgrade', 'websocket');
          proxyReq.setHeader('Host', '127.0.0.1');
        },
        proxyRes: (proxyRes, req, res) => {
          // Ensure these headers are preserved in the response
          if (req.headers.upgrade === 'websocket' || proxyRes.headers['upgrade'] === 'websocket') {
            proxyRes.headers['connection'] = 'Upgrade';
            proxyRes.headers['upgrade'] = 'websocket';
          }
        },
        error: (err: any, req: any, res: any) => {
          console.error(`Proxy error for port ${port}:`, err);
          
          // Handle socket errors which don't have res.status
          if (res && typeof res.writeHead === 'function' && !res.headersSent) {
            try {
              res.writeHead(502);
              res.end('Proxy Error');
            } catch (e) {
              // Socket might be closed
            }
          }
        }
      }
    })(req, res, next);
  });

  // VM Routes
  app.get(api.vms.list.path, async (req, res) => {
    const vms = await storage.getVms();
    res.json(vms);
  });

  app.get(api.vms.get.path, async (req, res) => {
    const vm = await storage.getVm(Number(req.params.id));
    if (!vm) {
      return res.status(404).json({ message: 'VM not found' });
    }
    res.json(vm);
  });

  app.post(api.vms.create.path, async (req, res) => {
    try {
      // Validate with schema and ensure customPorts is handled
      const input = api.vms.create.input.parse(req.body);
      const { cloneFromId } = req.body;

      // Check for duplicate VM name
      const existingVm = await storage.getVmByName(input.name);
      if (existingVm) {
        return res.status(400).json({ message: `A VM with the name "${input.name}" already exists.` });
      }

      // Backend validation for host resources
      const [cpu, mem, diskSizes] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.fsSize()
      ]);

      const projectRoot = process.cwd();
      const isWinKvmManagerDir = projectRoot.endsWith('win-kvm-manager');
      const storageDir = isWinKvmManagerDir ? join(projectRoot, 'storage') : join(projectRoot, 'win-kvm-manager', 'storage');

      const mainDisk = diskSizes.find(d => storageDir === d.mount) || 
                       diskSizes.sort((a, b) => b.mount.length - a.mount.length)
                                .find(d => storageDir.startsWith(d.mount) || projectRoot.startsWith(d.mount)) || 
                       diskSizes[0] || { available: 0 };
      
      const parseToBytes = (s: string) => {
        const m = s.match(/^(\d+)([GM])$/i);
        if (!m) {
          if (/^\d+$/.test(s)) return parseInt(s) * 1024 * 1024 * 1024;
          return 0;
        }
        const n = parseInt(m[1]);
        return m[2].toUpperCase() === 'G' ? n * 1024 * 1024 * 1024 : n * 1024 * 1024;
      };

      if (input.cpuCores && input.cpuCores > cpu.cores) {
        return res.status(400).json({ message: `Insufficient CPU cores (available: ${cpu.cores})` });
      }

      // Memory validation: ensure RAM does not exceed host RAM
      if (input.ramSize) {
        const requestedRam = parseToBytes(input.ramSize);
        // Use mem.available instead of mem.free as it's more accurate (includes cache)
        if (requestedRam > mem.available) {
          return res.status(400).json({ message: `Insufficient RAM (available: ${Math.floor(mem.available / 1024 / 1024 / 1024)}GB free)` });
        }
      }

      // Disk size validation: check if smaller than source VM if cloning
      if (cloneFromId) {
        const sourceVm = await storage.getVm(Number(cloneFromId));
        if (sourceVm && input.diskSize) {
          const sourceSize = parseToBytes(sourceVm.diskSize);
          const requestedSize = parseToBytes(input.diskSize);
          if (requestedSize < sourceSize) {
            return res.status(400).json({ message: `Disk size must be at least the size of the source VM (${sourceVm.diskSize})` });
          }
        }
      }

      // Disk validation: ensure disk does not exceed host free space
      if (input.diskSize) {
        const requestedDisk = parseToBytes(input.diskSize);
        if (requestedDisk > mainDisk.available) {
          return res.status(400).json({ message: `Insufficient disk space (available: ${Math.floor(mainDisk.available / 1024 / 1024 / 1024)}GB free)` });
        }
      }

      // Port validation
      if (input.customPortsString) {
        const ports = input.customPortsString.split(',').map(p => p.trim());
        const allValid = ports.every(p => {
          const port = parseInt(p);
          return !isNaN(port) && port >= 1 && port <= 65535;
        });
        if (!allValid) {
          return res.status(400).json({ message: "Ports must be between 1 and 65535" });
        }
      }

      // Handle cloning if cloneFromId is provided
      if (cloneFromId) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const sendProgress = (percent: number, data?: any) => {
          res.write(`data: ${JSON.stringify({ percent, data })}\n\n`);
        };

        try {
          const vm = await storage.cloneVm(Number(cloneFromId), input, (percent) => {
            sendProgress(percent);
          });
          sendProgress(100, vm);
          return res.end();
        } catch (error: any) {
          console.error("Cloning error in route:", error);
          res.write(`data: ${JSON.stringify({ error: error.message || 'Unknown internal error during cloning' })}\n\n`);
          return res.end();
        }
      }

      const vm = await storage.createVm(input);
      res.status(201).json(vm);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.vms.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.vms.update.input.parse(req.body);
      
      const oldVm = await storage.getVm(id);
      if (!oldVm) {
        return res.status(404).json({ message: 'VM not found' });
      }

      // Backend validation for host resources (only if they are being updated)
      if (input.cpuCores || input.ramSize || input.diskSize) {
        const [cpu, mem, diskSizes] = await Promise.all([
          si.cpu(),
          si.mem(),
          si.fsSize()
        ]);

        const projectRoot = process.cwd();
        const isWinKvmManagerDir = projectRoot.endsWith('win-kvm-manager');
        const storageDir = isWinKvmManagerDir ? join(projectRoot, 'storage') : join(projectRoot, 'win-kvm-manager', 'storage');

        const mainDisk = diskSizes.find(d => storageDir === d.mount) || 
                         diskSizes.sort((a, b) => b.mount.length - a.mount.length)
                                  .find(d => storageDir.startsWith(d.mount) || projectRoot.startsWith(d.mount)) || 
                         diskSizes[0] || { available: 0 };
        
        const parseToBytes = (s: string) => {
          const m = s.match(/^(\d+)([GM])$/i);
          if (!m) {
            if (/^\d+$/.test(s)) return parseInt(s) * 1024 * 1024 * 1024;
            return 0;
          }
          const n = parseInt(m[1]);
          return m[2].toUpperCase() === 'G' ? n * 1024 * 1024 * 1024 : n * 1024 * 1024;
        };

        if (input.cpuCores && input.cpuCores > cpu.cores) {
          return res.status(400).json({ message: `Insufficient CPU cores (available: ${cpu.cores})` });
        }
        
        // When updating, we should account for the resources already assigned to this VM 
        // since the container is stopped/removed during update.
        if (input.ramSize) {
          const currentRamBytes = parseToBytes(oldVm.ramSize);
          const requestedRam = parseToBytes(input.ramSize);
          // Total available = Host Available RAM + RAM currently held by this VM
          if (requestedRam > (mem.available + currentRamBytes)) {
            const totalAvailableGb = Math.floor((mem.available + currentRamBytes) / 1024 / 1024 / 1024);
            return res.status(400).json({ message: `Insufficient RAM (total available for this VM: ${totalAvailableGb}GB)` });
          }
        }

        // Disk size validation for update: check if smaller than current size
        if (input.diskSize) {
          const currentDiskBytes = parseToBytes(oldVm.diskSize);
          const requestedSize = parseToBytes(input.diskSize);
          if (requestedSize < currentDiskBytes) {
            return res.status(400).json({ message: `Disk size cannot be smaller than current size (${oldVm.diskSize})` });
          }
          
          // Only check additional space if expanding
          const additionalNeeded = requestedSize - currentDiskBytes;
          if (additionalNeeded > mainDisk.available) {
            return res.status(400).json({ message: `Insufficient disk space for expansion (available: ${Math.floor(mainDisk.available / 1024 / 1024 / 1024)}GB free)` });
          }
        }

        // Port validation
        if (input.customPortsString) {
          const ports = input.customPortsString.split(',').map(p => p.trim());
          const allValid = ports.every(p => {
            const port = parseInt(p);
            return !isNaN(port) && port >= 1 && port <= 65535;
          });
          if (!allValid) {
            return res.status(400).json({ message: "Ports must be between 1 and 65535" });
          }
        }
      }

      const vm = await storage.updateVm(id, input);
      
      // Remove old container to ensure the next start uses the new configuration
      const containerName = oldVm.name;
      try {
        await execAsync(`docker rm -f ${containerName}`, { cwd: process.cwd() });
      } catch (e) {
        console.error(`Error removing container ${containerName} during update:`, e);
      }

      res.json(vm);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.vms.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    const vm = await storage.getVm(id);
    const containerName = vm?.name || `windows-vm-${id}`;
    
    // Stop and remove the docker container if it exists
    try {
      await execAsync(`docker stop ${containerName} && docker rm ${containerName}`, { cwd: process.cwd() });
    } catch (e) {
      // Ignore errors if container doesn't exist
    }

    await storage.deleteVm(id);
    res.status(204).send();
  });

  // System Paths Endpoint
  app.get("/api/system/paths", async (req, res) => {
    try {
      const { stdout } = await execAsync("find . -maxdepth 2 -type d 2>/dev/null | grep -v '^\\./node_modules' | grep -v '^\\./\\.git' | grep -v '^\\./win-kvm-manager' | head -n 100", { cwd: process.cwd() });
      const paths = stdout.split('\n')
        .filter(p => p.trim() !== '' && p !== '.')
        .map(p => p.replace(/^\.\//, ''));
      res.json(paths);
    } catch (error) {
      console.error("Error fetching paths:", error);
      res.status(500).json({ message: "Failed to fetch paths" });
    }
  });

  // VM Action Route
  app.post(api.vms.action.path, async (req, res) => {
    const id = Number(req.params.id);
    const { action } = req.body;
    
    const vm = await storage.getVm(id);
    if (!vm) {
      return res.status(404).json({ message: 'VM not found' });
    }

    const containerName = vm.name;

    try {
      if (action === 'start') {
        
        // Stop/remove existing container if any
        try {
          await execAsync(`docker stop ${containerName} && docker rm ${containerName}`, { cwd: process.cwd() });
        } catch (e) {}

        // Assign fixed random ports if not already set, to ensure they show up in UI
        const usedPorts = new Set<number>();
        const getHostPort = () => {
          let hostPort: number;
          do {
            hostPort = Math.floor(Math.random() * (65535 - 10000 + 1)) + 10000;
          } while (usedPorts.has(hostPort));
          usedPorts.add(hostPort);
          return hostPort;
        };

      const webHostPort = vm.webPort || getHostPort();
      const rdpHostPort = vm.rdpPort || getHostPort();

      // Update VM with assigned ports so frontend can show links
      if (!vm.webPort || !vm.rdpPort) {
        await storage.updateVm(id, {
          webPort: webHostPort,
          rdpPort: rdpHostPort,
          username: vm.username || 'bill',
          password: vm.password || 'gates'
        });
      }

      let command = vm.customCommand;
      
      // If we are using the template (no customCommand or it matches the template pattern)
      // we regenerate it to ensure custom ports are included.
      if (!command || command.includes('docker run')) {
        // First, check if the vm.customCommand already has the mappings we need
        // This is crucial because the frontend sends the generated command during creation
        
        const customPortMappings = (vm.customPorts || []).map((portStr) => {
          const port = parseInt(portStr);
          // Try to extract from the SAVED customCommand first
          const existingMappingMatch = vm.customCommand?.match(new RegExp(`-p (\\d+):${port}(?:\\s|$)`));
          
          if (existingMappingMatch) {
            return `-p ${existingMappingMatch[1]}:${port}`;
          }
          
          // Fallback to a default mapping if not found (shouldn't happen for new VMs if frontend sent it)
          return `-p ${Math.floor(Math.random() * (65535 - 10000 + 1)) + 10000}:${port}`;
        }).join(' ');

        const username = vm.username || 'bill';
        const password = vm.password || 'gates';
        const safeName = vm.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        // Use the webPort and rdpPort that were either sent during creation or generated
        command = `docker run -d --name ${containerName} ` +
          `-e "VERSION=${vm.version}" ` +
          `-e RAM_SIZE=${vm.ramSize} ` +
          `-e CPU_CORES=${vm.cpuCores} ` +
          `-e DISK_SIZE=${vm.diskSize} ` +
          `-e USERNAME="${username}" ` +
          `-e PASSWORD="${password}" ` +
          `-p ${webHostPort}:8006 ` +
          `-p ${rdpHostPort}:3389 ` +
          `${customPortMappings} ` +
          `--device=/dev/kvm --device=/dev/net/tun --cap-add NET_ADMIN ` +
          `-v "${vm.storagePath}:/storage" ` +
          `--stop-timeout 120 docker.io/dockurr/windows`;

        // CRITICAL: If the user provided a customCommand (which the frontend does), we MUST use it 
        // instead of the one we just generated, because the frontend generated command 
        // contains the EXACT same random ports it sent us in webPort/rdpPort/customPorts.
        if (vm.customCommand && vm.customCommand.includes('docker run')) {
          command = vm.customCommand;
          // Ensure it runs in background and has the correct name
          if (command.includes('-it')) command = command.replace('-it', '-d');
          if (!command.includes(`--name ${containerName}`)) {
            command = command.replace('docker run', `docker run --name ${containerName}`);
          }
        }
      }

      console.log(`Executing: ${command}`);
      try {
        const { stdout, stderr } = await execAsync(command, { cwd: process.cwd() });
        const output = stdout + stderr;
        await storage.updateVm(id, { 
          status: 'running',
          lastOutput: output
        });
      } catch (error: any) {
        await storage.updateVm(id, { 
          status: 'error',
          lastOutput: error.message
        });
        throw error;
      }
    } else if (action === 'stop') {
        try {
          // Use -t 0 for faster stop if needed, but default is safer
          await execAsync(`docker stop ${containerName}`, { cwd: process.cwd() });
        } catch (e: any) {
          console.error(`Error stopping container ${containerName}:`, e.message);
          // If container is already stopped or doesn't exist, we still want to update DB
        }
        await storage.updateVm(id, { status: 'stopped' });
      } else if (action === 'restart') {
        await execAsync(`docker restart ${containerName}`, { cwd: process.cwd() });
        await storage.updateVm(id, { status: 'running' });
      }

      const updatedVm = await storage.getVm(id);
      res.json(updatedVm);
    } catch (error: any) {
      console.error(`Action ${action} failed:`, error);
      res.status(500).json({ message: error.message || "Docker command failed" });
    }
  });

  // No seed data needed for production
  // seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existingVms = await storage.getVms();
  if (existingVms.length === 0) {
    await storage.createVm({
      name: "Windows 11 Dev",
      username: "bill",
      password: "gates",
      version: "11",
      ramSize: "8G",
      cpuCores: 4,
      diskSize: "128G",
      storagePath: "./win11-dev",
      status: "running",
      webPort: 8006,
      rdpPort: 3389
    });
    await storage.createVm({
      name: "Legacy XP",
      username: "bill",
      password: "gates",
      version: "xp",
      ramSize: "2G",
      cpuCores: 1,
      diskSize: "32G",
      storagePath: "./win-xp",
      status: "stopped",
      webPort: 8007,
      rdpPort: 3390
    });
  }
}
