import { useHostStats } from "@/hooks/use-vms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cpu, HardDrive, MemoryStick, Clock } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

function StatsCardSkeleton() {
  return <Skeleton className="h-[140px] w-full rounded-xl" />;
}

export function HostStatsCards() {
  const { data: stats, isLoading } = useHostStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <StatsCardSkeleton key={i} />)}
      </div>
    );
  }

  if (!stats) return null;

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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                {(stats.disk.free / 1024 / 1024 / 1024).toFixed(0)} GB Free
              </p>
            </div>
            {renderMiniChart(stats.disk.usedPercent, "#34d399")}
          </div>
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
