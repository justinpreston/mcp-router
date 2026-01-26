import { memo } from 'react';
import { Badge } from '@renderer/components/ui';
import type { LogItem } from './LogViewer';

export interface LogEntryProps {
  log: LogItem;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export const LogEntry = memo(function LogEntry({ log }: LogEntryProps) {
  const levelColors: Record<LogItem['level'], string> = {
    debug: 'bg-gray-500',
    info: 'bg-blue-500',
    warn: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  return (
    <div className="flex items-start gap-2 py-1 px-2 rounded hover:bg-accent/50 font-mono text-xs">
      <span className="text-muted-foreground w-[70px] flex-shrink-0">
        {formatTimestamp(log.timestamp)}
      </span>
      <Badge
        className={`${levelColors[log.level]} text-white text-[10px] px-1.5 py-0`}
      >
        {log.level.toUpperCase()}
      </Badge>
      {log.serverName && (
        <span className="text-primary/70 flex-shrink-0">
          [{log.serverName}]
        </span>
      )}
      <span className="flex-1 break-all">{log.message}</span>
    </div>
  );
});
