import { useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui';
import { Badge } from '@renderer/components/ui';
import { Button } from '@renderer/components/ui';
import { Skeleton } from '@renderer/components/ui';
import {
  Brain,
  FileText,
  MessageSquare,
  Code,
  BookOpen,
  CheckSquare,
  Link,
  RefreshCw,
  TrendingUp,
  Clock,
  Hash,
} from 'lucide-react';
import { useMemoryStore } from '@renderer/stores/memoryStore';
import type { MemoryType } from '@preload/api';

/**
 * Simple progress bar component (since Progress isn't in the UI library).
 */
function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
      <div 
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/**
 * Icon mapping for memory types.
 */
const typeIcons: Record<MemoryType, React.ReactNode> = {
  note: <FileText className="h-4 w-4" />,
  conversation: <MessageSquare className="h-4 w-4" />,
  code: <Code className="h-4 w-4" />,
  document: <BookOpen className="h-4 w-4" />,
  task: <CheckSquare className="h-4 w-4" />,
  reference: <Link className="h-4 w-4" />,
};

/**
 * Color mapping for memory types.
 */
const typeColors: Record<MemoryType, string> = {
  note: 'bg-blue-500',
  conversation: 'bg-green-500',
  code: 'bg-purple-500',
  document: 'bg-yellow-500',
  task: 'bg-red-500',
  reference: 'bg-cyan-500',
};

/**
 * Format a timestamp to relative time.
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

/**
 * Memory Statistics Dashboard component.
 */
export function MemoryStatsDashboard() {
  const {
    statistics,
    isLoading,
    isRegenerating,
    error,
    fetchStatistics,
    regenerateEmbeddings,
  } = useMemoryStore();

  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  if (isLoading && !statistics) {
    return <StatsSkeleton />;
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => fetchStatistics()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!statistics) {
    return null;
  }

  const totalTypeCount = Object.values(statistics.byType).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">Memory Statistics</h2>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchStatistics()}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => regenerateEmbeddings()}
            disabled={isRegenerating}
          >
            <Brain className={`mr-2 h-4 w-4 ${isRegenerating ? 'animate-pulse' : ''}`} />
            {isRegenerating ? 'Regenerating...' : 'Regenerate Embeddings'}
          </Button>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Memories</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.totalCount}</div>
            <p className="text-xs text-muted-foreground">
              {statistics.recentlyAccessed} accessed recently
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Importance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(statistics.avgImportance * 100).toFixed(0)}%
            </div>
            <ProgressBar value={statistics.avgImportance * 100} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Accesses</CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.totalAccessCount}</div>
            <p className="text-xs text-muted-foreground">
              {statistics.avgAccessCount.toFixed(1)} avg per memory
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Time Range</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {statistics.oldestMemory && (
                <div>
                  <span className="text-muted-foreground">Oldest: </span>
                  {formatRelativeTime(statistics.oldestMemory)}
                </div>
              )}
              {statistics.newestMemory && (
                <div>
                  <span className="text-muted-foreground">Newest: </span>
                  {formatRelativeTime(statistics.newestMemory)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Type distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Memory Types</CardTitle>
          <CardDescription>Distribution of memories by type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {(Object.entries(statistics.byType) as [MemoryType, number][]).map(
              ([type, count]) => {
                const percentage = totalTypeCount > 0 ? (count / totalTypeCount) * 100 : 0;
                return (
                  <div key={type} className="flex items-center gap-4">
                    <div className="flex items-center gap-2 w-32">
                      <div className={`p-1.5 rounded ${typeColors[type]} text-white`}>
                        {typeIcons[type]}
                      </div>
                      <span className="text-sm font-medium capitalize">{type}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={percentage} />
                        <span className="text-sm text-muted-foreground w-16 text-right">
                          {count} ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tag cloud */}
      <Card>
        <CardHeader>
          <CardTitle>Popular Tags</CardTitle>
          <CardDescription>Most used tags across memories</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(statistics.byTag)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 30)
              .map(([tag, count]) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="cursor-pointer hover:bg-secondary/80"
                >
                  {tag}
                  <span className="ml-1 text-xs text-muted-foreground">({count})</span>
                </Badge>
              ))}
            {Object.keys(statistics.byTag).length === 0 && (
              <p className="text-sm text-muted-foreground">No tags found</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Loading skeleton for the statistics dashboard.
 */
function StatsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-40" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default MemoryStatsDashboard;
