import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@renderer/components/ui';
import { useServerStore } from '@renderer/stores';
import type { MCPServerInfo, ServerAddConfig } from '@preload/api';
import { GeneralTab } from './tabs/GeneralTab';
import { EnvironmentTab } from './tabs/EnvironmentTab';
import { PermissionsTab } from './tabs/PermissionsTab';
import { AdvancedTab } from './tabs/AdvancedTab';

export interface ServerSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: MCPServerInfo | null;
}

export interface ServerFormData {
  name: string;
  description: string;
  transport: 'stdio' | 'sse' | 'http';
  command: string;
  args: string[];
  url: string;
  env: Record<string, string>;
  toolPermissions: Record<string, boolean>;
}

export function ServerSettingsModal({
  open,
  onOpenChange,
  server,
}: ServerSettingsModalProps) {
  const { updateServer } = useServerStore();
  const [activeTab, setActiveTab] = useState('general');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<ServerFormData>({
    name: '',
    description: '',
    transport: 'stdio',
    command: '',
    args: [],
    url: '',
    env: {},
    toolPermissions: {},
  });

  // Populate form when server changes
  useEffect(() => {
    if (server) {
      setFormData({
        name: server.name,
        description: server.description || '',
        transport: server.transport,
        command: server.command,
        args: server.args,
        url: server.url || '',
        env: server.env || {},
        toolPermissions: server.toolPermissions || {},
      });
    }
  }, [server]);

  const handleFieldChange = useCallback(
    <K extends keyof ServerFormData>(field: K, value: ServerFormData[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setError(null);
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (!server) return;

    // Validate required fields
    if (!formData.name.trim()) {
      setError('Server name is required');
      setActiveTab('general');
      return;
    }

    if (formData.transport === 'stdio' && !formData.command.trim()) {
      setError('Command is required for stdio transport');
      setActiveTab('general');
      return;
    }

    if (
      (formData.transport === 'http' || formData.transport === 'sse') &&
      !formData.url.trim()
    ) {
      setError('URL is required for HTTP/SSE transport');
      setActiveTab('general');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const updates: Partial<ServerAddConfig> = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        transport: formData.transport,
        command: formData.command.trim() || undefined,
        args: formData.args,
        url: formData.url.trim() || undefined,
        env: Object.keys(formData.env).length > 0 ? formData.env : undefined,
        toolPermissions:
          Object.keys(formData.toolPermissions).length > 0
            ? formData.toolPermissions
            : undefined,
      };

      await updateServer(server.id, updates);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSubmitting(false);
    }
  }, [server, formData, updateServer, onOpenChange]);

  const handleClose = useCallback(() => {
    setError(null);
    setActiveTab('general');
    onOpenChange(false);
  }, [onOpenChange]);

  if (!server) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Server Settings</DialogTitle>
          <DialogDescription>
            Configure settings for {server.name}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="environment">Environment</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <div className="min-h-[300px] py-4">
            <TabsContent value="general" className="mt-0">
              <GeneralTab
                formData={formData}
                onFieldChange={handleFieldChange}
              />
            </TabsContent>

            <TabsContent value="environment" className="mt-0">
              <EnvironmentTab
                env={formData.env}
                onChange={(env) => handleFieldChange('env', env)}
              />
            </TabsContent>

            <TabsContent value="permissions" className="mt-0">
              <PermissionsTab
                server={server}
                permissions={formData.toolPermissions}
                onChange={(permissions) =>
                  handleFieldChange('toolPermissions', permissions)
                }
              />
            </TabsContent>

            <TabsContent value="advanced" className="mt-0">
              <AdvancedTab server={server} />
            </TabsContent>
          </div>
        </Tabs>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
