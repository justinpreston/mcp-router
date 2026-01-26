import {
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui';
import type { ServerFormData } from '../ServerSettingsModal';

export interface GeneralTabProps {
  formData: ServerFormData;
  onFieldChange: <K extends keyof ServerFormData>(
    field: K,
    value: ServerFormData[K]
  ) => void;
}

export function GeneralTab({ formData, onFieldChange }: GeneralTabProps) {
  return (
    <div className="space-y-4">
      {/* Server Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Server Name</Label>
        <Input
          id="name"
          placeholder="My MCP Server"
          value={formData.name}
          onChange={(e) => onFieldChange('name', e.target.value)}
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="A brief description of this server..."
          value={formData.description}
          onChange={(e) => onFieldChange('description', e.target.value)}
          rows={2}
        />
      </div>

      {/* Transport Type */}
      <div className="space-y-2">
        <Label>Transport Type</Label>
        <Select
          value={formData.transport}
          onValueChange={(value: 'stdio' | 'sse' | 'http') =>
            onFieldChange('transport', value)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select transport" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stdio">stdio (Local Process)</SelectItem>
            <SelectItem value="http">HTTP</SelectItem>
            <SelectItem value="sse">SSE (Server-Sent Events)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Command (for stdio) */}
      {formData.transport === 'stdio' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="command">Command</Label>
            <Input
              id="command"
              placeholder="node, python, npx, etc."
              value={formData.command}
              onChange={(e) => onFieldChange('command', e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              The command to execute the MCP server process
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="args">Arguments</Label>
            <Input
              id="args"
              placeholder="server.js --port 3000"
              value={formData.args.join(' ')}
              onChange={(e) =>
                onFieldChange(
                  'args',
                  e.target.value
                    .split(' ')
                    .filter((a) => a.trim())
                )
              }
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Space-separated arguments passed to the command
            </p>
          </div>
        </>
      )}

      {/* URL (for http/sse) */}
      {(formData.transport === 'http' || formData.transport === 'sse') && (
        <div className="space-y-2">
          <Label htmlFor="url">Server URL</Label>
          <Input
            id="url"
            type="url"
            placeholder="http://localhost:3000"
            value={formData.url}
            onChange={(e) => onFieldChange('url', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The HTTP endpoint for the MCP server
          </p>
        </div>
      )}
    </div>
  );
}
