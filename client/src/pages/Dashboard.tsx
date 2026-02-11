import { useVms } from "@/hooks/use-vms";
import { HostStatsCards } from "@/components/HostStatsCards";
import { VmCard } from "@/components/VmCard";
import { CreateVmDialog } from "@/components/CreateVmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Server } from "lucide-react";

export default function Dashboard() {
  const { data: vms, isLoading } = useVms();

  return (
    <div className="min-h-screen bg-background text-foreground pb-12">
      {/* Header */}
      <header className="border-b border-white/5 bg-card/20 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/25">
              <Server className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
              WinKVM <span className="font-light text-primary">Manager</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded border border-white/5 font-mono">
              v1.2.0-stable
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Host Stats */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white/90">Host Resources</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              System Online
            </div>
          </div>
          <HostStatsCards />
        </section>

        {/* VMs */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white/90">Virtual Machines</h2>
            <CreateVmDialog />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[200px] rounded-xl bg-card/50" />
              ))}
            </div>
          ) : vms && vms.length > 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {vms.map((vm) => (
                <VmCard key={vm.id} vm={vm} />
              ))}
            </motion.div>
          ) : (
            <div className="text-center py-20 border border-dashed border-white/10 rounded-xl bg-card/20">
              <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-white">No VMs Found</h3>
              <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                Get started by provisioning your first Windows virtual machine instance.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
