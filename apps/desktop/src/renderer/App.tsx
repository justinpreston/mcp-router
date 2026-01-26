import { useState } from 'react';
import { MainLayout } from '@renderer/features/layout/MainLayout';
import { NavItem } from '@renderer/features/layout/Sidebar';

// Placeholder pages - will be replaced with actual feature components
function ServersPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold">Servers</h2>
      <p className="mt-4 text-muted-foreground">Manage your MCP servers here.</p>
    </div>
  );
}

function PoliciesPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold">Policies</h2>
      <p className="mt-4 text-muted-foreground">Configure access policies.</p>
    </div>
  );
}

function ApprovalsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold">Approvals</h2>
      <p className="mt-4 text-muted-foreground">Review pending approval requests.</p>
    </div>
  );
}

function SettingsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold">Settings</h2>
      <p className="mt-4 text-muted-foreground">Application settings.</p>
    </div>
  );
}

export function App() {
  const [activeNav, setActiveNav] = useState<NavItem>('servers');

  const getPageTitle = () => {
    switch (activeNav) {
      case 'servers':
        return 'Servers';
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
        return <ServersPage />;
      case 'policies':
        return <PoliciesPage />;
      case 'approvals':
        return <ApprovalsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <ServersPage />;
    }
  };

  return (
    <MainLayout
      activeNav={activeNav}
      pageTitle={getPageTitle()}
      onNavigate={setActiveNav}
    >
      {renderPage()}
    </MainLayout>
  );
}
