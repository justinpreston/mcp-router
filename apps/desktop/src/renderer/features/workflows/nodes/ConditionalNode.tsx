import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { GitBranch, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { WorkflowNodeData, ConditionalNodeConfig } from '../types';

/**
 * Conditional node - branches workflow based on a condition.
 * Has one input and two outputs (true/false branches).
 */
export const ConditionalNode = memo(({ data, selected }: NodeProps<WorkflowNodeData>) => {
  const config = data.config as ConditionalNodeConfig;

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
      `}
      data-testid="conditional-node"
      style={{
        transform: 'rotate(0deg)',
      }}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 rounded-t-lg border-b border-amber-200 dark:border-amber-900">
        <div className="p-1.5 rounded bg-amber-500/10">
          <GitBranch className="w-4 h-4 text-amber-600" />
        </div>
        <span className="text-sm font-medium truncate flex-1">{data.label}</span>
        {data.executionStatus === 'running' && (
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
        )}
      </div>

      {/* Content */}
      <div className="px-3 py-2">
        {config.conditionDescription ? (
          <div className="text-xs text-muted-foreground line-clamp-2">
            {config.conditionDescription}
          </div>
        ) : (
          <div className="text-xs font-mono text-muted-foreground truncate">
            {config.condition || 'No condition set'}
          </div>
        )}
      </div>

      {/* Output handles with labels */}
      <div className="relative h-6">
        {/* True branch (left) */}
        <Handle
          type="source"
          position={Position.Bottom}
          id="true"
          className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !left-[25%]"
        />
        <div className="absolute bottom-0 left-[25%] -translate-x-1/2 translate-y-4 flex items-center gap-1 text-xs text-green-600">
          <CheckCircle2 className="w-3 h-3" />
          <span>Yes</span>
        </div>

        {/* False branch (right) */}
        <Handle
          type="source"
          position={Position.Bottom}
          id="false"
          className="!w-3 !h-3 !bg-red-500 !border-2 !border-white !left-[75%]"
        />
        <div className="absolute bottom-0 left-[75%] -translate-x-1/2 translate-y-4 flex items-center gap-1 text-xs text-red-600">
          <XCircle className="w-3 h-3" />
          <span>No</span>
        </div>
      </div>
    </div>
  );
});

ConditionalNode.displayName = 'ConditionalNode';
