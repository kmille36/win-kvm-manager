import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertVmSchema, type HostStatsResponse } from "@shared/schema";
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
import { Plus, Monitor, Loader2 } from "lucide-react";
import { z } from "zod";

const WINDOWS_VERSIONS = [
  { value: "11", label: "Windows 11" },
  { value: "10", label: "Windows 10" },
  { value: "8.1", label: "Windows 8.1" },
  { value: "7", label: "Windows 7" },
  { value: "2022", label: "Server 2022" },
  { value: "2019", label: "Server 2019" },
  { value: "xp", label: "Windows XP" },
];

export function CreateVmDialog() {
  const [open, setOpen] = useState(false);
  const createVm = useCreateVm();

  const { data: hostStats } = useQuery<HostStatsResponse>({
    queryKey: [api.stats.host.path],
  });

  const { data: paths = [] } = useQuery<string[]>({
    queryKey: [api.system.paths.path],
  });

  // Helper to parse sizes like "4G", "512M" to bytes
  const parseSizeToBytes = (size: string) => {
    const match = size.match(/^(\d+)([GM])$/i);
    if (!match) return 0;
    const num = parseInt(match[1]);
    const unit = match[2].toUpperCase();
    return unit === 'G' ? num * 1024 * 1024 * 1024 : num * 1024 * 1024;
  };

  // Extend the base schema to coerce numbers from string inputs
  const formSchema = insertVmSchema.extend({
    name: z.string()
      .min(1, "VM name is required")
      .regex(/^[a-zA-Z0-9-]+$/, "Name can only contain letters, numbers, and hyphens (no spaces or special characters)"),
    cpuCores: z.coerce.number().min(1).refine(val => {
      if (!hostStats) return true;
      return val <= hostStats.cpu.cores;
    }, { message: `Cannot exceed host CPU cores (${hostStats?.cpu.cores || 'loading...'})` }),
    ramSize: z.string().refine(val => {
      if (!hostStats) return true;
      const requested = parseSizeToBytes(val);
      return requested <= hostStats.mem.free;
    }, { message: `Cannot exceed available host RAM (${Math.floor((hostStats?.mem.free || 0) / (1024 * 1024 * 1024))}GB free)` }),
    diskSize: z.string().refine(val => {
      if (!hostStats) return true;
      const requested = parseSizeToBytes(val);
      return requested <= hostStats.disk.free;
    }, { message: `Cannot exceed available host disk space (${Math.floor((hostStats?.disk.free || 0) / (1024 * 1024 * 1024))}GB free)` }),
    customCommand: z.string().nullable().optional(),
    customPortsString: z.string().optional(),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      version: "11",
      ramSize: "4G",
      cpuCores: 2,
      diskSize: "64G",
      storagePath: "./windows",
      status: "stopped",
      webPort: 8006,
      rdpPort: 3389,
      customCommand: "",
      customPortsString: "",
      customPorts: [],
      username: "bill",
      password: "gates",
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

  const [randomPorts] = useState({
    web: Math.floor(10000 + Math.random() * 50000),
    rdp: Math.floor(10000 + Math.random() * 50000),
    custom: Array.from({ length: 20 }, () => Math.floor(10000 + Math.random() * 50000))
  });

  const customPortMappings = (watchAll.customPorts || []).map((port, idx) => `-p ${randomPorts.custom[idx]}:${port}`).join(' ');
  const safeName = (watchAll.name || "windows").toLowerCase().replace(/[^a-z0-9]/g, '-');
  const storageBasePath = (watchAll.storagePath === "./windows" || !watchAll.storagePath) ? "$(pwd)/storage" : watchAll.storagePath;
  const generatedCommand = `docker run -d --name ${watchAll.name || "windows"} -p ${randomPorts.web}:8006 -p ${randomPorts.rdp}:3389 ${customPortMappings} -e VERSION=${watchAll.version} -e RAM_SIZE=${watchAll.ramSize} -e CPU_CORES=${watchAll.cpuCores} -e DISK_SIZE=${watchAll.diskSize} -e USERNAME="${watchAll.username || 'bill'}" -e PASSWORD="${watchAll.password || 'gates'}" -v "${storageBasePath}/${safeName}:/storage" --device=/dev/kvm --cap-add NET_ADMIN dockurr/windows`;

  function onSubmit(values: z.infer<typeof formSchema>) {
    // Inject the random ports into the submission
    createVm.mutate({
      ...values,
      webPort: randomPorts.web,
      rdpPort: randomPorts.rdp
    }, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
          <Plus className="mr-2 h-4 w-4" />
          Create VM
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] bg-card/95 backdrop-blur border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            Provision Virtual Machine
          </DialogTitle>
          <DialogDescription>
            Configure your new Windows instance. Ensure host resources are available.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VM Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Win11-Gaming" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Version */}
              <FormField
                control={form.control}
                name="version"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Windows Version</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select OS" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {WINDOWS_VERSIONS.map((v) => (
                          <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* CPU */}
              <FormField
                control={form.control}
                name="cpuCores"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPU Cores</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={32} {...field} />
                    </FormControl>
                    <FormDescription>Physical cores to allocate</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* RAM */}
              <FormField
                control={form.control}
                name="ramSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RAM Size</FormLabel>
                    <FormControl>
                      <Input placeholder="4G" {...field} />
                    </FormControl>
                    <FormDescription>Format: 4G, 8G, 512M</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Disk Size */}
              <FormField
                control={form.control}
                name="diskSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Disk Size</FormLabel>
                    <FormControl>
                      <Input placeholder="64G" {...field} />
                    </FormControl>
                    <FormDescription>Allocated C: drive space</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Storage Path */}
              <FormField
                control={form.control}
                name="storagePath"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Storage Path</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-storage-path">
                          <SelectValue placeholder="Select path" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="./windows">Default (./windows)</SelectItem>
                        {paths.map((path) => (
                          <SelectItem key={path} value={path}>
                            {path}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Container volume path</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Custom Ports */}
              <FormField
                control={form.control}
                name="customPortsString"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom Open Ports</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 80, 443, 8080" {...field} />
                    </FormControl>
                    <FormDescription>Comma-separated ports to NAT (e.g. 80, 443)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Username */}
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="bill" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormDescription>Windows user account name</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Password */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="gates" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormDescription>Windows user password</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </div>

            {/* Custom Command */}
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
                {createVm.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...
                  </>
                ) : (
                  "Create Instance"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
