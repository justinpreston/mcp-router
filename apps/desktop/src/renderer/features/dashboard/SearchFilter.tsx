import { Search, Filter } from 'lucide-react';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui';

export interface SearchFilterProps {
  searchQuery: string;
  filterStatus: string;
  onSearchChange: (query: string) => void;
  onStatusChange: (status: string) => void;
}

export function SearchFilter({
  searchQuery,
  filterStatus,
  onSearchChange,
  onStatusChange,
}: SearchFilterProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center" data-testid="search-filter">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search servers..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
          data-testid="search-input"
        />
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterStatus} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[140px]" data-testid="status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="stopped">Stopped</SelectItem>
            <SelectItem value="starting">Starting</SelectItem>
            <SelectItem value="stopping">Stopping</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
