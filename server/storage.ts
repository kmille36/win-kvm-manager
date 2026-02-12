import { type Vm, type InsertVm, type UpdateVmRequest } from "@shared/schema";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import path, { join } from "path";
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DATA_FILE = join(process.cwd(), "vms.json");

export interface IStorage {
  getVms(): Promise<Vm[]>;
  getVm(id: number): Promise<Vm | undefined>;
  getVmByName(name: string): Promise<Vm | undefined>;
  createVm(vm: InsertVm): Promise<Vm>;
  updateVm(id: number, vm: UpdateVmRequest): Promise<Vm>;
  deleteVm(id: number): Promise<void>;
}

export class JsonStorage implements IStorage {
  private vms: Map<number, Vm>;
  private nextId: number;

  constructor() {
    this.vms = new Map();
    this.nextId = 1;
    this.loadData();
    
    // Sync to file every 15 seconds
    setInterval(() => this.saveData(), 15000);
  }

  private loadData() {
    if (existsSync(DATA_FILE)) {
      try {
        const data = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
        data.forEach((vm: Vm) => {
          this.vms.set(vm.id, vm);
          if (vm.id >= this.nextId) {
            this.nextId = vm.id + 1;
          }
        });
      } catch (err) {
        console.error("Failed to load JSON database:", err);
      }
    }
  }

  private saveData() {
    try {
      const data = Array.from(this.vms.values());
      writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error("Failed to save JSON database:", err);
    }
  }

  async getVmByName(name: string): Promise<Vm | undefined> {
    const vms = Array.from(this.vms.values());
    console.log(`Checking duplicate for name: "${name}". Current VMs:`, vms.map(v => v.name));
    return vms.find(vm => vm.name.toLowerCase() === name.toLowerCase());
  }

  async getVms(): Promise<Vm[]> {
    return Array.from(this.vms.values());
  }

  async getVm(id: number): Promise<Vm | undefined> {
    return this.vms.get(id);
  }

  async createVm(insertVm: InsertVm): Promise<Vm> {
    const id = this.nextId++;
    
    // Create a safe directory name from VM name
    const safeName = insertVm.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // If user selected default or a specific path, we create a subfolder with VM name
    const projectRoot = process.cwd();
    const isWinKvmManagerDir = projectRoot.endsWith('win-kvm-manager');
    const storageDir = isWinKvmManagerDir ? join(projectRoot, 'storage') : join(projectRoot, 'win-kvm-manager', 'storage');

    const baseDir = (insertVm.storagePath === "./windows" || !insertVm.storagePath || insertVm.storagePath.startsWith("./"))
      ? storageDir
      : insertVm.storagePath;
      
    // Use the storagePath directly if it's already an absolute path within storageDir
    // otherwise join it with storageDir
    const storagePath = (insertVm.storagePath && path.isAbsolute(insertVm.storagePath) && insertVm.storagePath.startsWith(storageDir))
      ? insertVm.storagePath
      : join(storageDir, safeName);
    const normalizedStoragePath = path.resolve(storagePath);
    
    if (!existsSync(normalizedStoragePath)) {
      mkdirSync(normalizedStoragePath, { recursive: true });
    }

    const customPorts = insertVm.customPorts ?? [];
    const webHostPort = insertVm.webPort ?? 8006;
    const rdpHostPort = insertVm.rdpPort ?? 3389;

    const vm: Vm = {
      id,
      name: insertVm.name,
      version: insertVm.version ?? "11",
      ramSize: insertVm.ramSize ?? "4G",
      cpuCores: insertVm.cpuCores ?? 2,
      diskSize: insertVm.diskSize ?? "64G",
      storagePath: normalizedStoragePath,
      customCommand: insertVm.customCommand ?? null,
      status: insertVm.status ?? "stopped",
      webPort: webHostPort,
      rdpPort: rdpHostPort,
      customPorts: customPorts,
      customPortsString: insertVm.customPortsString ?? null,
      username: insertVm.username ?? "bill",
      password: insertVm.password ?? "gates",
      lastOutput: insertVm.lastOutput ?? null,
      createdAt: new Date()
    };
    this.vms.set(id, vm);
    this.saveData(); // Immediate save on change
    return vm;
  }

  async updateVm(id: number, updateVm: UpdateVmRequest): Promise<Vm> {
    const existing = this.vms.get(id);
    if (!existing) throw new Error("VM not found");
    
    const updated = { ...existing, ...updateVm };
    this.vms.set(id, updated);
    this.saveData();
    return updated;
  }

  async deleteVm(id: number): Promise<void> {
    const vm = this.vms.get(id);
    if (vm && existsSync(vm.storagePath)) {
      try {
        rmSync(vm.storagePath, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to delete storage path for VM ${id}:`, err);
      }
    }
    this.vms.delete(id);
    this.saveData();
  }

  async cloneVm(sourceVmId: number, insertVm: InsertVm, onProgress?: (percent: number) => void): Promise<Vm> {
    const sourceVm = this.vms.get(sourceVmId);
    if (!sourceVm) throw new Error("Source VM not found");

    const id = this.nextId++;
    const safeName = insertVm.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // If user selected default or a specific path, we create a subfolder with VM name
    const projectRoot = process.cwd();
    const isWinKvmManagerDir = projectRoot.endsWith('win-kvm-manager');
    const storageDir = isWinKvmManagerDir ? join(projectRoot, 'storage') : join(projectRoot, 'win-kvm-manager', 'storage');

    const baseDir = (insertVm.storagePath === "./windows" || !insertVm.storagePath || insertVm.storagePath.startsWith("./"))
      ? storageDir
      : insertVm.storagePath;
      
    // Use the storagePath directly if it's already an absolute path within storageDir
    // otherwise join it with storageDir
    const storagePath = (insertVm.storagePath && path.isAbsolute(insertVm.storagePath) && insertVm.storagePath.startsWith(storageDir))
      ? insertVm.storagePath
      : join(storageDir, safeName);
    let normalizedStoragePath = path.resolve(storagePath);

    // CRITICAL: Ensure we are not creating the new folder inside the source VM's folder
    // This happens if the user tries to clone into a subfolder of the source
    if (normalizedStoragePath.startsWith(sourceVm.storagePath + path.sep) || normalizedStoragePath === sourceVm.storagePath) {
      // Force it to be a sibling of the source VM directory instead
      normalizedStoragePath = join(path.dirname(sourceVm.storagePath), safeName);
    }
    
    // Ensure target directory exists
    if (!existsSync(normalizedStoragePath)) {
      mkdirSync(normalizedStoragePath, { recursive: true });
    }

    // Copy contents from source storage path to target storage path
    if (existsSync(sourceVm.storagePath)) {
      try {
        console.log(`Cloning storage from ${sourceVm.storagePath} to ${normalizedStoragePath}`);
        // Ensure we're not copying into ourselves
        if (normalizedStoragePath !== sourceVm.storagePath) {
          onProgress?.(10);
          // Use rsync if available for better progress or just a simple cp
          // For progress, we'll simulate it since cp -r doesn't give much
          const cpProcess = exec(`cp -rv "${sourceVm.storagePath}/." "${normalizedStoragePath}"`);
          
          if (cpProcess.stdout) {
            let lines = 0;
            cpProcess.stdout.on('data', () => {
              lines++;
              // Estimate progress based on lines (very rough)
              const progress = Math.min(90, 10 + Math.floor(lines / 10));
              onProgress?.(progress);
            });
          }

          await new Promise((resolve, reject) => {
            cpProcess.on('exit', (code: number) => {
              if (code === 0) resolve(null);
              else reject(new Error(`cp failed with code ${code}`));
            });
          });
          onProgress?.(100);
        }
      } catch (err) {
        console.error("Failed to copy VM files:", err);
        throw err;
      }
    }

    const customPorts = insertVm.customPorts ?? sourceVm.customPorts ?? [];
    const webHostPort = insertVm.webPort ?? 8006;
    const rdpHostPort = insertVm.rdpPort ?? 3389;

    let customCommand = insertVm.customCommand ?? sourceVm.customCommand;
    if (customCommand && customCommand.includes('-v "')) {
      customCommand = customCommand.replace(/-v "[^"]+:\/storage"/, `-v "${normalizedStoragePath}:/storage"`);
      customCommand = customCommand.replace(/--name [^\s]+/, `--name ${insertVm.name}`);
    }

    const vm: Vm = {
      id,
      name: insertVm.name,
      version: insertVm.version ?? sourceVm.version,
      ramSize: insertVm.ramSize ?? sourceVm.ramSize,
      cpuCores: insertVm.cpuCores ?? sourceVm.cpuCores,
      diskSize: insertVm.diskSize ?? sourceVm.diskSize,
      storagePath: normalizedStoragePath,
      customCommand: customCommand,
      status: "stopped",
      webPort: webHostPort,
      rdpPort: rdpHostPort,
      customPorts: customPorts,
      customPortsString: insertVm.customPortsString ?? sourceVm.customPortsString,
      username: insertVm.username ?? sourceVm.username,
      password: insertVm.password ?? sourceVm.password,
      lastOutput: null,
      createdAt: new Date()
    };
    
    this.vms.set(id, vm);
    this.saveData();
    return vm;
  }
}

export const storage = new JsonStorage();
