import { forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import { X, Terminal, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { Badge } from '@renderer/components/ui/badge';
import { cn } from '@renderer/lib/utils';

export interface ExecutionLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  nodeId?: string;
  message: string;
}

export interface ExecutionPanelProps {
  isRunning: boolean;
  executionId: string | null;
  onClose: () => void;
}

export interface ExecutionPanelRef {
  addLog: (message: string, level?: ExecutionLog['level'], nodeId?: string) => void;
  clearLogs: () => void;
}

/**
 * ExecutionPanel - Displays workflow execution logs and status.
 */
export const ExecutionPanel = forwardRef<ExecutionPanelRef, ExecutionPanelProps>(
  function ExecutionPanel({ isRunning, executionId, onClose }, ref) {
    const [logs, setLogs] = useState<ExecutionLog[]>([]);
    const [startTime] = useState(() => new Date());
    
    const addLog = useCallback(
      (message: string, level: ExecutionLog['level'] = 'info', nodeId?: string) => {
        const log: ExecutionLog = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: new Date(),
          level,
          nodeId,
          message,
        };
        setLogs((prev) => [...prev, log]);
      },
      []
    );
    
    const clearLogs = useCallback(() => {
      setLogs([]);
    }, []);
    
    useImperativeHandle(ref, () => ({ addLog, clearLogs }), [addLog, clearLogs]);
    
    const getLogIcon = (level: ExecutionLog['level']) => {
      switch (level) {
        case 'success':
          return <CheckCircle2 className="w-4 h-4 text-green-500" />;
        case 'error':
          return <XCircle className="w-4 h-4 text-red-500" />;
        case 'warn':
          return <Clock className="w-4 h-4 text-amber-500" />;
        default:
          return <Terminal className="w-4 h-4 text-muted-foreground" />;
      }
    };
    
    const getLogClass = (level: ExecutionLog['level']) => {
      switch (level) {
        case 'success':
          return 'text-green-600 dark:text-green-400';
        case 'error':
          return 'text-red-600 dark:text-red-400';
        case 'warn':
          return 'text-amber-600 dark:text-amber-400';
        default:
          return 'text-foreground';
      }
    };
    
    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
      });
    };
    
    const elapsedTime = Math.floor((Date.now() - startTime.getTime()) / 1000);
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    
    return (
      <div
        className="w-80 border-l bg-card flex flex-col"
        data-testid="execution-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            <span className="font-medium text-sm">Execution</span>
            {isRunning && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Running
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">ID:</span>
            <code className="font-mono text-xs">
              {executionId?.slice(0, 8) || '—'}
            </code>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3 h-3" />
            {minutes > 0 && `${minutes}m `}
            {seconds}s
          </div>
        </div>
        
        {/* Logs */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Terminal className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">
                  {isRunning ? 'Waiting for output...' : 'No execution logs'}
                </p>
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={cn(
                    'flex items-start gap-2 px-2 py-1 rounded text-xs',
                    log.level === 'error' && 'bg-red-500/10',
                    log.level === 'success' && 'bg-green-500/10'
                  )}
                >
                  {getLogIcon(log.level)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-mono">
                        {formatTime(log.timestamp)}
                      </span>
                      {log.nodeId && (
                        <Badge variant="outline" className="h-4 text-[10px]">
                          {log.nodeId}
                        </Badge>
                      )}
                    </div>
                    <p className={cn('break-words', getLogClass(log.level))}>
                      {log.message}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        
        {/* Footer */}
        <div className="px-4 py-2 border-t bg-muted/50">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{logs.length} log entries</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearLogs}
              className="h-6 text-xs"
            >
              Clear
            </Button>
          </div>
        </div>
      </div>
    );
  }
);

export default ExecutionPanel;
