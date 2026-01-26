import { GitBranch, Clock, Play } from 'lucide-react';
import { Card } from '@renderer/components/ui/card';
import { Badge } from '@renderer/components/ui/badge';
import { cn } from '@renderer/lib/utils';
import type { Workflow } from '@main/core/interfaces';
import type { ReactNode } from 'react';

export interface WorkflowCardProps {
  workflow: Workflow;
  isSelected?: boolean;
  onClick?: () => void;
  actions?: ReactNode;
}

/**
 * WorkflowCard - Displays a single workflow in a card format.
 */
export function WorkflowCard({
  workflow,
  isSelected = false,
  onClick,
  actions,
}: WorkflowCardProps) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };
  
  const getStatusIcon = () => {
    // Future: derive from last execution status
    return null;
  };
  
  const stepCount = workflow.steps?.length || 0;
  
  return (
    <Card
      className={cn(
        'p-3 cursor-pointer transition-colors hover:bg-accent/50',
        isSelected && 'ring-2 ring-primary bg-accent/50'
      )}
      onClick={onClick}
      data-testid="workflow-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary shrink-0" />
            <h3 className="font-medium text-sm truncate">{workflow.name}</h3>
            {getStatusIcon()}
          </div>
          
          {/* Description */}
          {workflow.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {workflow.description}
            </p>
          )}
          
          {/* Metadata */}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Play className="w-3 h-3" />
              {stepCount} step{stepCount !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(workflow.updatedAt)}
            </span>
          </div>
          
          {/* Triggers */}
          {workflow.trigger && (
            <div className="flex flex-wrap gap-1 mt-2">
              <Badge variant="secondary" className="text-[10px] h-5">
                {workflow.trigger.type}
                {workflow.trigger.enabled ? '' : ' (disabled)'}
              </Badge>
            </div>
          )}
        </div>
        
        {/* Actions */}
        {actions && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
    </Card>
  );
}

export default WorkflowCard;
