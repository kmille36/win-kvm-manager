import { type Vm, type InsertVm, type UpdateVmRequest } from "@shared/schema";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

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

    const baseDir = (insertVm.storagePath === "./windows" || !insertVm.storagePath)
      ? storageDir
      : insertVm.storagePath;
      
    const storagePath = join(baseDir, safeName);
    
    if (!existsSync(storagePath)) {
      mkdirSync(storagePath, { recursive: true });
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
      storagePath: storagePath,
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
}

export const storage = new JsonStorage();
