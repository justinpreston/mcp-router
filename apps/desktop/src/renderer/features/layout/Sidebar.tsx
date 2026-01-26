import { useCallback } from 'react';
import { Button, Badge } from '@renderer/components/ui';
import { useApprovalStore, selectPendingCount } from '@renderer/stores';

export type NavItem = 'servers' | 'skills' | 'policies' | 'approvals' | 'settings';

export interface SidebarProps {
  activeItem: NavItem;
  onNavigate: (item: NavItem) => void;
}

interface NavButtonProps {
  item: NavItem;
  label: string;
  isActive: boolean;
  badge?: number;
  onClick: () => void;
}

function NavButton({ item, label, isActive, badge, onClick }: NavButtonProps) {
  return (
    <Button
      variant={isActive ? 'secondary' : 'ghost'}
      className={`w-full justify-start ${isActive ? 'bg-accent' : ''}`}
      onClick={onClick}
      data-testid={`nav-${item}`}
    >
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && (
        <Badge variant="warning" className="ml-2">
          {badge}
        </Badge>
      )}
    </Button>
  );
}

export function Sidebar({ activeItem, onNavigate }: SidebarProps) {
  const pendingCount = useApprovalStore(selectPendingCount);

  const handleNavigate = useCallback(
    (item: NavItem) => () => {
      onNavigate(item);
    },
    [onNavigate]
  );

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-card" data-testid="sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center border-b px-4">
        <h1 className="text-lg font-semibold">MCP Router</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        <NavButton
          item="servers"
          label="Servers"
          isActive={activeItem === 'servers'}
          onClick={handleNavigate('servers')}
        />
        <NavButton
          item="skills"
          label="Skills"
          isActive={activeItem === 'skills'}
          onClick={handleNavigate('skills')}
        />
        <NavButton
          item="policies"
          label="Policies"
          isActive={activeItem === 'policies'}
          onClick={handleNavigate('policies')}
        />
        <NavButton
          item="approvals"
          label="Approvals"
          isActive={activeItem === 'approvals'}
          badge={pendingCount}
          onClick={handleNavigate('approvals')}
        />
      </nav>

      {/* Footer */}
      <div className="border-t p-3">
        <NavButton
          item="settings"
          label="Settings"
          isActive={activeItem === 'settings'}
          onClick={handleNavigate('settings')}
        />
      </div>
    </aside>
  );
}
