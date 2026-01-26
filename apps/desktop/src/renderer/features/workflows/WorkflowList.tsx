import { Plus, Search, MoreHorizontal, Play, Trash2, Copy, Clock } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { WorkflowCard } from './WorkflowCard';
import type { Workflow } from '@main/core/interfaces';

export interface WorkflowListProps {
  workflows: Workflow[];
  selectedId?: string;
  onSelect: (workflow: Workflow) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (workflow: Workflow) => void;
  onRun: (workflow: Workflow) => void;
}

/**
 * WorkflowList - Displays a list of workflows with search and actions.
 */
export function WorkflowList({
  workflows,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onDuplicate,
  onRun,
}: WorkflowListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredWorkflows = workflows.filter((w) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const sortedWorkflows = [...filteredWorkflows].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
  
  return (
    <div className="flex flex-col h-full bg-card" data-testid="workflow-list">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-lg font-semibold">Workflows</h2>
        <Button size="sm" onClick={onCreate} className="gap-1">
          <Plus className="w-4 h-4" />
          New
        </Button>
      </div>
      
      {/* Search */}
      <div className="px-4 py-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
            data-testid="workflow-search"
          />
        </div>
      </div>
      
      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {sortedWorkflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {searchQuery ? (
              <>
                <Search className="w-10 h-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No workflows match your search</p>
              </>
            ) : (
              <>
                <Clock className="w-10 h-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No workflows yet</p>
                <p className="text-xs text-muted-foreground/75 mt-1">
                  Create your first workflow to get started
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCreate}
                  className="mt-4 gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Create Workflow
                </Button>
              </>
            )}
          </div>
        ) : (
          sortedWorkflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              isSelected={workflow.id === selectedId}
              onClick={() => onSelect(workflow)}
              actions={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onRun(workflow)}>
                      <Play className="w-4 h-4 mr-2" />
                      Run
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(workflow)}>
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(workflow.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          ))
        )}
      </div>
      
      {/* Footer */}
      <div className="px-4 py-2 border-t bg-muted/50">
        <p className="text-xs text-muted-foreground">
          {filteredWorkflows.length} workflow{filteredWorkflows.length !== 1 ? 's' : ''}
          {searchQuery && ` matching "${searchQuery}"`}
        </p>
      </div>
    </div>
  );
}

export default WorkflowList;
