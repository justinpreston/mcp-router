import { useEffect } from 'react';
import { usePolicyStore, selectPolicies, selectSelectedPolicy } from '@renderer/stores';
import { PolicyCard } from './PolicyCard';
import type { PolicyInfo } from '@preload/api';

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
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">
          No policies configured. Click &quot;Add Policy&quot; to create one.
        </p>
      </div>
    );
  }

  // Sort by priority (higher first)
  const sortedPolicies = [...policies].sort((a, b) => b.priority - a.priority);

  return (
    <div className="space-y-3">
      {sortedPolicies.map((policy) => (
        <PolicyCard
          key={policy.id}
          policy={policy}
          isSelected={selectedPolicy?.id === policy.id}
          onSelect={handleSelect}
          onToggle={handleToggle}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
