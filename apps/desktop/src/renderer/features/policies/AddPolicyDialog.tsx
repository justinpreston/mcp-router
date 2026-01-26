import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
} from '@renderer/components/ui';
import { usePolicyStore } from '@renderer/stores';

export interface AddPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ScopeType = 'global' | 'workspace' | 'server' | 'client';
type ResourceType = 'tool' | 'server' | 'resource';
type ActionType = 'allow' | 'deny' | 'require_approval';

export function AddPolicyDialog({ open, onOpenChange }: AddPolicyDialogProps) {
  const { addPolicy } = usePolicyStore();

  const [name, setName] = useState('');
  const [scope, setScope] = useState<ScopeType>('global');
  const [scopeId, setScopeId] = useState('');
  const [resourceType, setResourceType] = useState<ResourceType>('tool');
  const [pattern, setPattern] = useState('*');
  const [action, setAction] = useState<ActionType>('allow');
  const [priority, setPriority] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName('');
    setScope('global');
    setScopeId('');
    setResourceType('tool');
    setPattern('*');
    setAction('allow');
    setPriority(0);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onOpenChange(false);
  }, [resetForm, onOpenChange]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!name.trim()) {
        setError('Policy name is required');
        return;
      }

      if (!pattern.trim()) {
        setError('Pattern is required');
        return;
      }

      if (scope !== 'global' && !scopeId.trim()) {
        setError(`${scope} ID is required for non-global scope`);
        return;
      }

      setIsSubmitting(true);

      try {
        await addPolicy({
          name: name.trim(),
          scope,
          scopeId: scope === 'global' ? undefined : scopeId.trim(),
          resourceType,
          pattern: pattern.trim(),
          action,
          priority,
          enabled: true,
        });
        handleClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add policy');
      } finally {
        setIsSubmitting(false);
      }
    },
    [name, scope, scopeId, resourceType, pattern, action, priority, addPolicy, handleClose]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="add-policy-dialog">
        <DialogHeader>
          <DialogTitle>Add Policy Rule</DialogTitle>
          <DialogDescription>
            Create a new policy rule to control access to MCP resources.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Policy Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Policy Name</Label>
              <Input
                id="name"
                placeholder="Deny dangerous tools"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="policy-name-input"
              />
            </div>

            {/* Scope */}
            <div className="space-y-2">
              <Label>Scope</Label>
              <div className="flex gap-4">
                {(['global', 'client', 'server'] as const).map((s) => (
                  <label key={s} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="scope"
                      value={s}
                      checked={scope === s}
                      onChange={() => setScope(s)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm capitalize">{s}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Scope ID (for non-global) */}
            {scope !== 'global' && (
              <div className="space-y-2">
                <Label htmlFor="scopeId">{scope === 'client' ? 'Client ID' : 'Server ID'}</Label>
                <Input
                  id="scopeId"
                  placeholder={scope === 'client' ? 'client-id' : 'server-id'}
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                />
              </div>
            )}

            {/* Resource Type */}
            <div className="space-y-2">
              <Label>Resource Type</Label>
              <div className="flex flex-wrap gap-4">
                {(['tool', 'server', 'resource'] as const).map((rt) => (
                  <label key={rt} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="resourceType"
                      value={rt}
                      checked={resourceType === rt}
                      onChange={() => setResourceType(rt)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm capitalize">{rt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Pattern */}
            <div className="space-y-2">
              <Label htmlFor="pattern">Pattern (glob)</Label>
              <Input
                id="pattern"
                placeholder="dangerous-*, admin-*, *.delete"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                data-testid="policy-pattern-input"
              />
              <p className="text-xs text-muted-foreground">
                Use * for wildcards. Examples: dangerous-*, *.write, admin-*
              </p>
            </div>

            {/* Action */}
            <div className="space-y-2">
              <Label>Action</Label>
              <div className="flex gap-4" data-testid="policy-action-select">
                {(['allow', 'deny', 'require_approval'] as const).map((a) => (
                  <label key={a} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="action"
                      value={a}
                      checked={action === a}
                      onChange={() => setAction(a)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">
                      {a === 'require_approval' ? 'Require Approval' : a.charAt(0).toUpperCase() + a.slice(1)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label htmlFor="priority">Priority (higher = more specific)</Label>
              <Input
                id="priority"
                type="number"
                min={0}
                max={1000}
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Higher priority rules are evaluated first. Use 0-100 for general rules, 100+ for specific overrides.
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
              data-testid="cancel-button"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} data-testid="submit-button">
              {isSubmitting ? 'Adding...' : 'Add Policy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
