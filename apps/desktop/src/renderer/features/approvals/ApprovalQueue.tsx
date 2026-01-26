import { useEffect, useState } from 'react';
import { useApprovalStore, selectApprovals, selectPendingCount } from '@renderer/stores';
import { useElectronEvent } from '@renderer/hooks';
import { ApprovalCard } from './ApprovalCard';
import { ApprovalDetailDialog } from './ApprovalDetailDialog';
import { Badge, Button } from '@renderer/components/ui';
import type { ApprovalInfo } from '@preload/api';

export interface ApprovalQueueProps {
  showResolved?: boolean;
}

export function ApprovalQueue({ showResolved = false }: ApprovalQueueProps) {
  const approvals = useApprovalStore(selectApprovals);
  const pendingCount = useApprovalStore(selectPendingCount);
  const isLoading = useApprovalStore((state) => state.isLoading);
  const error = useApprovalStore((state) => state.error);
  const {
    fetchApprovals,
    approveRequest,
    rejectRequest,
    handleNewApproval,
    handleApprovalResolved,
  } = useApprovalStore();

  const [selectedApproval, setSelectedApproval] = useState<ApprovalInfo | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending'>('pending');

  // Fetch approvals on mount
  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  // Listen for new approvals
  useElectronEvent<ApprovalInfo>('approval:new', handleNewApproval);
  useElectronEvent<ApprovalInfo>('approval:resolved', handleApprovalResolved);

  const handleApprove = async (approvalId: string) => {
    await approveRequest(approvalId);
  };

  const handleReject = async (approvalId: string, reason?: string) => {
    await rejectRequest(approvalId, reason);
  };

  const filteredApprovals = approvals.filter((a) => {
    if (filterStatus === 'pending') return a.status === 'pending';
    if (!showResolved) return a.status === 'pending';
    return true;
  });

  // Sort by requestedAt (newest first for pending, oldest first for resolved)
  const sortedApprovals = [...filteredApprovals].sort((a, b) => {
    if (a.status === 'pending' && b.status === 'pending') {
      return b.requestedAt - a.requestedAt; // Newest pending first
    }
    return a.requestedAt - b.requestedAt; // Oldest first for resolved
  });

  if (isLoading && approvals.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading approvals...</p>
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

  return (
    <div className="space-y-4">
      {/* Header with filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium">Approval Queue</h3>
          {pendingCount > 0 && (
            <Badge variant="warning">{pendingCount} pending</Badge>
          )}
        </div>
        {showResolved && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={filterStatus === 'pending' ? 'default' : 'outline'}
              onClick={() => setFilterStatus('pending')}
            >
              Pending
            </Button>
            <Button
              size="sm"
              variant={filterStatus === 'all' ? 'default' : 'outline'}
              onClick={() => setFilterStatus('all')}
            >
              All
            </Button>
          </div>
        )}
      </div>

      {/* Approval List */}
      {sortedApprovals.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">
            {filterStatus === 'pending'
              ? 'No pending approvals'
              : 'No approval requests'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedApprovals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onApprove={handleApprove}
              onReject={handleReject}
              onSelect={setSelectedApproval}
            />
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <ApprovalDetailDialog
        approval={selectedApproval}
        open={!!selectedApproval}
        onOpenChange={(open) => !open && setSelectedApproval(null)}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
}
