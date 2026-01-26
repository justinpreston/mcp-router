import { useState, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
  Button,
  Badge,
} from '@renderer/components/ui';
import { Search, Download, Trash2 } from 'lucide-react';
import { LogEntry } from './LogEntry';
import { ActivityHeatmap } from './ActivityHeatmap';

export interface LogItem {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  serverId?: string;
  serverName?: string;
  metadata?: Record<string, unknown>;
}

export interface LogViewerProps {
  logs?: LogItem[];
  onExport?: (format: 'json' | 'csv') => void;
  onClear?: () => void;
}

export function LogViewer({ logs = [], onExport, onClear }: LogViewerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [serverFilter, setServerFilter] = useState<string>('all');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{
    hour: number;
    day: number;
  } | null>(null);

  // Get unique servers from logs
  const servers = useMemo(() => {
    const serverSet = new Set<string>();
    logs.forEach((log) => {
      if (log.serverName) {
        serverSet.add(log.serverName);
      }
    });
    return Array.from(serverSet);
  }, [logs]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Search filter
      const matchesSearch =
        searchQuery === '' ||
        log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.serverName?.toLowerCase().includes(searchQuery.toLowerCase());

      // Level filter
      const matchesLevel = levelFilter === 'all' || log.level === levelFilter;

      // Server filter
      const matchesServer =
        serverFilter === 'all' || log.serverName === serverFilter;

      // Time slot filter
      let matchesTimeSlot = true;
      if (selectedTimeSlot) {
        const date = new Date(log.timestamp);
        const hour = date.getHours();
        const day = date.getDay();
        matchesTimeSlot =
          hour === selectedTimeSlot.hour && day === selectedTimeSlot.day;
      }

      return matchesSearch && matchesLevel && matchesServer && matchesTimeSlot;
    });
  }, [logs, searchQuery, levelFilter, serverFilter, selectedTimeSlot]);

  // Calculate level counts
  const levelCounts = useMemo(() => {
    const counts = { debug: 0, info: 0, warn: 0, error: 0 };
    logs.forEach((log) => {
      counts[log.level]++;
    });
    return counts;
  }, [logs]);

  const handleTimeSlotClick = (hour: number, day: number) => {
    if (
      selectedTimeSlot?.hour === hour &&
      selectedTimeSlot?.day === day
    ) {
      setSelectedTimeSlot(null);
    } else {
      setSelectedTimeSlot({ hour, day });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header with stats and actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          <Badge variant="secondary">{logs.length} total</Badge>
          <Badge variant="destructive">{levelCounts.error} errors</Badge>
          <Badge className="bg-yellow-500">{levelCounts.warn} warnings</Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExport?.('json')}
          >
            <Download className="mr-2 h-4 w-4" />
            Export JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExport?.('csv')}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          {onClear && (
            <Button variant="destructive" size="sm" onClick={onClear}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Activity Heatmap */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Activity Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityHeatmap
            logs={logs}
            selectedTimeSlot={selectedTimeSlot}
            onTimeSlotClick={handleTimeSlotClick}
          />
          {selectedTimeSlot && (
            <p className="mt-2 text-xs text-muted-foreground">
              Filtering by: Day {selectedTimeSlot.day}, Hour {selectedTimeSlot.hour}
              <button
                onClick={() => setSelectedTimeSlot(null)}
                className="ml-2 text-primary hover:underline"
              >
                Clear filter
              </button>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>

        <Select value={serverFilter} onValueChange={setServerFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Server" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Servers</SelectItem>
            {servers.map((server) => (
              <SelectItem key={server} value={server}>
                {server}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Log Stream */}
      <Card className="flex-1">
        <ScrollArea className="h-[400px]">
          <div className="p-4 space-y-1">
            {filteredLogs.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                <p className="text-sm">No logs to display</p>
              </div>
            ) : (
              filteredLogs.map((log) => (
                <LogEntry key={log.id} log={log} />
              ))
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
