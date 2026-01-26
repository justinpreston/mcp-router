import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
} from '@renderer/components/ui';
import { useServerStore } from '@renderer/stores';

export interface AddServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TransportType = 'stdio' | 'http';

export function AddServerDialog({ open, onOpenChange }: AddServerDialogProps) {
  const { addServer } = useServerStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [transport, setTransport] = useState<TransportType>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setTransport('stdio');
    setCommand('');
    setArgs('');
    setUrl('');
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onOpenChange(false);
  }, [resetForm, onOpenChange]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!name.trim()) {
        setError('Server name is required');
        return;
      }

      if (transport === 'stdio' && !command.trim()) {
        setError('Command is required for stdio transport');
        return;
      }

      if (transport === 'http' && !url.trim()) {
        setError('URL is required for HTTP transport');
        return;
      }

      setIsSubmitting(true);

      try {
        const serverConfig =
          transport === 'stdio'
            ? {
                name: name.trim(),
                description: description.trim() || undefined,
                transport: 'stdio' as const,
                command: command.trim(),
                args: args
                  .split(' ')
                  .map((a) => a.trim())
                  .filter(Boolean),
              }
            : {
                name: name.trim(),
                description: description.trim() || undefined,
                transport: 'http' as const,
                url: url.trim(),
              };

        await addServer(serverConfig);
        handleClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add server');
      } finally {
        setIsSubmitting(false);
      }
    },
    [name, description, transport, command, args, url, addServer, handleClose]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="add-server-dialog">
        <DialogHeader>
          <DialogTitle>Add MCP Server</DialogTitle>
          <DialogDescription>
            Configure a new MCP server connection. Choose between stdio (local
            process) or HTTP transport.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Server Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Server Name</Label>
              <Input
                id="name"
                placeholder="My MCP Server"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="server-name-input"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="A brief description of this server"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Transport Type */}
            <div className="space-y-2">
              <Label>Transport Type</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="transport"
                    value="stdio"
                    checked={transport === 'stdio'}
                    onChange={() => setTransport('stdio')}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">stdio (Local Process)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="transport"
                    value="http"
                    checked={transport === 'http'}
                    onChange={() => setTransport('http')}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">HTTP</span>
                </label>
              </div>
            </div>

            {/* Stdio Config */}
            {transport === 'stdio' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="command">Command</Label>
                  <Input
                    id="command"
                    placeholder="npx, python, node, etc."
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    data-testid="server-command-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="args">Arguments (space-separated)</Label>
                  <Input
                    id="args"
                    placeholder="-m mcp_server --port 3000"
                    value={args}
                    onChange={(e) => setArgs(e.target.value)}
                    data-testid="server-args-input"
                  />
                </div>
              </>
            )}

            {/* HTTP Config */}
            {transport === 'http' && (
              <div className="space-y-2">
                <Label htmlFor="url">Server URL</Label>
                <Input
                  id="url"
                  placeholder="http://localhost:3000/mcp"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            )}

            {/* Error Display */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
              data-testid="cancel-button"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} data-testid="submit-button">
              {isSubmitting ? 'Adding...' : 'Add Server'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
