import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Square } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

/**
 * End node - terminal point for workflow execution.
 * Has only an input handle (no outputs).
 */
export const EndNode = memo(({ data, selected }: NodeProps<WorkflowNodeData>) => {
  return (
    <div
      className={`
        relative flex items-center justify-center
        w-16 h-16 rounded-full
        bg-red-500 text-white
        shadow-md transition-all
        ${selected ? 'ring-2 ring-red-300 ring-offset-2' : ''}
        ${data.executionStatus === 'running' ? 'animate-pulse' : ''}
        ${data.executionStatus === 'completed' ? 'bg-red-600' : ''}
      `}
      data-testid="end-node"
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-red-700 !border-2 !border-white"
      />

      <Square className="w-6 h-6" />

      {/* Label below node */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium text-muted-foreground whitespace-nowrap">
        {data.label || 'End'}
      </div>
    </div>
  );
});

EndNode.displayName = 'EndNode';
