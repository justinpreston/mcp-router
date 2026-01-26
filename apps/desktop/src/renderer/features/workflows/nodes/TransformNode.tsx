import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Shuffle, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { WorkflowNodeData, TransformNodeConfig } from '../types';

/**
 * Transform node - transforms data between steps.
 * Has both input and output handles.
 */
export const TransformNode = memo(({ data, selected }: NodeProps<WorkflowNodeData>) => {
  const config = data.config as TransformNodeConfig;

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
        return 'border-blue-500';
      case 'completed':
        return 'border-green-500';
      case 'failed':
        return 'border-red-500';
      default:
        return 'border-border';
    }
  };

  return (
    <div
      className={`
        relative min-w-[160px] rounded-lg border-2 bg-card
        shadow-md transition-all
        ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}
        ${getStatusBorder()}
        ${data.hasError ? 'border-red-500' : ''}
      `}
      data-testid="transform-node"
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-950/20 rounded-t-lg border-b border-purple-200 dark:border-purple-900">
        <div className="p-1.5 rounded bg-purple-500/10">
          <Shuffle className="w-4 h-4 text-purple-600" />
        </div>
        <span className="text-sm font-medium truncate flex-1">{data.label}</span>
        {getStatusIcon()}
      </div>

      {/* Content */}
      <div className="px-3 py-2">
        {config.transformDescription ? (
          <div className="text-xs text-muted-foreground line-clamp-2">
            {config.transformDescription}
          </div>
        ) : (
          <div className="text-xs font-mono text-muted-foreground truncate">
            {config.expression ? config.expression.slice(0, 30) + '...' : 'No transform set'}
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
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white"
      />
    </div>
  );
});

TransformNode.displayName = 'TransformNode';
