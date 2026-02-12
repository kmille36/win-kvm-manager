import { useHostStats } from "@/hooks/use-vms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cpu, HardDrive, MemoryStick, Clock, Network } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

function StatsCardSkeleton() {
  return <Skeleton className="h-[140px] w-full rounded-xl" />;
}

export function HostStatsCards() {
  const { data: stats, isLoading } = useHostStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map(i => <StatsCardSkeleton key={i} />)}
      </div>
    );
  }

  if (!stats) return null;

  // Format bytes for network
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format uptime
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h ${minutes}m`;
  };

  // Helper for mini charts
  const renderMiniChart = (percent: number, color: string) => {
    const data = [
      { name: 'Used', value: percent },
      { name: 'Free', value: 100 - percent },
    ];
    return (
      <div className="h-[50px] w-[50px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius={15}
              outerRadius={22}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill="var(--muted)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // Find primary network interface (the one with traffic or 'up' state)
  const primaryNet = stats.network?.find(n => n.operstate === 'up') || stats.network?.[0];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {/* CPU */}
      <Card className="bg-card/50 backdrop-blur border-white/5 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Processor</CardTitle>
          <Cpu className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-2xl font-bold font-mono-numbers">{stats.cpu.usagePercent.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground truncate max-w-[120px]" title={stats.cpu.model}>
                {stats.cpu.cores} Cores
              </p>
            </div>
            {renderMiniChart(stats.cpu.usagePercent, "hsl(var(--primary))")}
          </div>
        </CardContent>
      </Card>

      {/* RAM */}
      <Card className="bg-card/50 backdrop-blur border-white/5 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Memory</CardTitle>
          <MemoryStick className="h-4 w-4 text-purple-400" />
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-2xl font-bold font-mono-numbers">{stats.mem.usedPercent.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {(stats.mem.used / 1024 / 1024 / 1024).toFixed(1)} / {(stats.mem.total / 1024 / 1024 / 1024).toFixed(1)} GB
              </p>
            </div>
            {renderMiniChart(stats.mem.usedPercent, "#a78bfa")}
          </div>
        </CardContent>
      </Card>

      {/* Disk */}
      <Card className="bg-card/50 backdrop-blur border-white/5 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Storage</CardTitle>
          <HardDrive className="h-4 w-4 text-emerald-400" />
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-2xl font-bold font-mono-numbers">{stats.disk.usedPercent.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {(stats.disk.used / 1024 / 1024 / 1024).toFixed(1)} / {(stats.disk.total / 1024 / 1024 / 1024).toFixed(1)} GB
              </p>
            </div>
            {renderMiniChart(stats.disk.usedPercent, "#34d399")}
          </div>
        </CardContent>
      </Card>

      {/* Network */}
      <Card className="bg-card/50 backdrop-blur border-white/5 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Network</CardTitle>
          <Network className="h-4 w-4 text-blue-400" />
        </CardHeader>
        <CardContent>
          {primaryNet ? (
            <div className="space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-muted-foreground">Upload:</span>
                <span className="text-sm font-bold font-mono-numbers text-emerald-400">{formatBytes(primaryNet.tx_sec)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-muted-foreground">Download:</span>
                <span className="text-sm font-bold font-mono-numbers text-blue-400">{formatBytes(primaryNet.rx_sec)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground pt-1 truncate opacity-70">
                Interface: {primaryNet.iface}
              </p>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-2">No active interface</div>
          )}
        </CardContent>
      </Card>

      {/* Uptime */}
      <Card className="bg-card/50 backdrop-blur border-white/5 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">System Uptime</CardTitle>
          <Clock className="h-4 w-4 text-orange-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-mono-numbers">{formatUptime(stats.uptime)}</div>
          <p className="text-xs text-muted-foreground truncate" title={stats.platform}>
            {stats.platform}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
