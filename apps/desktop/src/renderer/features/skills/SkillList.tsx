import { useEffect, useState } from 'react';
import { useSkillStore, selectSkills, selectSelectedSkill } from '@renderer/stores';
import { SkillCard } from './SkillCard';
import { AddSkillDialog } from './AddSkillDialog';
import { DiscoverSkillsDialog } from './DiscoverSkillsDialog';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Plus, Search, FolderSearch } from 'lucide-react';
import type { SkillInfo, SkillCreateConfig, SkillSource } from '@preload/api';

export interface SkillListProps {
  onSkillSelect?: (skill: SkillInfo) => void;
}

type FilterSource = 'all' | SkillSource;

export function SkillList({ onSkillSelect }: SkillListProps) {
  const skills = useSkillStore(selectSkills);
  const selectedSkill = useSkillStore(selectSelectedSkill);
  const isLoading = useSkillStore((state) => state.isLoading);
  const error = useSkillStore((state) => state.error);
  const {
    fetchSkills,
    selectSkill,
    registerSkill,
    enableSkill,
    disableSkill,
    refreshSkill,
    deleteSkill,
    discoverSkills,
  } = useSkillStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<FilterSource>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDiscoverDialog, setShowDiscoverDialog] = useState(false);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleSelect = (skill: SkillInfo) => {
    selectSkill(skill.id);
    onSkillSelect?.(skill);
  };

  const handleAddSkill = async (config: SkillCreateConfig) => {
    await registerSkill(config);
  };

  const handleDiscover = async (directory: string): Promise<SkillInfo[]> => {
    return discoverSkills(directory);
  };

  // Filter skills based on search and source
  const filteredSkills = skills.filter((skill) => {
    const matchesSearch =
      searchQuery === '' ||
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesSource = sourceFilter === 'all' || skill.source === sourceFilter;

    return matchesSearch && matchesSource;
  });

  if (isLoading && skills.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading skills...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="skill-list">
      {/* Header with actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
              data-testid="skill-search-input"
            />
          </div>
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as FilterSource)}>
            <SelectTrigger className="w-[140px]" data-testid="skill-filter-select">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="local">Local</SelectItem>
              <SelectItem value="symlink">Symlink</SelectItem>
              <SelectItem value="remote">Remote</SelectItem>
              <SelectItem value="builtin">Built-in</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowDiscoverDialog(true)}
            data-testid="discover-skills-button"
          >
            <FolderSearch className="mr-2 h-4 w-4" />
            Discover
          </Button>
          <Button onClick={() => setShowAddDialog(true)} data-testid="add-skill-button">
            <Plus className="mr-2 h-4 w-4" />
            Add Skill
          </Button>
        </div>
      </div>

      {/* Skills grid */}
      {filteredSkills.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">
            {skills.length === 0
              ? 'No skills registered yet. Add a skill or discover existing ones.'
              : 'No skills match your filters.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              isSelected={selectedSkill?.id === skill.id}
              onSelect={handleSelect}
              onEnable={enableSkill}
              onDisable={disableSkill}
              onRefresh={refreshSkill}
              onDelete={deleteSkill}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <AddSkillDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSubmit={handleAddSkill}
      />
      <DiscoverSkillsDialog
        open={showDiscoverDialog}
        onOpenChange={setShowDiscoverDialog}
        onDiscover={handleDiscover}
      />
    </div>
  );
}
