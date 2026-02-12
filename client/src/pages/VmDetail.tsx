import { useVm, useVmAction, useDeleteVm, useUpdateVm } from "@/hooks/use-vms";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Play, Square, RefreshCw, Trash2, Monitor, Settings, HardDrive, Cpu, Save, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertVmSchema } from "@shared/schema";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function VmDetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <Skeleton className="h-12 w-1/3" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  );
}

export default function VmDetail() {
  const [, params] = useRoute("/vms/:id");
  const id = Number(params?.id);
  const { data: vm, isLoading } = useVm(id);
  const { mutate: performAction, isPending: isActionPending } = useVmAction();
  const { mutate: deleteVm, isPending: isDeletePending } = useDeleteVm();
  const updateVm = useUpdateVm();

  // Settings form
  const formSchema = insertVmSchema.pick({ ramSize: true, cpuCores: true, diskSize: true, customCommand: true, username: true, password: true, customPortsString: true });
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema.extend({ 
      cpuCores: z.coerce.number(), 
      ramSize: z.coerce.number(),
      diskSize: z.coerce.number(),
      customCommand: z.string().nullable(),
      username: z.string().min(1, "Username is required"),
      password: z.string().min(1, "Password is required"),
      customPortsString: z.string().optional().nullable()
    })),
    defaultValues: { ramSize: "4", cpuCores: 2, diskSize: "64", customCommand: "", username: "bill", password: "gates", customPortsString: "" }
  });

  // Hydrate form when data loads
  useEffect(() => {
    if (vm) {
      form.reset({
        ramSize: String(vm.ramSize).replace("G", "") || "4",
        cpuCores: vm.cpuCores,
        diskSize: String(vm.diskSize).replace("G", "") || "64",
        customCommand: vm.customCommand || "",
        username: vm.username || "bill",
        password: vm.password || "gates",
        customPortsString: vm.customPortsString || "",
      });
    }
  }, [vm, form]);

  const watchAll = form.watch();
  const rawRamSize = watchAll.ramSize || "";
  const rawDiskSize = watchAll.diskSize || "";
  const ramSize = /^\d+$/.test(rawRamSize) ? `${rawRamSize}G` : rawRamSize;
  const diskSize = /^\d+$/.test(rawDiskSize) ? `${rawDiskSize}G` : rawDiskSize;
  
  const customPorts = (watchAll.customPortsString || "").split(',').map(p => p.trim()).filter(p => p && !isNaN(parseInt(p)));
  const customPortMappings = customPorts.map((port, idx) => {
    // Try to extract existing host port from current customCommand if it exists
    const match = vm?.customCommand?.match(new RegExp(`-p (\\d+):${port}(?:\\s|$)`));
    if (match) {
      return `-p ${match[1]}:${port}`;
    }
    
    // Otherwise use stable random-like mapping for preview
    const hostPort = 10000 + (parseInt(port) * 7 % 89999);
    if (hostPort < 10000) return `-p ${hostPort + 10000}:${port}`;
    return `-p ${hostPort}:${port}`;
  }).join(' ');

  const generatedCommand = vm ? `docker run -d --name ${vm.name} -p ${vm.webPort}:8006 -p ${vm.rdpPort}:3389 ${customPortMappings} -e VERSION=${vm.version} -e RAM_SIZE=${ramSize} -e CPU_CORES=${watchAll.cpuCores} -e DISK_SIZE=${diskSize} -e USERNAME="${watchAll.username || "bill"}" -e PASSWORD="${watchAll.password || "gates"}" -v ${vm.storagePath}:/storage --device=/dev/kvm --device=/dev/net/tun --cap-add NET_ADMIN dockurr/windows` : "";

  useEffect(() => {
    const currentCommand = form.getValues('customCommand');
    if (vm && (!currentCommand || currentCommand.includes('--name'))) {
      form.setValue('customCommand', generatedCommand);
    }
  }, [generatedCommand, form, vm]);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  if (isLoading) return <VmDetailSkeleton />;
  if (!vm) return <div className="p-8 text-center">VM not found</div>;

  const isRunning = vm.status === "running";

  const handleAction = (action: 'start' | 'stop' | 'restart') => {
    performAction({ id, action });
  };

  const handleDelete = () => {
    deleteVm(id, { onSuccess: () => window.location.href = "/" });
  };

  const onUpdateSubmit = (values: z.infer<typeof formSchema>) => {
    // Ensure G is added automatically
    const ramSize = `${values.ramSize}G`;
    const diskSize = `${values.diskSize}G`;
    
    // Convert string back to array for storage
    const customPorts = (values.customPortsString || "").split(',').map(p => p.trim()).filter(p => p && !isNaN(parseInt(p)));
    
    updateVm.mutate({ 
      id, 
      ...values, 
      ramSize, 
      diskSize,
      customPorts 
    });
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Header */}
      <div className="bg-card border-b border-white/5 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-4 transition-colors">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Link>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 text-primary">
                <Monitor className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">{vm.name}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <StatusBadge status={vm.status || "stopped"} />
                  <span className="text-sm text-muted-foreground font-mono">ID: {vm.id}</span>
                  <span className="text-sm text-muted-foreground">Windows {vm.version}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={() => handleAction('start')}
                disabled={isRunning || isActionPending}
                className="hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30"
              >
                <Play className="mr-2 h-4 w-4" /> Start
              </Button>
              <Button 
                variant="outline" 
                onClick={() => handleAction('restart')}
                disabled={!isRunning || isActionPending}
                className="hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/30"
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Restart
              </Button>
              <Button 
                variant="outline" 
                onClick={() => handleAction('stop')}
                disabled={!isRunning || isActionPending}
                className="hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
              >
                <Square className="mr-2 h-4 w-4" /> Stop
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="console" className="space-y-6">
          <TabsList className="bg-card/50 border border-white/5">
            <TabsTrigger value="console">Console</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Console Tab */}
          <TabsContent value="console" className="space-y-4">
            <Card className="overflow-hidden border-white/5 bg-black/40">
              <div className="aspect-video w-full relative flex items-center justify-center bg-black">
                {isRunning ? (
                  <iframe 
                    src={`http://${window.location.hostname}:${vm.webPort}`} 
                    className="w-full h-full border-0"
                    title="VM Console"
                    allow="clipboard-read; clipboard-write"
                  />
                ) : (
                  <div className="text-center space-y-4">
                    <Monitor className="h-16 w-16 text-muted-foreground/30 mx-auto" />
                    <div className="space-y-1">
                      <h3 className="text-xl font-medium text-white/80">VM is Stopped</h3>
                      <p className="text-muted-foreground">Start the virtual machine to access the console.</p>
                    </div>
                    <Button onClick={() => handleAction('start')} className="mt-4">
                      <Play className="mr-2 h-4 w-4" /> Power On
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {vm.lastOutput && (
              <Card className="border-white/5 bg-black/60">
                <CardHeader className="py-3 px-4 border-b border-white/5">
                  <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Docker Output</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <pre className="p-4 text-xs font-mono text-emerald-500/90 overflow-auto max-h-[200px] whitespace-pre-wrap">
                    {vm.lastOutput}
                  </pre>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-col md:flex-row justify-between text-sm text-muted-foreground px-1 gap-2">
               <div className="flex flex-wrap gap-x-4 gap-y-1">
                 <span>RDP: <code className="bg-muted px-1 py-0.5 rounded text-primary">{window.location.hostname}:{vm.rdpPort}</code></span>
                 <span>Web: <a href={`http://${window.location.hostname}:${vm.webPort}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{window.location.hostname}:{vm.webPort}</a></span>
               </div>
            </div>
          </TabsContent>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Configuration Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Operating System</span>
                    <span className="font-medium">Windows {vm.version}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-muted-foreground">CPU Allocation</span>
                    <span className="font-medium font-mono">{vm.cpuCores} Cores</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Memory</span>
                    <span className="font-medium font-mono">{vm.ramSize}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Storage Path</span>
                    <span className="font-medium font-mono text-xs">{vm.storagePath}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Connection Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert className="bg-primary/10 border-primary/20 text-primary-foreground">
                    <Monitor className="h-4 w-4 stroke-primary" />
                    <AlertTitle className="text-primary font-bold">RDP Access</AlertTitle>
                    <AlertDescription className="text-primary/80">
                      Connect using any RDP client to port <span className="font-mono font-bold">{vm.rdpPort}</span>
                    </AlertDescription>
                  </Alert>
                  <div className="pt-4 space-y-2">
                    <p className="text-sm text-muted-foreground">Default Credentials (if fresh install):</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-3 bg-secondary rounded border border-white/5">
                        <span className="block text-xs text-muted-foreground uppercase mb-1">Username</span>
                        <code className="text-primary">{vm.username || "bill"}</code>
                      </div>
                      <div className="p-3 bg-secondary rounded border border-white/5">
                        <span className="block text-xs text-muted-foreground uppercase mb-1">Password</span>
                        <code className="text-primary">{vm.password || "gates"}</code>
                      </div>
                    </div>
                  </div>

                  {/* Custom Port Mappings */}
                  {vm.customPorts && vm.customPorts.length > 0 && (
                    <div className="pt-4 space-y-2">
                      <p className="text-sm text-muted-foreground">Custom Port NAT Mappings:</p>
                      <div className="grid grid-cols-1 gap-2 text-sm">
                        {vm.customPorts.map((port) => {
                          // Extract host port from customCommand
                          const match = vm.customCommand?.match(new RegExp(`-p (\\d+):${port}(?:\\s|$)`));
                          const hostPort = match ? match[1] : "??";
                          return (
                            <div key={port} className="p-3 bg-secondary rounded border border-white/5 flex justify-between items-center">
                              <div>
                                <span className="text-xs text-muted-foreground uppercase mr-2">Host Port</span>
                                <code className="text-primary font-bold">{hostPort}</code>
                              </div>
                              <div className="text-muted-foreground">→</div>
                              <div>
                                <span className="text-xs text-muted-foreground uppercase mr-2">VM Port</span>
                                <code className="text-blue-400 font-bold">{port}</code>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Resource Configuration
                    </CardTitle>
                    <CardDescription>
                      Adjust CPU, RAM, and Disk allocation. Restart required for changes to take effect.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onUpdateSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="cpuCores"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>CPU Cores</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Cpu className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input type="number" className="pl-9" {...field} />
                                  </div>
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
                                <FormLabel>Memory (GB)</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Settings className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input type="number" className="pl-9" {...field} />
                                  </div>
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
                                  <div className="relative">
                                    <HardDrive className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input type="number" className="pl-9" {...field} />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="username"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Username</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Monitor className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input className="pl-9" {...field} value={field.value || ""} />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Settings className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input type="password" className="pl-9" {...field} value={field.value || ""} />
                                  </div>
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
                                  <div className="relative">
                                    <HardDrive className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="e.g. 80, 443" className="pl-9" {...field} value={field.value || ""} />
                                  </div>
                                </FormControl>
                                <FormDescription>Comma-separated ports to NAT (e.g. 80, 443)</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                          <FormField
                            control={form.control}
                            name="customCommand"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Custom Docker Command (Generated)</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Monitor className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <textarea 
                                      className="flex min-h-[120px] w-full rounded-md border border-input bg-muted/50 px-9 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-none"
                                      readOnly
                                      {...field}
                                      value={field.value || ""}
                                    />
                                  </div>
                                </FormControl>
                                <FormDescription>
                                  This is the generated command that will be used to run the VM.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                        <div className="flex justify-end pt-4">
                          <Button type="submit" disabled={updateVm.isPending || isRunning}>
                            {updateVm.isPending ? "Saving..." : isRunning ? <><Settings className="mr-2 h-4 w-4" /> Stop VM to Save</> : <><Save className="mr-2 h-4 w-4" /> Save Changes</>}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </div>

              <div>
                <Card className="border-red-900/20 bg-red-900/5">
                  <CardHeader>
                    <CardTitle className="text-red-400">Danger Zone</CardTitle>
                    <CardDescription>Irreversible actions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      Deleting this VM will remove the database entry. The underlying storage files may need manual cleanup depending on configuration.
                    </p>
                    
                    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="destructive" 
                          className="w-full" 
                          disabled={isDeletePending || isRunning}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> 
                          {isRunning ? "Stop VM to Delete" : "Delete Virtual Machine"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="border-red-900/50 bg-card">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2 text-red-500">
                            <AlertTriangle className="h-5 w-5" />
                            Are you absolutely sure?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the 
                            <span className="font-bold text-white px-1">"{vm.name}"</span> virtual machine 
                            and remove all its configuration.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={handleDelete}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            {isDeletePending ? "Deleting..." : "Yes, delete VM"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
