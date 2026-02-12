import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertVmSchema, type HostStatsResponse, type Vm } from "@shared/schema";
import { useCreateVm } from "@/hooks/use-vms";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Monitor, Loader2 } from "lucide-react";
import { z } from "zod";

const WINDOWS_VERSIONS = [
  { value: "11", label: "Windows 11 Pro (7.2 GB)" },
  { value: "11l", label: "Windows 11 LTSC (4.7 GB)" },
  { value: "11e", label: "Windows 11 Enterprise (6.6 GB)" },
  { value: "10", label: "Windows 10 Pro (5.7 GB)" },
  { value: "10l", label: "Windows 10 LTSC (4.6 GB)" },
  { value: "10e", label: "Windows 10 Enterprise (5.2 GB)" },
  { value: "8e", label: "Windows 8.1 Enterprise (3.7 GB)" },
  { value: "7u", label: "Windows 7 Ultimate (3.1 GB)" },
  { value: "vu", label: "Windows Vista Ultimate (3.0 GB)" },
  { value: "xp", label: "Windows XP Professional (0.6 GB)" },
  { value: "2k", label: "Windows 2000 Professional (0.4 GB)" },
  { value: "2025", label: "Windows Server 2025 (6.7 GB)" },
  { value: "2022", label: "Windows Server 2022 (6.0 GB)" },
  { value: "2019", label: "Windows Server 2019 (5.3 GB)" },
  { value: "2016", label: "Windows Server 2016 (6.5 GB)" },
  { value: "2012", label: "Windows Server 2012 (4.3 GB)" },
  { value: "2008", label: "Windows Server 2008 (3.0 GB)" },
  { value: "2003", label: "Windows Server 2003 (0.6 GB)" },
];

interface CloneVmDialogProps {
  vm: Vm;
  children: React.ReactNode;
}

export function CloneVmDialog({ vm, children }: CloneVmDialogProps) {
  const [open, setOpen] = useState(false);
  const createVm = useCreateVm();

  const { data: hostStats } = useQuery<HostStatsResponse>({
    queryKey: [api.stats.host.path],
  });

  const { data: paths = [] } = useQuery<string[]>({
    queryKey: [api.system.paths.path],
  });

  // Helper to parse RAM/Disk strings to GB
  const parseToGB = (s: string) => {
    const m = s.match(/^(\d+)([GM])$/i);
    if (!m) return 4;
    const n = parseInt(m[1]);
    return m[2].toUpperCase() === 'G' ? n : Math.ceil(n / 1024);
  };

  const formSchema = insertVmSchema.extend({
    name: z.string()
      .min(2, "Name must be at least 2 characters")
      .regex(/^[a-zA-Z0-9-]+$/, "Name can only contain letters, numbers, and hyphens"),
    cpuCores: z.coerce.number().min(1).refine(val => {
      if (!hostStats) return true;
      return val <= hostStats.cpu.cores;
    }, { message: `Cannot exceed host CPU cores (${hostStats?.cpu.cores || 'loading...'})` }),
    ramSize: z.coerce.number().min(1).refine(val => {
      if (!hostStats) return true;
      const requested = val * 1024 * 1024 * 1024;
      return requested <= hostStats.mem.free;
    }, { message: `Cannot exceed available host RAM (${Math.floor((hostStats?.mem.free || 0) / (1024 * 1024 * 1024))}GB free)` }),
    diskSize: z.coerce.number().min(1).refine(val => {
      if (!hostStats) return true;
      const requested = val * 1024 * 1024 * 1024;
      return requested <= hostStats.disk.free;
    }, { message: `Cannot exceed available host disk space (${Math.floor((hostStats?.disk.free || 0) / (1024 * 1024 * 1024))}GB free)` }),
    customCommand: z.string().nullable().optional(),
    customPortsString: z.string().optional().refine(val => {
      if (!val) return true;
      const ports = val.split(',').map(p => p.trim());
      return ports.every(p => !isNaN(parseInt(p)) && parseInt(p) >= 1 && parseInt(p) <= 65535);
    }, { message: "Ports must be between 1 and 65535" }),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: `${vm.name}-clone`,
      version: vm.version,
      ramSize: parseToGB(vm.ramSize),
      cpuCores: vm.cpuCores,
      diskSize: parseToGB(vm.diskSize),
      storagePath: vm.storagePath,
      status: "stopped",
      customCommand: "",
      customPortsString: vm.customPortsString || "",
      customPorts: vm.customPorts || [],
      username: vm.username || "bill",
      password: vm.password || "gates",
    },
  });

  const watchAll = form.watch();

  // Update customPorts array whenever customPortsString changes
  useEffect(() => {
    const ports = watchAll.customPortsString
      ? watchAll.customPortsString.split(',').map(p => p.trim()).filter(p => p && !isNaN(parseInt(p)))
      : [];
    form.setValue('customPorts', ports);
  }, [watchAll.customPortsString, form]);

  const [randomPorts, setRandomPorts] = useState(() => ({
    web: Math.floor(10000 + Math.random() * (65535 - 10000 + 1)),
    rdp: Math.floor(10000 + Math.random() * (65535 - 10000 + 1)),
    custom: Array.from({ length: 20 }, () => Math.floor(10000 + Math.random() * (65535 - 10000 + 1)))
  }));

  const refreshRandomPorts = () => {
    setRandomPorts({
      web: Math.floor(10000 + Math.random() * (65535 - 10000 + 1)),
      rdp: Math.floor(10000 + Math.random() * (65535 - 10000 + 1)),
      custom: Array.from({ length: 20 }, () => Math.floor(10000 + Math.random() * (65535 - 10000 + 1)))
    });
  };

  useEffect(() => {
    if (open) {
      refreshRandomPorts();
    }
  }, [open]);

  const customPortMappings = (watchAll.customPorts || []).map((port, idx) => {
    const hostPort = randomPorts.custom[idx % randomPorts.custom.length];
    return `-p ${hostPort}:${port}`;
  }).join(' ');

  const safeName = (watchAll.name || "windows").toLowerCase().replace(/[^a-z0-9]/g, '-');
  const storageBasePath = (watchAll.storagePath === "./windows" || !watchAll.storagePath) ? "$(pwd)/storage" : watchAll.storagePath;
  
  const generatedCommand = `docker run -d --name ${watchAll.name || "windows"} -p ${randomPorts.web}:8006 -p ${randomPorts.rdp}:3389 ${customPortMappings} -e VERSION=${watchAll.version} -e RAM_SIZE=${watchAll.ramSize}G -e CPU_CORES=${watchAll.cpuCores} -e DISK_SIZE=${watchAll.diskSize}G -e USERNAME="${watchAll.username}" -e PASSWORD="${watchAll.password}" -v "${storageBasePath}/${safeName}:/storage" --device=/dev/kvm --device=/dev/net/tun --cap-add NET_ADMIN dockurr/windows`;

  useEffect(() => {
    form.setValue("customCommand", generatedCommand);
  }, [generatedCommand, form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    createVm.mutate({
      ...values,
      ramSize: `${values.ramSize}G`,
      diskSize: `${values.diskSize}G`,
      webPort: randomPorts.web,
      rdpPort: randomPorts.rdp,
      customCommand: generatedCommand,
      customPorts: (values.customPortsString || "").split(',').map(p => p.trim()).filter(p => p && !isNaN(parseInt(p))),
      // Pass cloneFromId to tell backend to copy folder
      cloneFromId: vm.id
    } as any, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            Clone Virtual Machine
          </DialogTitle>
          <DialogDescription>
            Configure your cloned instance. This will copy the storage from "{vm.name}".
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VM Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Win11-Clone" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cpuCores"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPU Cores</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ramSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RAM Size (GB)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="diskSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Disk Size (GB)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customPortsString"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Custom Open Ports</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 80, 443, 8080" {...field} />
                    </FormControl>
                    <FormDescription>Comma-separated ports to NAT (e.g. 80, 443)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Storage Path */}
              <FormItem className="md:col-span-2">
                <FormLabel>Storage Path (On Host)</FormLabel>
                <FormControl>
                  <Input 
                    readOnly 
                    className="bg-muted/50 font-mono text-xs" 
                    value={`${storageBasePath.replace('$(pwd)', '.')}/${safeName}`} 
                  />
                </FormControl>
                <FormDescription>The absolute path where VM disk files will be stored</FormDescription>
              </FormItem>
            </div>

            <FormField
              control={form.control}
              name="customCommand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Docker Command (Generated)</FormLabel>
                  <FormControl>
                    <textarea 
                      className="flex min-h-[100px] w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-0 font-mono resize-none"
                      readOnly
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormDescription>
                    This is the final command that will be executed on the host.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createVm.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {createVm.isPending ? "Cloning..." : "Clone Instance"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
