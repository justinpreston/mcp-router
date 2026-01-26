import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
  Input,
  Label,
} from '@renderer/components/ui';
import type { ApprovalInfo } from '@preload/api';

export interface ApprovalDetailDialogProps {
  approval: ApprovalInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string, reason?: string) => void;
}

export function ApprovalDetailDialog({
  approval,
  open,
  onOpenChange,
  onApprove,
  onReject,
}: ApprovalDetailDialogProps) {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const handleApprove = useCallback(() => {
    if (approval) {
      onApprove?.(approval.id);
      onOpenChange(false);
    }
  }, [approval, onApprove, onOpenChange]);

  const handleReject = useCallback(() => {
    if (approval) {
      onReject?.(approval.id, rejectReason || undefined);
      setRejectReason('');
      setShowRejectInput(false);
      onOpenChange(false);
    }
  }, [approval, rejectReason, onReject, onOpenChange]);

  const handleClose = useCallback(() => {
    setRejectReason('');
    setShowRejectInput(false);
    onOpenChange(false);
  }, [onOpenChange]);

  if (!approval) return null;

  const getStatusVariant = (status: ApprovalInfo['status']) => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'approved':
        return 'success';
      case 'rejected':
        return 'destructive';
      case 'expired':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]" data-testid="approval-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Approval Request
            <Badge variant={getStatusVariant(approval.status)}>
              {approval.status}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Review and approve or reject this tool execution request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Tool Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Tool</h4>
            <div className="rounded-lg bg-muted p-3">
              <span className="font-mono text-lg">{approval.toolName}</span>
            </div>
          </div>

          {/* Context */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Client ID</h4>
              <div className="rounded-lg bg-muted p-3">
                <span className="font-mono text-sm">{approval.clientId}</span>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Server ID</h4>
              <div className="rounded-lg bg-muted p-3">
                <span className="font-mono text-sm">{approval.serverId}</span>
              </div>
            </div>
          </div>

          {/* Arguments */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Tool Arguments</h4>
            <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-sm">
              {approval.toolArguments
                ? JSON.stringify(approval.toolArguments, null, 2)
                : '(no arguments)'}
            </pre>
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Requested:</span>{' '}
              <span>{new Date(approval.requestedAt).toLocaleString()}</span>
            </div>
            {approval.status !== 'pending' && approval.respondedAt && (
              <div>
                <span className="text-muted-foreground">Resolved:</span>{' '}
                <span>{new Date(approval.respondedAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Rejection reason (if rejected) */}
          {approval.status === 'rejected' && approval.responseNote && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Rejection Reason</h4>
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                <span className="text-sm">{approval.responseNote}</span>
              </div>
            </div>
          )}

          {/* Reject reason input (for pending) */}
          {approval.status === 'pending' && showRejectInput && (
            <div className="space-y-2">
              <Label htmlFor="rejectReason">Rejection Reason (optional)</Label>
              <Input
                id="rejectReason"
                placeholder="Enter a reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          {approval.status === 'pending' ? (
            <>
              {showRejectInput ? (
                <>
                  <Button variant="outline" onClick={() => setShowRejectInput(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                  >
                    Confirm Reject
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setShowRejectInput(true)}
                    data-testid="reject-button"
                  >
                    Reject
                  </Button>
                  <Button onClick={handleApprove} data-testid="approve-button">Approve</Button>
                </>
              )}
            </>
          ) : (
            <Button variant="outline" onClick={handleClose} data-testid="close-dialog-button">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
