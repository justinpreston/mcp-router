import { useCallback } from 'react';
import { Label, Switch, ScrollArea, Separator } from '@renderer/components/ui';
import type { MCPServerInfo } from '@preload/api';

export interface PermissionsTabProps {
  server: MCPServerInfo;
  permissions: Record<string, boolean>;
  onChange: (permissions: Record<string, boolean>) => void;
}

export function PermissionsTab({
  server,
  permissions,
  onChange,
}: PermissionsTabProps) {
  const tools = server.tools || [];

  const handleToggle = useCallback(
    (toolName: string, enabled: boolean) => {
      onChange({
        ...permissions,
        [toolName]: enabled,
      });
    },
    [permissions, onChange]
  );

  const handleToggleAll = useCallback(
    (enabled: boolean) => {
      const newPermissions: Record<string, boolean> = {};
      tools.forEach((tool) => {
        newPermissions[tool.name] = enabled;
      });
      onChange(newPermissions);
    },
    [tools, onChange]
  );

  const enabledCount = tools.filter(
    (tool) => permissions[tool.name] !== false
  ).length;

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Tool Permissions</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Control which tools are accessible through this server.
        </p>
      </div>

      {tools.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center rounded-md border">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              No tools discovered yet.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Start the server to discover available tools.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Bulk Actions */}
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">
              {enabledCount} of {tools.length} tools enabled
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handleToggleAll(true)}
                className="text-xs text-primary hover:underline"
              >
                Enable all
              </button>
              <Separator orientation="vertical" className="h-4" />
              <button
                onClick={() => handleToggleAll(false)}
                className="text-xs text-primary hover:underline"
              >
                Disable all
              </button>
            </div>
          </div>

          {/* Tool List */}
          <ScrollArea className="h-[200px] rounded-md border">
            <div className="p-3 space-y-3">
              {tools.map((tool) => {
                const isEnabled = permissions[tool.name] !== false;

                return (
                  <div
                    key={tool.name}
                    className="flex items-start justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm">{tool.name}</p>
                      {tool.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {tool.description}
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) =>
                        handleToggle(tool.name, checked)
                      }
                    />
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
