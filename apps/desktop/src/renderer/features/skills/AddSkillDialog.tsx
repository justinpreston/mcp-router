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
import { Textarea } from '@renderer/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import type { SkillCreateConfig, SkillSource } from '@preload/api';
import { FolderOpen } from 'lucide-react';
import { getElectronAPI } from '@renderer/hooks';

interface AddSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (config: SkillCreateConfig) => Promise<void>;
}

export function AddSkillDialog({ open, onOpenChange, onSubmit }: AddSkillDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [path, setPath] = useState('');
  const [url, setUrl] = useState('');
  const [source, setSource] = useState<SkillSource>('local');
  const [tags, setTags] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setDescription('');
    setPath('');
    setUrl('');
    setSource('local');
    setTags('');
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
      title: 'Select Skill Directory',
    });

    if (selectedPath) {
      setPath(selectedPath);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const config: SkillCreateConfig = {
        name: name.trim(),
        description: description.trim() || undefined,
        source,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };

      if (source === 'local' || source === 'symlink') {
        if (!path) {
          throw new Error('Path is required for local skills');
        }
        config.path = path;
      } else if (source === 'remote') {
        if (!url) {
          throw new Error('URL is required for remote skills');
        }
        config.url = url;
      }

      await onSubmit(config);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add skill');
    } finally {
      setIsSubmitting(false);
    }
  };

  const needsPath = source === 'local' || source === 'symlink';
  const needsUrl = source === 'remote';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="add-skill-dialog">
        <DialogHeader>
          <DialogTitle>Add Skill</DialogTitle>
          <DialogDescription>
            Register a new MCP skill from a local directory or remote source.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                data-testid="skill-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Skill"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                data-testid="skill-description-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="source">Source Type *</Label>
              <Select value={source} onValueChange={(v) => setSource(v as SkillSource)}>
                <SelectTrigger data-testid="skill-source-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local Directory</SelectItem>
                  <SelectItem value="symlink">Symlink</SelectItem>
                  <SelectItem value="remote">Remote URL</SelectItem>
                  <SelectItem value="builtin">Built-in</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {needsPath && (
              <div className="grid gap-2">
                <Label htmlFor="path">Path *</Label>
                <div className="flex gap-2">
                  <Input
                    id="path"
                    data-testid="skill-path-input"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="/path/to/skill"
                    className="flex-1"
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleSelectDirectory}
                    data-testid="skill-browse-button"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {needsUrl && (
              <div className="grid gap-2">
                <Label htmlFor="url">URL *</Label>
                <Input
                  id="url"
                  data-testid="skill-url-input"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/skill"
                  required
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                data-testid="skill-tags-input"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="tag1, tag2, tag3"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of tags for categorization
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} data-testid="skill-submit-button">
              {isSubmitting ? 'Adding...' : 'Add Skill'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
