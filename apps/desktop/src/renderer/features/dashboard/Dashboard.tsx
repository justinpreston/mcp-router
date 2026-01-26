import { useState, useCallback, useMemo } from 'react';
import { useServerStore, selectServers } from '@renderer/stores';
import { ServerListSection } from './ServerListSection';
import { SearchFilter } from './SearchFilter';
import { QuickActions } from './QuickActions';
import { AddServerDialog } from '@renderer/features/servers';
import type { MCPServerInfo } from '@preload/api';

export interface DashboardProps {
  onServerSelect?: (server: MCPServerInfo) => void;
}

export function Dashboard({ onServerSelect }: DashboardProps) {
  const servers = useServerStore(selectServers);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Filter servers based on search and status
  const filteredServers = useMemo(() => {
    return servers.filter((server) => {
      const matchesSearch =
        searchQuery === '' ||
        server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        server.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        filterStatus === 'all' || server.status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [servers, searchQuery, filterStatus]);

  // Group servers by status for statistics
  const serverStats = useMemo(() => {
    return {
      total: servers.length,
      running: servers.filter((s) => s.status === 'running').length,
      stopped: servers.filter((s) => s.status === 'stopped').length,
      error: servers.filter((s) => s.status === 'error').length,
    };
  }, [servers]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleStatusFilter = useCallback((status: string) => {
    setFilterStatus(status);
  }, []);

  const handleAddServer = useCallback(() => {
    setIsAddDialogOpen(true);
  }, []);

  const handleRefresh = useCallback(() => {
    useServerStore.getState().fetchServers();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Quick Actions Bar */}
      <QuickActions
        stats={serverStats}
        onAddServer={handleAddServer}
        onRefresh={handleRefresh}
      />

      {/* Search and Filter */}
      <SearchFilter
        searchQuery={searchQuery}
        filterStatus={filterStatus}
        onSearchChange={handleSearch}
        onStatusChange={handleStatusFilter}
      />

      {/* Server List */}
      <ServerListSection
        servers={filteredServers}
        onServerSelect={onServerSelect}
      />

      {/* Add Server Dialog */}
      <AddServerDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
      />
    </div>
  );
}
