import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Search, AlertCircle, CheckCircle2, Loader2, Brain } from 'lucide-react';
import type { WorkflowNodeData, MemoryQueryNodeConfig } from '../types';

/**
 * Memory Query node - retrieves relevant memories using semantic search.
 * Outputs results to a workflow context variable.
 */
export const MemoryQueryNode = memo(({ data, selected }: NodeProps<WorkflowNodeData>) => {
  const config = data.config as MemoryQueryNodeConfig;

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

  const getSearchModeLabel = () => {
    switch (config.searchMode) {
      case 'semantic':
        return 'Semantic';
      case 'hybrid':
        return 'Hybrid';
      case 'text':
        return 'Text';
      default:
        return 'Hybrid';
    }
  };

  return (
    <div
      className={`
        relative min-w-[200px] rounded-lg border-2 bg-card
        shadow-md transition-all
        ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}
        ${getStatusBorder()}
        ${data.hasError ? 'border-red-500' : ''}
      `}
      data-testid="memory-query-node"
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-primary !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 rounded-t-lg border-b">
        <div className="p-1.5 rounded bg-purple-500/20">
          <Brain className="w-4 h-4 text-purple-500" />
        </div>
        <span className="text-sm font-medium truncate flex-1">{data.label}</span>
        {getStatusIcon()}
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-2 text-xs">
          <Search className="w-3 h-3 text-muted-foreground" />
          <span className="font-mono text-primary truncate max-w-[150px]">
            {config.query || 'No query'}
          </span>
        </div>
        
        <div className="flex flex-wrap gap-1">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
            {getSearchModeLabel()}
          </span>
          {config.limit && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
              max: {config.limit}
            </span>
          )}
          {config.types && config.types.length > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
              {config.types.length} type{config.types.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>→</span>
          <span className="font-mono">{config.outputVariable || 'memories'}</span>
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

MemoryQueryNode.displayName = 'MemoryQueryNode';

export default MemoryQueryNode;
