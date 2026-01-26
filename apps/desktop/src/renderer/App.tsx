import { useState } from 'react';
import { MainLayout } from '@renderer/features/layout/MainLayout';
import { NavItem } from '@renderer/features/layout/Sidebar';
import { Dashboard } from '@renderer/features/dashboard';
import { PolicyList, AddPolicyDialog } from '@renderer/features/policies';
import { ApprovalQueue } from '@renderer/features/approvals';
import { SkillList } from '@renderer/features/skills';
import { TooltipProvider } from '@renderer/components/ui';

// Settings page - will be expanded later
function SettingsPage() {
  return (
    <div data-testid="settings-page">
      <h2 className="text-2xl font-bold">Settings</h2>
      <p className="mt-4 text-muted-foreground">Application settings.</p>
    </div>
  );
}

export function App() {
  const [activeNav, setActiveNav] = useState<NavItem>('servers');
  const [isPolicyDialogOpen, setIsPolicyDialogOpen] = useState(false);

  const getPageTitle = () => {
    switch (activeNav) {
      case 'servers':
        return 'Servers';
      case 'skills':
        return 'Skills';
      case 'policies':
        return 'Policies';
      case 'approvals':
        return 'Approvals';
      case 'settings':
        return 'Settings';
      default:
        return 'MCP Router';
    }
  };

  const renderPage = () => {
    switch (activeNav) {
      case 'servers':
        return <Dashboard />;
      case 'skills':
        return <SkillList />;
      case 'policies':
        return (
          <>
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => setIsPolicyDialogOpen(true)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                data-testid="add-policy-button"
              >
                Add Policy
              </button>
            </div>
            <PolicyList />
            <AddPolicyDialog
              open={isPolicyDialogOpen}
              onOpenChange={setIsPolicyDialogOpen}
            />
          </>
        );
      case 'approvals':
        return <ApprovalQueue />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <TooltipProvider>
      <MainLayout
        activeNav={activeNav}
        pageTitle={getPageTitle()}
        onNavigate={setActiveNav}
      >
        {renderPage()}
      </MainLayout>
    </TooltipProvider>
  );
}
