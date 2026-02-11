import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import si from "systeminformation";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Host Stats Endpoint
  app.get(api.stats.host.path, async (req, res) => {
    try {
      const [cpu, mem, disk, time, os] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.fsSize(),
        si.time(),
        si.osInfo()
      ]);

      const mainDisk = disk[0] || { size: 0, used: 0, available: 0, use: 0 };

      const stats = {
        cpu: {
          cores: cpu.cores,
          usagePercent: 0, // Need to measure this or use currentLoad
          model: `${cpu.manufacturer} ${cpu.brand}`,
        },
        mem: {
          total: mem.total,
          free: mem.free,
          used: mem.used,
          usedPercent: (mem.used / mem.total) * 100,
        },
        disk: {
          total: mainDisk.size,
          used: mainDisk.used,
          free: mainDisk.available, // available is better than free for logic
          usedPercent: mainDisk.use,
        },
        uptime: time.uptime,
        platform: `${os.platform} ${os.release}`,
      };

      // Get CPU load separately as it might be async/different
      const load = await si.currentLoad();
      stats.cpu.usagePercent = load.currentLoad;

      res.json(stats);
    } catch (error) {
      console.error("Error fetching host stats:", error);
      res.status(500).json({ message: "Failed to fetch host stats" });
    }
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

      // Backend validation for host resources
      const [cpu, mem, disk] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.fsSize()
      ]);

      const mainDisk = disk[0] || { available: 0 };
      
      // Parse RAM/Disk strings to bytes (simplified helper)
      const parseToBytes = (s: string) => {
        const m = s.match(/^(\d+)([GM])$/i);
        if (!m) return 0;
        const n = parseInt(m[1]);
        return m[2].toUpperCase() === 'G' ? n * 1024 * 1024 * 1024 : n * 1024 * 1024;
      };

      if (input.cpuCores && input.cpuCores > cpu.cores) {
        return res.status(400).json({ message: `Insufficient CPU cores (available: ${cpu.cores})` });
      }
      if (input.ramSize && parseToBytes(input.ramSize) > mem.free) {
        return res.status(400).json({ message: `Insufficient RAM (available: ${Math.floor(mem.free / 1024 / 1024)}MB)` });
      }
      if (input.diskSize && parseToBytes(input.diskSize) > mainDisk.available) {
        return res.status(400).json({ message: `Insufficient disk space (available: ${Math.floor(mainDisk.available / 1024 / 1024)}MB)` });
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

      const vm = await storage.updateVm(id, input);
      
      // If the VM was running, we need to recreate the container to apply changes
      if (oldVm.status === 'running') {
        const containerName = `windows-vm-${id}`;
        
        // Stop and remove old container
        try {
          await execAsync(`docker stop ${containerName} && docker rm ${containerName}`);
        } catch (e) {
          console.error(`Error removing container ${containerName} during update:`, e);
        }

        try {
          const webHostPort = vm!.webPort || (Math.floor(Math.random() * 50000) + 10000);
          const rdpHostPort = vm!.rdpPort || (Math.floor(Math.random() * 50000) + 10000);
          
          let command = vm!.customCommand;
          if (!command) {
            command = `docker run -d --name ${containerName} ` +
              `-e "VERSION=${vm!.version}" ` +
              `-e RAM_SIZE=${vm!.ramSize} ` +
              `-e CPU_CORES=${vm!.cpuCores} ` +
              `-e DISK_SIZE=${vm!.diskSize} ` +
              `-e USERNAME="${vm!.username || 'bill'}" ` +
              `-e PASSWORD="${vm!.password || 'gates'}" ` +
              `-p ${webHostPort}:8006 ` +
              `-p ${rdpHostPort}:3389 ` +
              `--device=/dev/kvm --device=/dev/net/tun --cap-add NET_ADMIN ` +
              `-v "${vm!.storagePath}:/storage" ` +
              `--stop-timeout 120 docker.io/dockurr/windows`;
          } else {
             if (command.includes('-it')) command = command.replace('-it', '-d');
             if (!command.includes('--name')) {
               command = command.replace('docker run', `docker run --name ${containerName}`);
             }
          }
          
          await execAsync(command);
          await storage.updateVm(id, { status: 'running' });
        } catch (err) {
          console.error("Failed to auto-restart VM after config change:", err);
          await storage.updateVm(id, { status: 'error', lastOutput: String(err) });
        }
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
    const containerName = `windows-vm-${id}`;
    
    // Stop and remove the docker container if it exists
    try {
      await execAsync(`docker stop ${containerName} && docker rm ${containerName}`);
    } catch (e) {
      // Ignore errors if container doesn't exist
    }

    await storage.deleteVm(id);
    res.status(204).send();
  });

  // System Paths Endpoint
  app.get("/api/system/paths", async (req, res) => {
    try {
      const { stdout } = await execAsync("find / -maxdepth 2 -type d 2>/dev/null | grep -v '^/proc' | grep -v '^/sys' | grep -v '^/dev' | head -n 100");
      const paths = stdout.split('\n').filter(p => p.trim() !== '');
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

    try {
      if (action === 'start') {
        const containerName = `windows-vm-${id}`;
        
        // Stop/remove existing container if any
        try {
          await execAsync(`docker stop ${containerName} && docker rm ${containerName}`);
        } catch (e) {}

        // Assign fixed random ports if not already set, to ensure they show up in UI
        const usedPorts = new Set<number>();
        const getHostPort = () => {
          let hostPort: number;
          do {
            hostPort = Math.floor(Math.random() * (60000 - 10000 + 1)) + 10000;
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
            rdpPort: rdpHostPort
          });
        }

        let command = vm.customCommand;
        if (!command) {
          const customPortMappings = (vm.customPorts || []).map(portStr => {
            const port = parseInt(portStr);
            return `-p ${getHostPort()}:${port}`;
          }).join(' ');

          command = `docker run -d --name ${containerName} ` +
            `-e "VERSION=${vm.version}" ` +
            `-e RAM_SIZE=${vm.ramSize} ` +
            `-e CPU_CORES=${vm.cpuCores} ` +
            `-e DISK_SIZE=${vm.diskSize} ` +
            `-e USERNAME="${vm.username || 'bill'}" ` +
            `-e PASSWORD="${vm.password || 'gates'}" ` +
            `-p ${webHostPort}:8006 ` +
            `-p ${rdpHostPort}:3389 ` +
            `${customPortMappings} ` +
            `--device=/dev/kvm --device=/dev/net/tun --cap-add NET_ADMIN ` +
            `-v "${vm.storagePath}:/storage" ` +
            `--stop-timeout 120 docker.io/dockurr/windows`;
        } else {
          // Ensure it runs in background and has the correct name for tracking
          if (command.includes('-it')) command = command.replace('-it', '-d');
          if (!command.includes('--name')) {
            command = command.replace('docker run', `docker run --name ${containerName}`);
          }
        }

        console.log(`Executing: ${command}`);
        try {
          const { stdout, stderr } = await execAsync(command);
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
        const containerName = `windows-vm-${id}`;
        try {
          // Use -t 0 for faster stop if needed, but default is safer
          await execAsync(`docker stop ${containerName}`);
        } catch (e: any) {
          console.error(`Error stopping container ${containerName}:`, e.message);
          // If container is already stopped or doesn't exist, we still want to update DB
        }
        await storage.updateVm(id, { status: 'stopped' });
      } else if (action === 'restart') {
        const containerName = `windows-vm-${id}`;
        await execAsync(`docker restart ${containerName}`);
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
