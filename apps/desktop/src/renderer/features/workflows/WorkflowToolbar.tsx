import {
  Play,
  Square,
  Save,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Wrench,
  GitBranch,
  Shuffle,
  Plus,
} from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip';
import { Separator } from '@renderer/components/ui/separator';

export interface WorkflowToolbarProps {
  workflowName: string;
  isRunning: boolean;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onRun: () => void;
  onStop: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onAddNode: (type: 'mcpCall' | 'conditional' | 'transform') => void;
}

/**
 * WorkflowToolbar - Toolbar for workflow editing actions.
 */
export function WorkflowToolbar({
  workflowName,
  isRunning,
  isDirty,
  canUndo,
  canRedo,
  onSave,
  onRun,
  onStop,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onFitView,
  onAddNode,
}: WorkflowToolbarProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="flex items-center justify-between px-4 py-2 bg-card border-b"
        data-testid="workflow-toolbar"
      >
        {/* Left section - Workflow name and status */}
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{workflowName}</h2>
          {isDirty && (
            <span className="text-xs text-muted-foreground">(unsaved changes)</span>
          )}
          {isRunning && (
            <span className="flex items-center gap-1 text-xs text-blue-500">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              Running
            </span>
          )}
        </div>

        {/* Center section - Node palette */}
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add Node
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuItem onClick={() => onAddNode('mcpCall')}>
                <Wrench className="w-4 h-4 mr-2 text-blue-500" />
                <span>MCP Tool Call</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddNode('conditional')}>
                <GitBranch className="w-4 h-4 mr-2 text-amber-500" />
                <span>Condition</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddNode('transform')}>
                <Shuffle className="w-4 h-4 mr-2 text-purple-500" />
                <span>Transform</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right section - Actions */}
        <div className="flex items-center gap-1">
          {/* Undo/Redo */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onUndo}
                disabled={!canUndo}
                className="h-8 w-8"
              >
                <Undo className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (⌘Z)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onRedo}
                disabled={!canRedo}
                className="h-8 w-8"
              >
                <Redo className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (⌘⇧Z)</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Zoom controls */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onZoomOut} className="h-8 w-8">
                <ZoomOut className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onZoomIn} className="h-8 w-8">
                <ZoomIn className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onFitView} className="h-8 w-8">
                <Maximize2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fit View</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Save */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onSave}
                disabled={!isDirty}
                className="h-8 w-8"
              >
                <Save className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save (⌘S)</TooltipContent>
          </Tooltip>

          {/* Run/Stop */}
          {isRunning ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={onStop}
              className="gap-2 ml-2"
            >
              <Square className="w-4 h-4" />
              Stop
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={onRun}
              className="gap-2 ml-2 bg-green-600 hover:bg-green-700"
            >
              <Play className="w-4 h-4" />
              Run
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

export default WorkflowToolbar;
