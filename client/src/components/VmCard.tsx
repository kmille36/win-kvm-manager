import { Vm } from "@shared/schema";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { Cpu, HardDrive, MemoryStick, Play, Square, Settings, Trash2, Copy } from "lucide-react";
import { Link } from "wouter";
import { useVmAction, useDeleteVm } from "@/hooks/use-vms";
import { CloneVmDialog } from "./CloneVmDialog";
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

interface VmCardProps {
  vm: Vm;
}

export function VmCard({ vm }: VmCardProps) {
  const { mutate: performAction, isPending: isActionPending } = useVmAction();
  const { mutate: deleteVm, isPending: isDeletePending } = useDeleteVm();

  return (
    <Card className="group overflow-hidden bg-card/50 backdrop-blur border-white/5 hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-secondary/30 border-b border-white/5">
        <div className="font-semibold text-lg tracking-tight group-hover:text-primary transition-colors">
          {vm.name}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={vm.status || "stopped"} />
          
          <CloneVmDialog vm={vm}>
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
              disabled={vm.status !== "stopped"}
              title={vm.status !== "stopped" ? "Stop VM to clone" : "Clone VM"}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </CloneVmDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                disabled={isDeletePending || vm.status === "running"}
                title={vm.status === "running" ? "Stop VM to delete" : "Delete VM"}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the virtual machine "{vm.name}" and remove all associated data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => deleteVm(vm.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Cpu className="h-4 w-4 text-primary/70" />
            <span className="font-mono-numbers">{vm.cpuCores} Cores</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MemoryStick className="h-4 w-4 text-purple-400/70" />
            <span className="font-mono-numbers">{vm.ramSize}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <HardDrive className="h-4 w-4 text-emerald-400/70" />
            <span className="font-mono-numbers">{vm.diskSize}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="h-4 w-4 flex items-center justify-center font-bold text-xs bg-white/10 rounded">W</span>
            <span>Win {vm.version}</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-2 gap-2">
        <Link href={`/vms/${vm.id}`} className="flex-1">
          <Button variant="outline" className="w-full hover:bg-secondary hover:text-white border-white/10">
            <Settings className="h-4 w-4 mr-2" />
            Manage
          </Button>
        </Link>
        
        {vm.status === "stopped" ? (
          <Button 
            size="icon" 
            variant="ghost" 
            className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
            onClick={() => performAction({ id: vm.id, action: "start" })}
            disabled={isActionPending}
          >
            <Play className="h-4 w-4 fill-current" />
          </Button>
        ) : (
          <Button 
            size="icon" 
            variant="ghost" 
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={() => performAction({ id: vm.id, action: "stop" })}
            disabled={isActionPending}
          >
            <Square className="h-4 w-4 fill-current" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
