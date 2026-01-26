import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card';
import { Switch } from '@renderer/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { MoreHorizontal, RefreshCw, Trash2, Link2, FolderOpen, Globe, Package } from 'lucide-react';
import type { SkillInfo } from '@preload/api';

export interface SkillCardProps {
  skill: SkillInfo;
  isSelected: boolean;
  onSelect: (skill: SkillInfo) => void;
  onEnable: (id: string) => void;
  onDisable: (id: string) => void;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onConvertToServer?: (id: string) => void;
}

const sourceIcons = {
  local: FolderOpen,
  symlink: Link2,
  remote: Globe,
  builtin: Package,
};

const statusVariants = {
  available: 'default',
  loading: 'secondary',
  error: 'destructive',
  disabled: 'outline',
} as const;

export function SkillCard({
  skill,
  isSelected,
  onSelect,
  onEnable,
  onDisable,
  onRefresh,
  onDelete,
  onConvertToServer,
}: SkillCardProps) {
  const SourceIcon = sourceIcons[skill.source];

  const handleToggle = (checked: boolean) => {
    if (checked) {
      onEnable(skill.id);
    } else {
      onDisable(skill.id);
    }
  };

  return (
    <Card
      data-testid="skill-card"
      data-skill-id={skill.id}
      className={`cursor-pointer transition-all hover:border-primary/50 ${
        isSelected ? 'border-primary ring-1 ring-primary' : ''
      }`}
      onClick={() => onSelect(skill)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <SourceIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{skill.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariants[skill.status]}>{skill.status}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefresh(skill.id);
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </DropdownMenuItem>
                {onConvertToServer && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onConvertToServer(skill.id);
                    }}
                  >
                    <Package className="mr-2 h-4 w-4" />
                    Add as Server
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(skill.id);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {skill.description && (
          <CardDescription className="line-clamp-2">{skill.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {skill.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {skill.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{skill.tags.length - 3}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {skill.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <Switch
              checked={skill.enabled}
              onCheckedChange={handleToggle}
              onClick={(e) => e.stopPropagation()}
              data-testid="skill-toggle"
            />
          </div>
        </div>
        {skill.error && (
          <p className="mt-2 text-xs text-destructive">{skill.error}</p>
        )}
        {skill.manifest?.version && (
          <p className="mt-2 text-xs text-muted-foreground">
            v{skill.manifest.version}
            {skill.manifest.author && ` by ${skill.manifest.author}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
