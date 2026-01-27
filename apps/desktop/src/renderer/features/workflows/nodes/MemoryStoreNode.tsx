import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Save, AlertCircle, CheckCircle2, Loader2, Brain, Tag } from 'lucide-react';
import type { WorkflowNodeData, MemoryStoreNodeConfig } from '../types';

/**
 * Memory type color mapping.
 */
const typeColors: Record<string, string> = {
  note: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  conversation: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  code: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  document: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  task: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  reference: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
};

/**
 * Memory Store node - creates new memories in the memory store.
 * Can use template variables to construct content from workflow context.
 */
export const MemoryStoreNode = memo(({ data, selected }: NodeProps<WorkflowNodeData>) => {
  const config = data.config as MemoryStoreNodeConfig;

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

  const typeColor = typeColors[config.memoryType] || 'bg-muted text-muted-foreground';

  return (
    <div
      className={`
        relative min-w-[200px] rounded-lg border-2 bg-card
        shadow-md transition-all
        ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}
        ${getStatusBorder()}
        ${data.hasError ? 'border-red-500' : ''}
      `}
      data-testid="memory-store-node"
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-primary !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 rounded-t-lg border-b">
        <div className="p-1.5 rounded bg-emerald-500/20">
          <Save className="w-4 h-4 text-emerald-500" />
        </div>
        <span className="text-sm font-medium truncate flex-1">{data.label}</span>
        {getStatusIcon()}
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-1.5">
        {/* Memory type badge */}
        <div className="flex items-center gap-2">
          <Brain className="w-3 h-3 text-muted-foreground" />
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] capitalize ${typeColor}`}>
            {config.memoryType}
          </span>
          {config.importance !== undefined && (
            <span className="text-[10px] text-muted-foreground">
              {Math.round(config.importance * 100)}% importance
            </span>
          )}
        </div>

        {/* Content preview */}
        <div className="text-xs text-muted-foreground line-clamp-2 font-mono bg-muted/50 rounded px-2 py-1">
          {config.content ? (
            config.content.length > 50
              ? config.content.substring(0, 50) + '...'
              : config.content
          ) : (
            <span className="italic">No content template</span>
          )}
        </div>

        {/* Tags */}
        {config.tags && config.tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <Tag className="w-3 h-3 text-muted-foreground" />
            {config.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {config.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{config.tags.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Output variable */}
        {config.outputVariable && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>→</span>
            <span className="font-mono">{config.outputVariable}</span>
          </div>
        )}

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

MemoryStoreNode.displayName = 'MemoryStoreNode';

export default MemoryStoreNode;
