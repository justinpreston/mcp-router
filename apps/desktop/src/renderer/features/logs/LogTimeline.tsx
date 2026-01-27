import { useMemo } from 'react';
import { ScrollArea } from '@renderer/components/ui';
import type { LogItem } from './LogViewer';

/**
 * Timeline bar colors for different log levels.
 */
const LEVEL_BAR_COLORS: Record<string, string> = {
  debug: 'bg-gray-500',
  info: 'bg-blue-500',
  warn: 'bg-yellow-500',
  error: 'bg-red-500',
};

/**
 * Badge colors for log levels.
 */
const LEVEL_BADGE_COLORS: Record<string, string> = {
  debug: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  warn: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
};

/**
 * Format duration in milliseconds to human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format timestamp to time string.
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

export interface LogTimelineProps {
  logs: LogItem[];
  selectedLogId?: string;
  onSelectLog?: (log: LogItem) => void;
}

/**
 * Timeline visualization for logs showing request duration bars.
 *
 * Features:
 * - Horizontal bars showing relative duration
 * - Color-coded by log level
 * - Scale adjusts based on max duration
 * - Click to select and view details
 */
export function LogTimeline({
  logs,
  selectedLogId,
  onSelectLog,
}: LogTimelineProps) {
  // Sort by timestamp descending (newest first)
  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => b.timestamp - a.timestamp),
    [logs]
  );

  // Calculate time range for positioning
  const timeRange = useMemo(() => {
    if (sortedLogs.length === 0) return { start: 0, end: 0, range: 1 };
    const timestamps = sortedLogs.map((l) => l.timestamp);
    const start = Math.min(...timestamps);
    const end = Math.max(...timestamps);
    return { start, end, range: Math.max(end - start, 1) };
  }, [sortedLogs]);

  // Max duration for bar width scaling (from metadata.duration if available)
  const maxDuration = useMemo(() => {
    const durations = sortedLogs
      .map((l) => (l.metadata?.duration as number) || 0)
      .filter((d) => d > 0);
    return Math.max(...durations, 100);
  }, [sortedLogs]);

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p className="text-4xl mb-4">⏱️</p>
        <p className="text-lg font-medium">No logs to visualize</p>
        <p className="text-sm">Request logs will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Timeline header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-2 pb-2 border-b">
        <span>Newest: {formatTime(timeRange.end)}</span>
        <span>Duration scale: 0 - {formatDuration(maxDuration)}</span>
        <span>Oldest: {formatTime(timeRange.start)}</span>
      </div>

      {/* Timeline rows */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-1 pr-4">
          {sortedLogs.map((log) => {
            const duration = (log.metadata?.duration as number) || 0;
            const barWidth = Math.max((duration / maxDuration) * 100, 2);
            const barColor = LEVEL_BAR_COLORS[log.level] || 'bg-gray-500';
            const badgeColor = LEVEL_BADGE_COLORS[log.level] || '';
            const isSelected = selectedLogId === log.id;
            const hasError = log.level === 'error';

            return (
              <div
                key={log.id}
                className={`flex items-center gap-3 py-2 px-2 rounded cursor-pointer hover:bg-accent/50 transition-colors ${
                  isSelected
                    ? 'bg-accent ring-1 ring-primary'
                    : ''
                }`}
                onClick={() => onSelectLog?.(log)}
              >
                {/* Level badge + Server */}
                <div className="w-32 flex-shrink-0">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badgeColor}`}
                  >
                    {log.level}
                  </span>
                  {log.serverName && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {log.serverName}
                    </p>
                  )}
                </div>

                {/* Timeline bar */}
                <div className="flex-1 h-6 bg-secondary rounded relative overflow-hidden">
                  <div
                    className={`absolute h-full ${barColor} rounded transition-all opacity-80 hover:opacity-100`}
                    style={{
                      width: `${barWidth}%`,
                      minWidth: '4px',
                    }}
                    title={`${formatDuration(duration)} - ${log.level.toUpperCase()}`}
                  />
                  {/* Message preview on bar */}
                  <span className="absolute inset-0 flex items-center px-2 text-xs truncate text-foreground/80">
                    {log.message.slice(0, 60)}
                    {log.message.length > 60 ? '...' : ''}
                  </span>
                </div>

                {/* Duration + Time */}
                <div className="w-28 flex-shrink-0 text-right">
                  <span
                    className={`text-xs font-medium ${
                      hasError
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {duration > 0 ? formatDuration(duration) : '-'}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(log.timestamp)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-3 border-t text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-gray-500" /> Debug
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-500" /> Info
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-yellow-500" /> Warning
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-500" /> Error
        </span>
      </div>
    </div>
  );
}

export default LogTimeline;
