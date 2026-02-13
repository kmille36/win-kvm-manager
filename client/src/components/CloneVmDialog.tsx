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

import { Progress } from "@/components/ui/progress";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
    }, { message: `Cannot exceed available host disk space (${Math.floor((hostStats?.disk.free || 0) / (1024 * 1024 * 1024))}GB free)` })
    .refine(val => {
      const currentDiskSize = parseToGB(vm.diskSize);
      return val >= currentDiskSize;
    }, { message: `Disk size must be at least the size of the source VM (${parseToGB(vm.diskSize)}GB)` }),
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

  const storagePreviewPath = (() => {
    const base = storageBasePath.replace('$(pwd)', '.');
    if (base.endsWith(vm.name)) {
      // If the base path ends with the original VM name, it's likely a subfolder
      // We want to replace the last segment with safeName
      const parts = base.split('/');
      parts[parts.length - 1] = safeName;
      return parts.join('/');
    }
    return `${base}/${safeName}`;
  })();

  const generatedCommand = `docker run -d --name ${watchAll.name || "windows"} -p ${randomPorts.web}:8006 -p ${randomPorts.rdp}:3389 ${customPortMappings} -e VERSION=${watchAll.version} -e RAM_SIZE=${watchAll.ramSize}G -e CPU_CORES=${watchAll.cpuCores} -e DISK_SIZE=${watchAll.diskSize}G -e USERNAME="${watchAll.username}" -e PASSWORD="${watchAll.password}" -v "${storageBasePath}/${safeName}:/storage" --device=/dev/kvm --device=/dev/net/tun --cap-add NET_ADMIN dockurr/windows`;

  useEffect(() => {
    form.setValue("customCommand", generatedCommand);
  }, [generatedCommand, form]);

  const [cloningProgress, setCloningProgress] = useState<number | null>(null);
  const [cloningError, setCloningError] = useState<string | null>(null);

  function onSubmit(values: z.infer<typeof formSchema>) {
    setCloningProgress(0);
    setCloningError(null);

    const payload = {
      ...values,
      ramSize: `${values.ramSize}G`,
      diskSize: `${values.diskSize}G`,
      webPort: randomPorts.web,
      rdpPort: randomPorts.rdp,
      customCommand: generatedCommand,
      customPorts: (values.customPortsString || "").split(',').map(p => p.trim()).filter(p => p && !isNaN(parseInt(p))),
      cloneFromId: vm.id
    };

    fetch('/api/vms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(async response => {
      if (!response.ok) {
        let errorMessage = 'Failed to start cloning';
        try {
          const err = await response.json();
          errorMessage = err.message || `Error ${response.status}: ${response.statusText}`;
        } catch (e) {
          errorMessage = `Error ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to read progress');

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          if (trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const { percent, data, error } = parsed;
              
              if (error) {
                throw new Error(error);
              }
              
              if (percent !== undefined) {
                setCloningProgress(percent);
              }
              
              if (data) {
                setOpen(false);
                setCloningProgress(null);
                form.reset();
                import('@/lib/queryClient').then(({ queryClient }) => {
                  queryClient.invalidateQueries({ queryKey: [api.vms.list.path] });
                });
                return;
              }
            } catch (e: any) {
              console.error("Error parsing SSE line:", trimmed, e);
              if (e.message) throw e;
            }
          }
        }
      }
    }).catch(err => {
      console.error("Cloning error:", err);
      setCloningError(err.message || 'An unexpected error occurred during cloning');
      setCloningProgress(null);
      // Ensure the dialog stays open if there's an error so the user can see it
      setOpen(true);
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

        {cloningProgress !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="w-full max-w-md p-6 bg-card border border-border rounded-lg shadow-lg space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Cloning Virtual Machine...
              </h3>
              <Progress value={cloningProgress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">
                Copying files: {cloningProgress}%
              </p>
            </div>
          </div>
        )}

        {cloningError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{cloningError}</AlertDescription>
          </Alert>
        )}

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
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          field.onChange(val);
                        }}
                      />
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
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          field.onChange(val);
                        }}
                      />
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
                      <Input 
                        placeholder="e.g. 80, 443, 8080" 
                        {...field} 
                        onChange={(e) => field.onChange(e.target.value.replace(/[^0-9,]/g, ''))}
                      />
                    </FormControl>
                    <FormDescription>Comma-separated ports to NAT (e.g. 80,443)</FormDescription>
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
                    value={storagePreviewPath} 
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
