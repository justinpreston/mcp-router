import { Button } from '@renderer/components/ui';
import { useWindowControls, useAppInfo } from '@renderer/hooks';
import { useEffect, useState } from 'react';

export interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { minimize, maximize, close } = useWindowControls();
  const { getVersion } = useAppInfo();
  const [version, setVersion] = useState('');

  useEffect(() => {
    getVersion().then(setVersion);
  }, [getVersion]);

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4 drag-region">
      {/* Title */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-medium" data-testid="page-title">{title}</h2>
        {version && (
          <span className="text-xs text-muted-foreground">v{version}</span>
        )}
      </div>

      {/* Window Controls (for frameless window) */}
      <div className="flex gap-1 no-drag">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={minimize}
        >
          <span className="text-lg leading-none">&#x2212;</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={maximize}
        >
          <span className="text-sm leading-none">&#x25A1;</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground"
          onClick={close}
        >
          <span className="text-lg leading-none">&times;</span>
        </Button>
      </div>
    </header>
  );
}
