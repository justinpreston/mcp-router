import { useState, useCallback, useRef } from 'react';
import {
  Server,
  Terminal,
  Globe,
  Radio,
  Plus,
  Trash2,
  GripVertical,
  Folder,
  Key,
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { Textarea } from '@renderer/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card';
import { Separator } from '@renderer/components/ui/separator';
import { cn } from '@renderer/lib/utils';

export type TransportType = 'stdio' | 'sse' | 'http';

export interface ServerFormData {
  name: string;
  description: string;
  transport: TransportType;
  // stdio fields
  command: string;
  args: string[];
  cwd: string;
  // sse/http fields
  url: string;
  headers: Array<{ key: string; value: string }>;
  // environment
  env: Array<{ key: string; value: string }>;
}

export interface ManualServerFormProps {
  initialData?: Partial<ServerFormData>;
  onSubmit: (data: ServerFormData) => Promise<void>;
  onCancel: () => void;
  onTestConnection?: (data: ServerFormData) => Promise<{ success: boolean; message: string }>;
}

interface DraggableListProps {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}

/**
 * DraggableList - Reorderable list of string items.
 */
function DraggableList({ items, onChange, placeholder }: DraggableListProps) {
  const [newItem, setNewItem] = useState('');
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null) {
      const newItems = [...items];
      const draggedItem = newItems[dragItem.current];
      newItems.splice(dragItem.current, 1);
      newItems.splice(dragOverItem.current, 0, draggedItem!);
      onChange(newItems);
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleAdd = () => {
    if (newItem.trim()) {
      onChange([...items, newItem.trim()]);
      setNewItem('');
    }
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={index}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragEnter={() => handleDragEnter(index)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => e.preventDefault()}
          className={cn(
            'flex items-center gap-2 p-2 rounded-md border bg-muted/50',
            'cursor-grab active:cursor-grabbing'
          )}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
          <code className="flex-1 text-sm font-mono">{item}</code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleRemove(index)}
            className="h-6 w-6"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 font-mono text-sm"
        />
        <Button type="button" variant="outline" size="icon" onClick={handleAdd}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

interface KeyValueEditorProps {
  items: Array<{ key: string; value: string }>;
  onChange: (items: Array<{ key: string; value: string }>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  onImportEnv?: () => void;
}

/**
 * KeyValueEditor - Editor for key-value pairs (env vars, headers).
 */
function KeyValueEditor({
  items,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  onImportEnv,
}: KeyValueEditorProps) {
  const handleAdd = () => {
    onChange([...items, { key: '', value: '' }]);
  };

  const handleUpdate = (index: number, field: 'key' | 'value', value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index]!, [field]: value };
    onChange(newItems);
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex gap-2">
          <Input
            value={item.key}
            onChange={(e) => handleUpdate(index, 'key', e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 font-mono text-sm"
          />
          <Input
            value={item.value}
            onChange={(e) => handleUpdate(index, 'value', e.target.value)}
            placeholder={valuePlaceholder}
            className="flex-[2] font-mono text-sm"
            type={item.key.toLowerCase().includes('secret') || item.key.toLowerCase().includes('password') || item.key.toLowerCase().includes('token') ? 'password' : 'text'}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleRemove(index)}
            className="shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="gap-1">
          <Plus className="w-4 h-4" />
          Add
        </Button>
        {onImportEnv && (
          <Button type="button" variant="outline" size="sm" onClick={onImportEnv} className="gap-1">
            <Upload className="w-4 h-4" />
            Import .env
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * ManualServerForm - Advanced server configuration form.
 */
export function ManualServerForm({
  initialData,
  onSubmit,
  onCancel,
  onTestConnection,
}: ManualServerFormProps) {
  const [formData, setFormData] = useState<ServerFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    transport: initialData?.transport || 'stdio',
    command: initialData?.command || '',
    args: initialData?.args || [],
    cwd: initialData?.cwd || '',
    url: initialData?.url || '',
    headers: initialData?.headers || [],
    env: initialData?.env || [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const updateField = <K extends keyof ServerFormData>(field: K, value: ServerFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when field changes
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    // Reset test result when form changes
    setTestResult(null);
  };

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Server name is required';
    }

    if (formData.transport === 'stdio') {
      if (!formData.command.trim()) {
        newErrors.command = 'Command is required for stdio transport';
      }
    } else {
      if (!formData.url.trim()) {
        newErrors.url = 'URL is required';
      } else {
        try {
          new URL(formData.url);
        } catch {
          newErrors.url = 'Invalid URL format';
        }
      }
    }

    // Validate env keys
    const envKeys = new Set<string>();
    formData.env.forEach((item, index) => {
      if (item.key && envKeys.has(item.key)) {
        newErrors[`env_${index}`] = `Duplicate key: ${item.key}`;
      }
      envKeys.add(item.key);
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : 'Failed to save server configuration',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTest = async () => {
    if (!validate() || !onTestConnection) return;

    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await onTestConnection(formData);
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleImportEnv = async () => {
    try {
      // Open file dialog for .env files
      const filePaths = await window.electron.app.openFileDialog({
        title: 'Import Environment File',
        filters: [
          { name: 'Environment Files', extensions: ['env'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (filePaths.length === 0) {
        return; // User cancelled
      }

      // Read the file
      const content = await window.electron.app.readFile(filePaths[0]!);

      // Parse .env file format
      const parsedEnv = parseEnvFile(content);

      if (parsedEnv.length === 0) {
        console.warn('No valid environment variables found in file');
        return;
      }

      // Merge with existing env vars (new values override existing)
      const newEnvVars = [
        ...formData.env.filter((e) => !parsedEnv.some((p) => p.key === e.key)),
        ...parsedEnv,
      ];

      setFormData((prev) => ({
        ...prev,
        env: newEnvVars,
      }));

      console.log(`Imported ${parsedEnv.length} environment variables`);
    } catch (error) {
      console.error('Failed to import .env file:', error);
    }
  };

  /**
   * Parse .env file content into key-value pairs.
   * Handles comments, empty lines, and quoted values.
   */
  const parseEnvFile = (content: string): Array<{ key: string; value: string }> => {
    const lines = content.split('\n');
    const result: Array<{ key: string; value: string }> = [];

    for (const line of lines) {
      // Skip empty lines and comments
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Find the first = sign
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex === -1) {
        continue;
      }

      const key = trimmed.substring(0, equalIndex).trim();
      let value = trimmed.substring(equalIndex + 1).trim();

      // Skip invalid keys
      if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        continue;
      }

      // Handle quoted values
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Handle escape sequences in double-quoted strings
      if (trimmed.substring(equalIndex + 1).trim().startsWith('"')) {
        value = value
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\')
          .replace(/\\"/g, '"');
      }

      result.push({ key, value });
    }

    return result;
  };

  const transportOptions: Array<{ value: TransportType; label: string; icon: React.ReactNode; description: string }> = [
    {
      value: 'stdio',
      label: 'stdio',
      icon: <Terminal className="w-5 h-5" />,
      description: 'Run as local process with stdin/stdout',
    },
    {
      value: 'sse',
      label: 'SSE',
      icon: <Radio className="w-5 h-5" />,
      description: 'Server-Sent Events over HTTP',
    },
    {
      value: 'http',
      label: 'HTTP',
      icon: <Globe className="w-5 h-5" />,
      description: 'HTTP/JSON-RPC transport',
    },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="manual-server-form">
      {/* Basic Info Section */}
      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="w-4 h-4" />
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Server Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="My MCP Server"
                className={cn(errors.name && 'border-destructive')}
                data-testid="server-name-input"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="A brief description of this server's capabilities..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Transport Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transport Type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {transportOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateField('transport', option.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors',
                    formData.transport === option.value
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-muted-foreground/30'
                  )}
                >
                  {option.icon}
                  <span className="font-medium text-sm">{option.label}</span>
                  <span className="text-xs text-muted-foreground text-center">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>

            <Separator />

            {/* stdio specific fields */}
            {formData.transport === 'stdio' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="command">
                    Command <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="command"
                    value={formData.command}
                    onChange={(e) => updateField('command', e.target.value)}
                    placeholder="npx, python, node, uvx..."
                    className={cn('font-mono', errors.command && 'border-destructive')}
                    data-testid="server-command-input"
                  />
                  {errors.command && (
                    <p className="text-sm text-destructive">{errors.command}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Arguments</Label>
                  <DraggableList
                    items={formData.args}
                    onChange={(args) => updateField('args', args)}
                    placeholder="Add argument..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cwd" className="flex items-center gap-2">
                    <Folder className="w-4 h-4" />
                    Working Directory
                  </Label>
                  <Input
                    id="cwd"
                    value={formData.cwd}
                    onChange={(e) => updateField('cwd', e.target.value)}
                    placeholder="/path/to/working/directory (optional)"
                    className="font-mono"
                  />
                </div>
              </div>
            )}

            {/* SSE/HTTP specific fields */}
            {(formData.transport === 'sse' || formData.transport === 'http') && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="url">
                    Server URL <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="url"
                    value={formData.url}
                    onChange={(e) => updateField('url', e.target.value)}
                    placeholder={
                      formData.transport === 'sse'
                        ? 'http://localhost:3000/sse'
                        : 'http://localhost:3000/mcp'
                    }
                    className={cn('font-mono', errors.url && 'border-destructive')}
                    data-testid="server-url-input"
                  />
                  {errors.url && (
                    <p className="text-sm text-destructive">{errors.url}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Headers</Label>
                  <KeyValueEditor
                    items={formData.headers}
                    onChange={(headers) => updateField('headers', headers)}
                    keyPlaceholder="Header name"
                    valuePlaceholder="Header value"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Environment Variables Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="w-4 h-4" />
              Environment Variables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueEditor
              items={formData.env}
              onChange={(env) => updateField('env', env)}
              keyPlaceholder="Variable name"
              valuePlaceholder="Value"
              onImportEnv={handleImportEnv}
            />
          </CardContent>
        </Card>

        {/* Test Connection Section */}
        {onTestConnection && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Test Connection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTest}
                  disabled={isTesting}
                  className="gap-2"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Radio className="w-4 h-4" />
                      Test Connection
                    </>
                  )}
                </Button>

                {testResult && (
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                        <span className="text-sm text-green-600">{testResult.message}</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 text-destructive" />
                        <span className="text-sm text-destructive">{testResult.message}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit Error */}
        {errors.submit && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{errors.submit}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="gap-2">
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Server'
            )}
          </Button>
        </div>
      </form>
  );
}

export default ManualServerForm;
