import { useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Badge,
  Button,
} from '@renderer/components/ui';
import type { PolicyInfo } from '@preload/api';

export interface PolicyCardProps {
  policy: PolicyInfo;
  isSelected?: boolean;
  onSelect?: (policy: PolicyInfo) => void;
  onToggle?: (policyId: string, enabled: boolean) => void;
  onDelete?: (policyId: string) => void;
}

export function PolicyCard({
  policy,
  isSelected = false,
  onSelect,
  onToggle,
  onDelete,
}: PolicyCardProps) {
  const handleSelect = useCallback(() => {
    onSelect?.(policy);
  }, [policy, onSelect]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle?.(policy.id, !policy.enabled);
    },
    [policy.id, policy.enabled, onToggle]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete?.(policy.id);
    },
    [policy.id, onDelete]
  );

  const getActionVariant = (action: PolicyInfo['action']) => {
    switch (action) {
      case 'allow':
        return 'success';
      case 'deny':
        return 'destructive';
      case 'require_approval':
        return 'warning';
      default:
        return 'secondary';
    }
  };

  const getScopeLabel = (scope: PolicyInfo['scope'], scopeId?: string) => {
    if (scope === 'global') return 'Global';
    if (scopeId) return `${scope}: ${scopeId}`;
    return scope;
  };

  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-accent/50 ${
        isSelected ? 'ring-2 ring-primary' : ''
      } ${!policy.enabled ? 'opacity-60' : ''}`}
      onClick={handleSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium">{policy.name}</span>
            <Badge variant={getActionVariant(policy.action)}>
              {policy.action}
            </Badge>
            {!policy.enabled && (
              <Badge variant="outline">Disabled</Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            Priority: {policy.priority}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1 text-sm">
            <div className="flex gap-4">
              <span className="text-muted-foreground">
                Scope: <span className="text-foreground">{getScopeLabel(policy.scope, policy.scopeId)}</span>
              </span>
              <span className="text-muted-foreground">
                Type: <span className="text-foreground">{policy.resourceType}</span>
              </span>
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              Pattern: {policy.pattern}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={policy.enabled ? 'outline' : 'default'}
              onClick={handleToggle}
            >
              {policy.enabled ? 'Disable' : 'Enable'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
