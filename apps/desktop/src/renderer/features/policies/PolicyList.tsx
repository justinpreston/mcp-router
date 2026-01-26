import { useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { usePolicyStore, selectPolicies, selectSelectedPolicy } from '@renderer/stores';
import { PolicyCard } from './PolicyCard';
import type { PolicyInfo } from '@preload/api';
import { GripVertical } from 'lucide-react';

export interface PolicyListProps {
  onPolicySelect?: (policy: PolicyInfo) => void;
}

export function PolicyList({ onPolicySelect }: PolicyListProps) {
  const policies = usePolicyStore(selectPolicies);
  const selectedPolicy = usePolicyStore(selectSelectedPolicy);
  const isLoading = usePolicyStore((state) => state.isLoading);
  const error = usePolicyStore((state) => state.error);
  const {
    fetchPolicies,
    selectPolicy,
    updatePolicy,
    removePolicy,
    reorderPolicies,
  } = usePolicyStore();

  // Fetch policies on mount
  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const handleSelect = (policy: PolicyInfo) => {
    selectPolicy(policy.id);
    onPolicySelect?.(policy);
  };

  const handleToggle = async (policyId: string, enabled: boolean) => {
    await updatePolicy(policyId, { enabled });
  };

  const handleDelete = async (policyId: string) => {
    await removePolicy(policyId);
  };

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;
      if (result.source.index === result.destination.index) return;

      reorderPolicies(result.source.index, result.destination.index);
    },
    [reorderPolicies]
  );

  if (isLoading && policies.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading policies...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (policies.length === 0) {
    return (
      <div data-testid="policy-list">
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed" data-testid="empty-policy-list">
          <p className="text-sm text-muted-foreground">
            No policies configured. Click &quot;Add Policy&quot; to create one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="policy-list">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="space-y-3"
            data-testid="policy-list"
          >
            {policies.map((policy, index) => (
              <Draggable key={policy.id} draggableId={policy.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className={`flex items-start gap-2 ${
                      snapshot.isDragging ? 'opacity-90 shadow-lg' : ''
                    }`}
                  >
                    <div
                      {...provided.dragHandleProps}
                      className="mt-4 cursor-grab rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
                      data-testid="drag-handle"
                      title="Drag to change priority"
                    >
                      <GripVertical className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <PolicyCard
                        policy={policy}
                        isSelected={selectedPolicy?.id === policy.id}
                        onSelect={handleSelect}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                      />
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
