import { useState } from 'react';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { FolderOpen, Search } from 'lucide-react';
import { getElectronAPI } from '@renderer/hooks';
import type { SkillInfo } from '@preload/api';

interface DiscoverSkillsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscover: (directory: string) => Promise<SkillInfo[]>;
}

export function DiscoverSkillsDialog({
  open,
  onOpenChange,
  onDiscover,
}: DiscoverSkillsDialogProps) {
  const [directory, setDirectory] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<SkillInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setDirectory('');
    setDiscovered(null);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSelectDirectory = async () => {
    const api = getElectronAPI();
    if (!api) return;

    const selectedPath = await api.app.selectDirectory({
      title: 'Select Directory to Scan',
    });

    if (selectedPath) {
      setDirectory(selectedPath);
    }
  };

  const handleDiscover = async () => {
    if (!directory.trim()) {
      setError('Please select a directory');
      return;
    }

    setError(null);
    setIsDiscovering(true);
    setDiscovered(null);

    try {
      const skills = await onDiscover(directory);
      setDiscovered(skills);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover skills');
    } finally {
      setIsDiscovering(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="discover-skills-dialog">
        <DialogHeader>
          <DialogTitle>Discover Skills</DialogTitle>
          <DialogDescription>
            Scan a directory to find MCP skills with manifest files.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="directory">Directory</Label>
            <div className="flex gap-2">
              <Input
                id="directory"
                data-testid="discover-directory-input"
                value={directory}
                onChange={(e) => setDirectory(e.target.value)}
                placeholder="/path/to/skills"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleSelectDirectory}
                data-testid="discover-browse-button"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button
            onClick={handleDiscover}
            disabled={isDiscovering || !directory.trim()}
            data-testid="discover-scan-button"
          >
            <Search className="mr-2 h-4 w-4" />
            {isDiscovering ? 'Scanning...' : 'Scan Directory'}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {discovered !== null && (
            <div className="rounded-lg border p-4">
              {discovered.length === 0 ? (
                <p className="text-sm text-muted-foreground">No skills found in this directory.</p>
              ) : (
                <>
                  <p className="mb-2 text-sm font-medium">
                    Found {discovered.length} skill{discovered.length !== 1 ? 's' : ''}:
                  </p>
                  <ul className="space-y-1">
                    {discovered.map((skill) => (
                      <li key={skill.id} className="text-sm">
                        <span className="font-medium">{skill.name}</span>
                        {skill.description && (
                          <span className="text-muted-foreground"> - {skill.description}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {discovered !== null ? 'Close' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
