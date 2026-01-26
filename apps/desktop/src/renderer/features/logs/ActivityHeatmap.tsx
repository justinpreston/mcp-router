import { useMemo } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@renderer/components/ui';
import type { LogItem } from './LogViewer';

export interface ActivityHeatmapProps {
  logs: LogItem[];
  selectedTimeSlot: { hour: number; day: number } | null;
  onTimeSlotClick: (hour: number, day: number) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function ActivityHeatmap({
  logs,
  selectedTimeSlot,
  onTimeSlotClick,
}: ActivityHeatmapProps) {
  // Calculate activity matrix
  const activityMatrix = useMemo(() => {
    // Initialize 7x24 matrix
    const matrix: number[][] = Array.from({ length: 7 }, () =>
      Array(24).fill(0) as number[]
    );

    logs.forEach((log) => {
      const date = new Date(log.timestamp);
      const day = date.getDay();
      const hour = date.getHours();
      const dayRow = matrix[day];
      if (dayRow) {
        dayRow[hour] = (dayRow[hour] ?? 0) + 1;
      }
    });

    return matrix;
  }, [logs]);

  // Find max value for color intensity
  const maxCount = useMemo(() => {
    return Math.max(...activityMatrix.flat(), 1);
  }, [activityMatrix]);

  // Get color intensity based on count
  const getIntensity = (count: number): string => {
    if (count === 0) return 'bg-muted';
    const intensity = Math.ceil((count / maxCount) * 4);
    const colors: string[] = [
      'bg-primary/20',
      'bg-primary/40',
      'bg-primary/60',
      'bg-primary/80',
      'bg-primary',
    ];
    return colors[Math.min(intensity, 4)] ?? 'bg-primary';
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Hour labels */}
        <div className="flex mb-1 pl-10">
          {HOURS.filter((h) => h % 3 === 0).map((hour) => (
            <div
              key={hour}
              className="text-[10px] text-muted-foreground"
              style={{ width: `${(3 / 24) * 100}%` }}
            >
              {hour.toString().padStart(2, '0')}
            </div>
          ))}
        </div>

        {/* Heatmap grid */}
        <div className="space-y-1">
          {DAYS.map((day, dayIndex) => (
            <div key={day} className="flex items-center gap-1">
              <span className="w-8 text-[10px] text-muted-foreground text-right">
                {day}
              </span>
              <div className="flex flex-1 gap-px">
                {HOURS.map((hour) => {
                  const dayRow = activityMatrix[dayIndex];
                  const count = dayRow ? (dayRow[hour] ?? 0) : 0;
                  const isSelected =
                    selectedTimeSlot?.day === dayIndex &&
                    selectedTimeSlot?.hour === hour;

                  return (
                    <Tooltip key={hour}>
                      <TooltipTrigger asChild>
                        <button
                          className={`h-4 flex-1 rounded-sm transition-all ${getIntensity(count)} ${
                            isSelected ? 'ring-2 ring-primary ring-offset-1' : ''
                          } hover:ring-1 hover:ring-primary/50`}
                          onClick={() => onTimeSlotClick(hour, dayIndex)}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          {day} {hour.toString().padStart(2, '0')}:00 - {count}{' '}
                          events
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-2 mt-2">
          <span className="text-[10px] text-muted-foreground">Less</span>
          <div className="flex gap-px">
            <div className="w-3 h-3 rounded-sm bg-muted" />
            <div className="w-3 h-3 rounded-sm bg-primary/20" />
            <div className="w-3 h-3 rounded-sm bg-primary/40" />
            <div className="w-3 h-3 rounded-sm bg-primary/60" />
            <div className="w-3 h-3 rounded-sm bg-primary" />
          </div>
          <span className="text-[10px] text-muted-foreground">More</span>
        </div>
      </div>
    </div>
  );
}
