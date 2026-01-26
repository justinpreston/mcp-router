import { useState, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  ScrollArea,
} from '@renderer/components/ui';

export interface EnvironmentTabProps {
  env: Record<string, string>;
  onChange: (env: Record<string, string>) => void;
}

export function EnvironmentTab({ env, onChange }: EnvironmentTabProps) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const envEntries = Object.entries(env);

  const handleAdd = useCallback(() => {
    if (!newKey.trim()) return;

    onChange({
      ...env,
      [newKey.trim()]: newValue,
    });
    setNewKey('');
    setNewValue('');
  }, [env, newKey, newValue, onChange]);

  const handleRemove = useCallback(
    (key: string) => {
      const newEnv = { ...env };
      delete newEnv[key];
      onChange(newEnv);
    },
    [env, onChange]
  );

  const handleUpdate = useCallback(
    (key: string, value: string) => {
      onChange({
        ...env,
        [key]: value,
      });
    },
    [env, onChange]
  );

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Environment Variables</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Define environment variables passed to the server process.
        </p>
      </div>

      {/* Existing Variables */}
      <ScrollArea className="h-[200px] rounded-md border">
        <div className="p-3 space-y-2">
          {envEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No environment variables defined.
            </p>
          ) : (
            envEntries.map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <Input
                  value={key}
                  disabled
                  className="w-1/3 font-mono text-sm"
                />
                <span className="text-muted-foreground">=</span>
                <Input
                  value={value}
                  onChange={(e) => handleUpdate(key, e.target.value)}
                  className="flex-1 font-mono text-sm"
                  placeholder="Value"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(key)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Add New Variable */}
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="new-key" className="text-xs">
            Key
          </Label>
          <Input
            id="new-key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="VARIABLE_NAME"
            className="font-mono text-sm"
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor="new-value" className="text-xs">
            Value
          </Label>
          <Input
            id="new-value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            className="font-mono text-sm"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={handleAdd}
          disabled={!newKey.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
