import { ReactNode } from 'react';
import { Sidebar, NavItem } from './Sidebar';
import { Header } from './Header';

export interface MainLayoutProps {
  children: ReactNode;
  activeNav: NavItem;
  pageTitle: string;
  onNavigate: (item: NavItem) => void;
}

export function MainLayout({
  children,
  activeNav,
  pageTitle,
  onNavigate,
}: MainLayoutProps) {
  return (
    <div className="flex h-screen bg-background" data-testid="main-layout">
      {/* Sidebar */}
      <Sidebar activeItem={activeNav} onNavigate={onNavigate} />

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <Header title={pageTitle} />

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
