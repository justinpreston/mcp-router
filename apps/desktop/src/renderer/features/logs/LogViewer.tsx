import { useState, useMemo, useCallback } from 'react';
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
  Tabs,
  TabsList,
  TabsTrigger,
} from '@renderer/components/ui';
import { Search, Download, Trash2, List, Clock, BarChart3 } from 'lucide-react';
import { LogEntry } from './LogEntry';
import { ActivityHeatmap } from './ActivityHeatmap';
import { LogTimeline } from './LogTimeline';
import { LogDetail } from './LogDetail';

/** Available view modes for the log viewer */
type ViewMode = 'list' | 'timeline' | 'heatmap';

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
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedLog, setSelectedLog] = useState<LogItem | null>(null);
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

  // Handle log selection
  const handleSelectLog = useCallback((log: LogItem) => {
    setSelectedLog((prev) => (prev?.id === log.id ? null : log));
  }, []);

  // Close detail panel
  const handleCloseDetail = useCallback(() => {
    setSelectedLog(null);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Header with stats and actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          <Badge variant="secondary">{logs.length} total</Badge>
          <Badge variant="destructive">{levelCounts.error} errors</Badge>
          <Badge className="bg-yellow-500">{levelCounts.warn} warnings</Badge>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="list" className="px-2" title="List view">
                <List className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="timeline" className="px-2" title="Timeline view">
                <Clock className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="heatmap" className="px-2" title="Heatmap view">
                <BarChart3 className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
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

      {/* Activity Heatmap - show when in heatmap mode */}
      {viewMode === 'heatmap' && (
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
      )}

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

      {/* Log Content - different views based on mode */}
      <div className="flex gap-4 flex-1">
        {/* Main content area */}
        <div className={`flex-1 ${selectedLog ? 'max-w-[calc(100%-350px)]' : ''}`}>
          {viewMode === 'list' && (
            <Card className="flex-1">
              <ScrollArea className="h-[400px]">
                <div className="p-4 space-y-1">
                  {filteredLogs.length === 0 ? (
                    <div className="flex h-32 items-center justify-center text-muted-foreground">
                      <p className="text-sm">No logs to display</p>
                    </div>
                  ) : (
                    filteredLogs.map((log) => (
                      <div
                        key={log.id}
                        onClick={() => handleSelectLog(log)}
                        className={`cursor-pointer rounded transition-colors ${
                          selectedLog?.id === log.id
                            ? 'ring-1 ring-primary bg-accent/50'
                            : 'hover:bg-accent/30'
                        }`}
                      >
                        <LogEntry log={log} />
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </Card>
          )}

          {viewMode === 'timeline' && (
            <Card className="flex-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Request Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LogTimeline
                  logs={filteredLogs}
                  selectedLogId={selectedLog?.id}
                  onSelectLog={handleSelectLog}
                />
              </CardContent>
            </Card>
          )}

          {viewMode === 'heatmap' && (
            <Card className="flex-1">
              <ScrollArea className="h-[400px]">
                <div className="p-4 space-y-1">
                  {filteredLogs.length === 0 ? (
                    <div className="flex h-32 items-center justify-center text-muted-foreground">
                      <p className="text-sm">No logs in selected time slot</p>
                    </div>
                  ) : (
                    filteredLogs.map((log) => (
                      <div
                        key={log.id}
                        onClick={() => handleSelectLog(log)}
                        className={`cursor-pointer rounded transition-colors ${
                          selectedLog?.id === log.id
                            ? 'ring-1 ring-primary bg-accent/50'
                            : 'hover:bg-accent/30'
                        }`}
                      >
                        <LogEntry log={log} />
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </Card>
          )}
        </div>

        {/* Detail panel */}
        {selectedLog && (
          <div className="w-[340px] flex-shrink-0">
            <LogDetail log={selectedLog} onClose={handleCloseDetail} />
          </div>
        )}
      </div>
    </div>
  );
}
