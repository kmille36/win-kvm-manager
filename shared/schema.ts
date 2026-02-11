import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===
export const vms = pgTable("vms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull().default("11"),
  ramSize: text("ram_size").notNull().default("4G"),
  cpuCores: integer("cpu_cores").notNull().default(2),
  diskSize: text("disk_size").notNull().default("64G"),
  storagePath: text("storage_path").notNull().default("./windows"),
  customCommand: text("custom_command"), // Added for editable command
  status: text("status", { enum: ["running", "stopped", "installing", "error"] }).default("stopped"),
  webPort: integer("web_port").default(8006),
  rdpPort: integer("rdp_port").default(3389),
  customPorts: text("custom_ports").array(), // Added for custom port NAT
  username: text("username").default("bill"), // Added for docker run env
  password: text("password").default("gates"), // Added for docker run env
  lastOutput: text("last_output"), // Added to store docker run output
  createdAt: timestamp("created_at").defaultNow(),
});

// === BASE SCHEMAS ===
export const insertVmSchema = createInsertSchema(vms, {
  name: z.string().min(2, "Name must be at least 2 characters").regex(/^[a-zA-Z0-9-]+$/, "Name can only contain letters, numbers, and hyphens"),
}).omit({ id: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===
export type Vm = typeof vms.$inferSelect;
export type InsertVm = z.infer<typeof insertVmSchema>;

export type CreateVmRequest = InsertVm;
export type UpdateVmRequest = Partial<InsertVm>;

export type VmResponse = Vm;

// Host Stats Types
export interface HostStats {
  cpu: {
    cores: number;
    usagePercent: number;
    model: string;
  };
  mem: {
    total: number;
    free: number;
    used: number;
    usedPercent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usedPercent: number;
  };
  uptime: number;
  platform: string;
}

export type HostStatsResponse = HostStats;
