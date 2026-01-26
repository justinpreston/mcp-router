import { useState, useCallback, useRef } from 'react';
import { useReactFlow, ReactFlowProvider } from 'reactflow';
import { nanoid } from 'nanoid';
import { WorkflowCanvas } from './WorkflowCanvas';
import { WorkflowToolbar } from './WorkflowToolbar';
import { ExecutionPanel, type ExecutionPanelRef } from './ExecutionPanel';
import type { WorkflowNode, WorkflowEdge, NodeType, WorkflowNodeData, NodeConfig } from './types';

export interface WorkflowEditorProps {
  workflowId?: string;
  workflowName?: string;
  initialNodes?: WorkflowNode[];
  initialEdges?: WorkflowEdge[];
  onSave?: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => Promise<void>;
  onExecute?: (workflowId: string) => Promise<void>;
  onStop?: (executionId: string) => Promise<void>;
}

/**
 * WorkflowEditorInner - Main editor component (inside ReactFlowProvider context).
 */
function WorkflowEditorInner({
  workflowId,
  workflowName = 'Untitled Workflow',
  initialNodes = [],
  initialEdges = [],
  onSave,
  onExecute,
  onStop,
}: WorkflowEditorProps) {
  const reactFlow = useReactFlow();
  const executionPanelRef = useRef<ExecutionPanelRef>(null);
  
  // State
  const [nodes, setNodes] = useState<WorkflowNode[]>(() => {
    if (initialNodes.length > 0) return initialNodes;
    // Default: Start and End nodes
    return [
      {
        id: 'start-1',
        type: 'start',
        position: { x: 250, y: 50 },
        data: { label: 'Start', type: 'start' as NodeType, config: { type: 'start' as const } },
      },
      {
        id: 'end-1',
        type: 'end',
        position: { x: 250, y: 400 },
        data: { label: 'End', type: 'end' as NodeType, config: { type: 'end' as const } },
      },
    ];
  });
  const [edges, setEdges] = useState<WorkflowEdge[]>(initialEdges);
  const [isDirty, setIsDirty] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [showExecutionPanel, setShowExecutionPanel] = useState(false);
  
  // History for undo/redo
  const [history, setHistory] = useState<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  
  // Save to history
  const saveToHistory = useCallback(() => {
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ nodes: [...nodes], edges: [...edges] });
      return newHistory;
    });
    setHistoryIndex((prev) => prev + 1);
  }, [nodes, edges, historyIndex]);
  
  // Handlers
  const handleNodesChange = useCallback((newNodes: WorkflowNode[]) => {
    setNodes(newNodes);
    setIsDirty(true);
  }, []);
  
  const handleEdgesChange = useCallback((newEdges: WorkflowEdge[]) => {
    setEdges(newEdges);
    setIsDirty(true);
  }, []);
  
  const handleSave = useCallback(async () => {
    if (onSave) {
      await onSave(nodes, edges);
      setIsDirty(false);
      saveToHistory();
    }
  }, [nodes, edges, onSave, saveToHistory]);
  
  const handleRun = useCallback(async () => {
    if (!workflowId || !onExecute) return;
    
    setIsRunning(true);
    setShowExecutionPanel(true);
    
    try {
      const id = nanoid();
      setExecutionId(id);
      await onExecute(workflowId);
    } catch (error) {
      console.error('Workflow execution failed:', error);
    }
  }, [workflowId, onExecute]);
  
  const handleStop = useCallback(async () => {
    if (!executionId || !onStop) return;
    
    try {
      await onStop(executionId);
    } finally {
      setIsRunning(false);
      setExecutionId(null);
    }
  }, [executionId, onStop]);
  
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      if (prevState) {
        setNodes(prevState.nodes);
        setEdges(prevState.edges);
        setHistoryIndex((prev) => prev - 1);
        setIsDirty(true);
      }
    }
  }, [historyIndex, history]);
  
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      if (nextState) {
        setNodes(nextState.nodes);
        setEdges(nextState.edges);
        setHistoryIndex((prev) => prev + 1);
        setIsDirty(true);
      }
    }
  }, [historyIndex, history]);
  
  const handleZoomIn = useCallback(() => {
    reactFlow.zoomIn();
  }, [reactFlow]);
  
  const handleZoomOut = useCallback(() => {
    reactFlow.zoomOut();
  }, [reactFlow]);
  
  const handleFitView = useCallback(() => {
    reactFlow.fitView({ padding: 0.2 });
  }, [reactFlow]);
  
  const handleAddNode = useCallback((type: 'mcpCall' | 'conditional' | 'transform') => {
    const id = nanoid();
    const viewport = reactFlow.getViewport();
    
    const config: NodeConfig = type === 'mcpCall'
      ? { type: 'mcpCall', serverId: '', toolName: '', arguments: {} }
      : type === 'conditional'
        ? { type: 'conditional', condition: '' }
        : { type: 'transform', expression: '' };
    
    const nodeData: WorkflowNodeData = {
      label: type === 'mcpCall' 
        ? 'New MCP Call' 
        : type === 'conditional' 
          ? 'Condition' 
          : 'Transform',
      type,
      config,
    };
    
    const newNode: WorkflowNode = {
      id,
      type,
      position: {
        x: (-viewport.x + 300) / viewport.zoom,
        y: (-viewport.y + 200) / viewport.zoom,
      },
      data: nodeData,
    };
    
    setNodes((nds) => [...nds, newNode]);
    setIsDirty(true);
    saveToHistory();
  }, [reactFlow, saveToHistory]);
  
  // Keyboard shortcuts
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey) {
      if (event.key === 's') {
        event.preventDefault();
        handleSave();
      } else if (event.key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    }
  }, [handleSave, handleUndo, handleRedo]);
  
  return (
    <div
      className="flex flex-col h-full bg-background"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      data-testid="workflow-editor"
    >
      <WorkflowToolbar
        workflowName={workflowName}
        isRunning={isRunning}
        isDirty={isDirty}
        canUndo={canUndo}
        canRedo={canRedo}
        onSave={handleSave}
        onRun={handleRun}
        onStop={handleStop}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={handleFitView}
        onAddNode={handleAddNode}
      />
      
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
          />
        </div>
        
        {showExecutionPanel && (
          <ExecutionPanel
            ref={executionPanelRef}
            isRunning={isRunning}
            executionId={executionId}
            onClose={() => setShowExecutionPanel(false)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * WorkflowEditor - Wrapper with ReactFlowProvider.
 */
export function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  );
}

export default WorkflowEditor;
