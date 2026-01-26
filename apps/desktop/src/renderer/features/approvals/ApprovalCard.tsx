import { useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Badge,
  Button,
} from '@renderer/components/ui';
import type { ApprovalInfo } from '@preload/api';

export interface ApprovalCardProps {
  approval: ApprovalInfo;
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string, reason?: string) => void;
  onSelect?: (approval: ApprovalInfo) => void;
}

export function ApprovalCard({
  approval,
  onApprove,
  onReject,
  onSelect,
}: ApprovalCardProps) {
  const handleApprove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onApprove?.(approval.id);
    },
    [approval.id, onApprove]
  );

  const handleReject = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onReject?.(approval.id);
    },
    [approval.id, onReject]
  );

  const handleSelect = useCallback(() => {
    onSelect?.(approval);
  }, [approval, onSelect]);

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

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-accent/50 ${
        approval.status !== 'pending' ? 'opacity-60' : ''
      }`}
      onClick={handleSelect}
      data-testid="approval-card"
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium" data-testid="approval-tool-name">
              {approval.toolName}
            </span>
            <Badge variant={getStatusVariant(approval.status)}>
              {approval.status}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {getTimeAgo(approval.requestedAt)}
          </span>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Client: {approval.clientId}</span>
          <span>Server: {approval.serverId}</span>
        </div>
      </CardHeader>
      <CardContent>
        {/* Tool Arguments Preview */}
        {approval.toolArguments && Object.keys(approval.toolArguments).length > 0 && (
          <div className="mb-3">
            <pre className="max-h-24 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(approval.toolArguments, null, 2)}
            </pre>
          </div>
        )}

        {/* Actions */}
        {approval.status === 'pending' && (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={handleReject}
            >
              Reject
            </Button>
            <Button size="sm" onClick={handleApprove}>
              Approve
            </Button>
          </div>
        )}

        {/* Result for non-pending */}
        {approval.status !== 'pending' && approval.respondedAt && (
          <div className="text-sm">
            {approval.status === 'approved' && (
              <span className="text-green-600">
                Approved at {formatTime(approval.respondedAt)}
              </span>
            )}
            {approval.status === 'rejected' && (
              <span className="text-red-600">
                Rejected at {formatTime(approval.respondedAt)}
                {approval.responseNote && `: ${approval.responseNote}`}
              </span>
            )}
            {approval.status === 'expired' && (
              <span className="text-muted-foreground">
                Expired at {formatTime(approval.expiresAt)}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
