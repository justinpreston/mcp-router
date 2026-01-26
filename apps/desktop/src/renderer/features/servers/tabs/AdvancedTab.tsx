import { Badge, Label, Separator } from '@renderer/components/ui';
import type { MCPServerInfo } from '@preload/api';

export interface AdvancedTabProps {
  server: MCPServerInfo;
}

export function AdvancedTab({ server }: AdvancedTabProps) {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Server Information */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Server Information</Label>
        <div className="rounded-md border p-4 space-y-3">
          <InfoRow label="Server ID" value={server.id} mono />
          <Separator />
          <InfoRow label="Status">
            <Badge
              variant={
                server.status === 'running'
                  ? 'success'
                  : server.status === 'error'
                  ? 'destructive'
                  : 'secondary'
              }
            >
              {server.status}
            </Badge>
          </InfoRow>
          <Separator />
          <InfoRow label="Transport" value={server.transport} />
          <Separator />
          <InfoRow label="Created" value={formatDate(server.createdAt)} />
          <Separator />
          <InfoRow label="Last Updated" value={formatDate(server.updatedAt)} />
        </div>
      </div>

      {/* Tools & Resources */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Capabilities</Label>
        <div className="rounded-md border p-4 space-y-3">
          <InfoRow
            label="Tools"
            value={`${server.tools?.length || 0} discovered`}
          />
          <Separator />
          <InfoRow
            label="Resources"
            value={`${server.resources?.length || 0} available`}
          />
        </div>
      </div>

      {/* Error Information */}
      {server.lastError && (
        <div className="space-y-3">
          <Label className="text-sm font-medium text-destructive">
            Last Error
          </Label>
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm font-mono text-destructive">
              {server.lastError}
            </p>
          </div>
        </div>
      )}

      {/* Project Association */}
      {server.projectId && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Project</Label>
          <div className="rounded-md border p-4">
            <InfoRow label="Project ID" value={server.projectId} mono />
          </div>
        </div>
      )}
    </div>
  );
}

interface InfoRowProps {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}

function InfoRow({ label, value, mono, children }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children || (
        <span className={`text-sm ${mono ? 'font-mono' : ''}`}>{value}</span>
      )}
    </div>
  );
}
