import { Plus, RefreshCw, Server, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button, Card, CardContent } from '@renderer/components/ui';

export interface ServerStats {
  total: number;
  running: number;
  stopped: number;
  error: number;
}

export interface QuickActionsProps {
  stats: ServerStats;
  onAddServer: () => void;
  onRefresh: () => void;
}

export function QuickActions({
  stats,
  onAddServer,
  onRefresh,
}: QuickActionsProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Stats Cards */}
      <div className="flex flex-wrap gap-3">
        <StatCard
          icon={<Server className="h-4 w-4" />}
          label="Total"
          value={stats.total}
          variant="default"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Running"
          value={stats.running}
          variant="success"
        />
        <StatCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="Errors"
          value={stats.error}
          variant="error"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        <Button size="sm" onClick={onAddServer}>
          <Plus className="mr-2 h-4 w-4" />
          Add Server
        </Button>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  variant: 'default' | 'success' | 'error';
}

function StatCard({ icon, label, value, variant }: StatCardProps) {
  const variantClasses = {
    default: 'text-muted-foreground',
    success: 'text-green-600 dark:text-green-500',
    error: 'text-destructive',
  };

  return (
    <Card className="min-w-[100px]">
      <CardContent className="flex items-center gap-2 p-3">
        <span className={variantClasses[variant]}>{icon}</span>
        <div>
          <p className="text-lg font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
