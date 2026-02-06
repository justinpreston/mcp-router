import { useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type NodeTypes,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  BackgroundVariant,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { StartNode } from './nodes/StartNode';
import { EndNode } from './nodes/EndNode';
import { McpCallNode } from './nodes/McpCallNode';
import { ConditionalNode } from './nodes/ConditionalNode';
import { TransformNode } from './nodes/TransformNode';
import { MemoryQueryNode } from './nodes/MemoryQueryNode';
import { MemoryStoreNode } from './nodes/MemoryStoreNode';
import type { WorkflowNode, WorkflowEdge } from './types';

export interface WorkflowCanvasProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  onNodesChange: (nodes: WorkflowNode[]) => void;
  onEdgesChange: (edges: WorkflowEdge[]) => void;
  onNodeSelect?: (nodeId: string | null) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  isReadOnly?: boolean;
}

/**
 * Custom node types for the workflow editor.
 */
const nodeTypes: NodeTypes = {
  start: StartNode,
  end: EndNode,
  mcpCall: McpCallNode,
  conditional: ConditionalNode,
  transform: TransformNode,
  memoryQuery: MemoryQueryNode,
  memoryStore: MemoryStoreNode,
};

/**
 * Custom edge styling.
 */
const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: false,
  style: {
    strokeWidth: 2,
    stroke: 'hsl(var(--muted-foreground))',
  },
};

/**
 * WorkflowCanvas - The main React Flow canvas for editing workflows.
 * Handles node/edge rendering, drag-and-drop, and connection management.
 */
export function WorkflowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeSelect,
  onNodeDoubleClick,
  isReadOnly = false,
}: WorkflowCanvasProps) {
  // Handle node changes (position, selection, etc.)
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const newNodes = applyNodeChanges(changes, nodes) as WorkflowNode[];
      onNodesChange(newNodes);
    },
    [nodes, onNodesChange]
  );

  // Handle edge changes (selection, removal, etc.)
  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const newEdges = applyEdgeChanges(changes, edges as Edge[]) as WorkflowEdge[];
      onEdgesChange(newEdges);
    },
    [edges, onEdgesChange]
  );

  // Handle new connections
  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // Create edge with proper styling for conditional branches
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const isConditionalEdge =
        sourceNode?.type === 'conditional' && connection.sourceHandle;

      const newEdge: WorkflowEdge = {
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        type: 'smoothstep',
        animated: false,
        style: {
          strokeWidth: 2,
          stroke: isConditionalEdge
            ? connection.sourceHandle === 'true'
              ? 'hsl(142, 71%, 45%)' // green for true
              : 'hsl(0, 84%, 60%)' // red for false
            : 'hsl(var(--muted-foreground))',
        },
        label: isConditionalEdge
          ? connection.sourceHandle === 'true'
            ? 'Yes'
            : 'No'
          : undefined,
        conditionBranch: isConditionalEdge
          ? (connection.sourceHandle as 'true' | 'false')
          : undefined,
      };

      const newEdges = addEdge(newEdge, edges as Edge[]);
      onEdgesChange(newEdges as WorkflowEdge[]);
    },
    [nodes, edges, onEdgesChange]
  );

  // Handle node selection
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: WorkflowNode[] }) => {
      if (selectedNodes.length === 1 && selectedNodes[0]) {
        onNodeSelect?.(selectedNodes[0].id);
      } else {
        onNodeSelect?.(null);
      }
    },
    [onNodeSelect]
  );

  // Handle node double-click for editing
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: WorkflowNode) => {
      onNodeDoubleClick?.(node.id);
    },
    [onNodeDoubleClick]
  );

  // Connection validation
  const isValidConnection = useCallback(
    (connection: Connection) => {
      // Prevent self-connections
      if (connection.source === connection.target) return false;

      // Prevent duplicate connections
      const exists = edges.some(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          e.sourceHandle === connection.sourceHandle
      );
      if (exists) return false;

      // Start nodes can only be source
      const sourceNode = nodes.find((n) => n.id === connection.source);
      if (sourceNode?.type === 'start' && connection.targetHandle) return false;

      // End nodes can only be target
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (targetNode?.type === 'end' && connection.sourceHandle) return false;

      return true;
    },
    [nodes, edges]
  );

  // MiniMap node colors
  const getMinimapNodeColor = useCallback((node: WorkflowNode) => {
    switch (node.type) {
      case 'start':
        return '#22c55e';
      case 'end':
        return '#ef4444';
      case 'mcpCall':
        return '#3b82f6';
      case 'conditional':
        return '#f59e0b';
      case 'transform':
        return '#a855f7';
      default:
        return '#6b7280';
    }
  }, []);

  return (
    <div className="w-full h-full" data-testid="workflow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges as Edge[]}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onSelectionChange={handleSelectionChange}
        onNodeDoubleClick={handleNodeDoubleClick}
        isValidConnection={isValidConnection}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        snapToGrid
        snapGrid={[16, 16]}
        nodesDraggable={!isReadOnly}
        nodesConnectable={!isReadOnly}
        elementsSelectable={!isReadOnly}
        minZoom={0.1}
        maxZoom={2}
        className="bg-muted/20"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          className="!bg-transparent"
        />
        <Controls
          showZoom
          showFitView
          showInteractive={!isReadOnly}
          className="!bg-card !border !border-border !shadow-md"
        />
        <MiniMap
          nodeColor={getMinimapNodeColor}
          maskColor="hsl(var(--background) / 0.8)"
          className="!bg-card !border !border-border !shadow-md"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}

export default WorkflowCanvas;
