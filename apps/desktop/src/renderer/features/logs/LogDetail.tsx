import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@renderer/components/ui';
import { X, Copy, Check, ChevronRight, ChevronDown } from 'lucide-react';
import type { LogItem } from './LogViewer';

/**
 * Format timestamp to full date-time string.
 */
function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Format duration in milliseconds.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(3)}s`;
}

/**
 * Get color class for log level.
 */
function getLevelColor(level: string): string {
  switch (level) {
    case 'debug':
      return 'text-gray-500';
    case 'info':
      return 'text-blue-500';
    case 'warn':
      return 'text-yellow-500';
    case 'error':
      return 'text-red-500';
    default:
      return 'text-muted-foreground';
  }
}

export interface LogDetailProps {
  log: LogItem;
  onClose: () => void;
}

/**
 * Detail panel for a selected log entry.
 *
 * Features:
 * - Tabs: Params | Result | Error | Metadata
 * - JSON syntax highlighting
 * - Copy to clipboard
 * - Expandable raw JSON view
 */
export function LogDetail({ log, onClose }: LogDetailProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Extract metadata fields
  const params = log.metadata?.params as Record<string, unknown> | undefined;
  const result = log.metadata?.result as Record<string, unknown> | undefined;
  const error = log.metadata?.error as Record<string, unknown> | undefined;
  const duration = (log.metadata?.duration as number) || 0;

  // Copy log as JSON to clipboard
  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render JSON with basic syntax highlighting
  const renderJson = (data: unknown) => {
    if (!data) {
      return (
        <p className="text-muted-foreground italic text-sm">No data available</p>
      );
    }

    return (
      <pre className="text-xs bg-secondary/50 p-3 rounded overflow-x-auto whitespace-pre-wrap break-all">
        <code className="text-foreground/90">
          {JSON.stringify(data, null, 2)}
        </code>
      </pre>
    );
  };

  return (
    <Card className="h-full flex flex-col border-l-2 border-l-primary">
      <CardHeader className="flex-shrink-0 pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-medium truncate">
              Log Details
            </CardTitle>
            <p
              className={`text-xs font-medium mt-1 ${getLevelColor(log.level)}`}
            >
              {log.level.toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              title="Copy log as JSON"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden flex flex-col pb-4">
        {/* Log summary */}
        <div className="space-y-2 mb-4">
          <div>
            <p className="text-xs text-muted-foreground">Message</p>
            <p className="text-sm font-medium break-words">{log.message}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Timestamp</p>
              <p className="font-medium">{formatDateTime(log.timestamp)}</p>
            </div>
            {duration > 0 && (
              <div>
                <p className="text-muted-foreground">Duration</p>
                <p className="font-medium">{formatDuration(duration)}</p>
              </div>
            )}
            {log.serverName && (
              <div>
                <p className="text-muted-foreground">Server</p>
                <p className="font-medium truncate">{log.serverName}</p>
              </div>
            )}
            {log.serverId && (
              <div>
                <p className="text-muted-foreground">Server ID</p>
                <p className="font-medium truncate text-xs">{log.serverId}</p>
              </div>
            )}
          </div>
        </div>

        {/* Tabs for detailed data */}
        <Tabs defaultValue="metadata" className="flex-1 flex flex-col">
          <TabsList className="w-full grid grid-cols-4 h-8">
            <TabsTrigger value="metadata" className="text-xs">
              Metadata
            </TabsTrigger>
            <TabsTrigger value="params" className="text-xs">
              Params
            </TabsTrigger>
            <TabsTrigger value="result" className="text-xs">
              Result
            </TabsTrigger>
            <TabsTrigger value="error" className="text-xs" disabled={!error}>
              Error {error && '⚠️'}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-2">
            <TabsContent value="metadata" className="m-0">
              {renderJson(log.metadata)}
            </TabsContent>
            <TabsContent value="params" className="m-0">
              {renderJson(params)}
            </TabsContent>
            <TabsContent value="result" className="m-0">
              {renderJson(result)}
            </TabsContent>
            <TabsContent value="error" className="m-0">
              {error ? (
                <div className="space-y-2">
                  <div className="bg-destructive/10 text-destructive p-2 rounded text-xs">
                    {(error.message as string) || 'Unknown error'}
                  </div>
                  {renderJson(error)}
                </div>
              ) : (
                <p className="text-muted-foreground italic text-sm">No error</p>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Expandable raw JSON */}
        <div className="mt-4 pt-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3 mr-1" />
            ) : (
              <ChevronRight className="h-3 w-3 mr-1" />
            )}
            Raw JSON
          </Button>
          {expanded && (
            <div className="mt-2 max-h-48 overflow-auto">
              {renderJson(log)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default LogDetail;
