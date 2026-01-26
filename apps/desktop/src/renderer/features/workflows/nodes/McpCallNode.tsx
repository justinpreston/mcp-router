import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Wrench, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { WorkflowNodeData, McpCallNodeConfig } from '../types';

/**
 * MCP Call node - executes a tool on an MCP server.
 * Has both input and output handles.
 */
export const McpCallNode = memo(({ data, selected }: NodeProps<WorkflowNodeData>) => {
  const config = data.config as McpCallNodeConfig;

  const getStatusIcon = () => {
    switch (data.executionStatus) {
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBorder = () => {
    switch (data.executionStatus) {
      case 'running':
        return 'border-blue-500 shadow-blue-200';
      case 'completed':
        return 'border-green-500 shadow-green-200';
      case 'failed':
        return 'border-red-500 shadow-red-200';
      default:
        return 'border-border';
    }
  };

  return (
    <div
      className={`
        relative min-w-[180px] rounded-lg border-2 bg-card
        shadow-md transition-all
        ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}
        ${getStatusBorder()}
        ${data.hasError ? 'border-red-500' : ''}
      `}
      data-testid="mcp-call-node"
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-primary !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-t-lg border-b">
        <div className="p-1.5 rounded bg-blue-500/10">
          <Wrench className="w-4 h-4 text-blue-500" />
        </div>
        <span className="text-sm font-medium truncate flex-1">{data.label}</span>
        {getStatusIcon()}
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-1">
        {config.serverName && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Server:</span>
            <span className="font-mono truncate">{config.serverName}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Tool:</span>
          <span className="font-mono text-primary truncate">{config.toolName}</span>
        </div>
        {data.description && (
          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {data.description}
          </div>
        )}
      </div>

      {/* Error message */}
      {data.hasError && data.errorMessage && (
        <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950/20 border-t border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400">
          {data.errorMessage}
        </div>
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-primary !border-2 !border-white"
      />
    </div>
  );
});

McpCallNode.displayName = 'McpCallNode';
