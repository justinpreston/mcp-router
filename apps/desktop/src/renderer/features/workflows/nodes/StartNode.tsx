import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Play } from 'lucide-react';
import type { WorkflowNodeData } from '../types';

/**
 * Start node - entry point for workflow execution.
 * Has only an output handle (no inputs).
 */
export const StartNode = memo(({ data, selected }: NodeProps<WorkflowNodeData>) => {
  return (
    <div
      className={`
        relative flex items-center justify-center
        w-16 h-16 rounded-full
        bg-green-500 text-white
        shadow-md transition-all
        ${selected ? 'ring-2 ring-green-300 ring-offset-2' : ''}
        ${data.executionStatus === 'running' ? 'animate-pulse' : ''}
        ${data.executionStatus === 'completed' ? 'bg-green-600' : ''}
      `}
      data-testid="start-node"
    >
      <Play className="w-6 h-6 ml-1" />
      
      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-green-700 !border-2 !border-white"
      />

      {/* Label below node */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium text-muted-foreground whitespace-nowrap">
        {data.label || 'Start'}
      </div>
    </div>
  );
});

StartNode.displayName = 'StartNode';
