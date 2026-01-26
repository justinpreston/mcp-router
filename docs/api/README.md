# API Reference

MCP Router exposes APIs through multiple interfaces:

1. **HTTP API** - For external MCP clients
2. **IPC API** - For internal renderer-to-main communication

## HTTP API

The HTTP API provides MCP protocol endpoints for external clients.

### Base URL

```
http://localhost:3847
```

### Authentication

All requests require a Bearer token in the Authorization header:

```
Authorization: Bearer <token>
```

### Endpoints

#### Tools

##### List Tools

```http
GET /tools
```

Returns aggregated tools from all accessible MCP servers.

**Response:**
```json
{
  "tools": [
    {
      "name": "read_file",
      "serverId": "server-123",
      "serverName": "FileSystem Server",
      "description": "Read contents of a file",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" }
        },
        "required": ["path"]
      }
    }
  ]
}
```

##### Call Tool

```http
POST /tools/call
Content-Type: application/json
```

**Request:**
```json
{
  "serverId": "server-123",
  "name": "read_file",
  "arguments": {
    "path": "/etc/hosts"
  }
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "127.0.0.1 localhost\n..."
    }
  ]
}
```

**Error Response (Policy Denied):**
```json
{
  "error": {
    "code": "POLICY_DENIED",
    "message": "Access denied by policy: Deny filesystem writes"
  }
}
```

**Approval Required Response:**
```json
{
  "error": {
    "code": "APPROVAL_REQUIRED",
    "message": "This operation requires manual approval",
    "approvalId": "approval-456"
  }
}
```

#### Resources

##### List Resources

```http
GET /resources
```

**Response:**
```json
{
  "resources": [
    {
      "uri": "file:///home/user/documents",
      "serverId": "server-123",
      "name": "Documents",
      "mimeType": "inode/directory"
    }
  ]
}
```

##### Read Resource

```http
GET /resources/read?serverId=server-123&uri=file:///home/user/doc.txt
```

**Response:**
```json
{
  "content": "File contents here..."
}
```

#### Prompts

##### List Prompts

```http
GET /prompts
```

**Response:**
```json
{
  "prompts": [
    {
      "name": "code_review",
      "serverId": "server-456",
      "description": "Review code for issues"
    }
  ]
}
```

##### Get Prompt

```http
POST /prompts/get
Content-Type: application/json
```

**Request:**
```json
{
  "serverId": "server-456",
  "name": "code_review",
  "arguments": {
    "language": "typescript"
  }
}
```

#### Health

##### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "servers": {
    "total": 3,
    "running": 2,
    "stopped": 1
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_TOKEN` | Token is invalid or expired |
| `INSUFFICIENT_SCOPE` | Token lacks required scope |
| `SERVER_NOT_FOUND` | Target server does not exist |
| `SERVER_OFFLINE` | Target server is not running |
| `POLICY_DENIED` | Access denied by policy rule |
| `APPROVAL_REQUIRED` | Operation needs manual approval |
| `APPROVAL_REJECTED` | Approval request was rejected |
| `APPROVAL_EXPIRED` | Approval request timed out |
| `RATE_LIMITED` | Too many requests |
| `INTERNAL_ERROR` | Server error |

---

## IPC API

Internal API for renderer process communication.

### Servers

#### `servers:list`

List all configured servers.

```typescript
const servers = await window.electron.servers.list();
// Returns: MCPServer[]
```

#### `servers:get`

Get a server by ID.

```typescript
const server = await window.electron.servers.get(serverId);
// Returns: MCPServer | null
```

#### `servers:add`

Add a new server.

```typescript
const server = await window.electron.servers.add({
  name: 'My Server',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem']
});
// Returns: MCPServer
```

#### `servers:update`

Update server configuration.

```typescript
await window.electron.servers.update(serverId, {
  name: 'Updated Name'
});
```

#### `servers:delete`

Delete a server.

```typescript
await window.electron.servers.delete(serverId);
```

#### `servers:start`

Start a server.

```typescript
await window.electron.servers.start(serverId);
```

#### `servers:stop`

Stop a server.

```typescript
await window.electron.servers.stop(serverId);
```

### Tokens

#### `tokens:list`

List all tokens.

```typescript
const tokens = await window.electron.tokens.list();
// Returns: TokenInfo[] (without sensitive data)
```

#### `tokens:create`

Create a new token.

```typescript
const { token, plaintext } = await window.electron.tokens.create({
  name: 'API Token',
  scopes: ['tools:read', 'tools:execute'],
  serverIds: ['server-123'],
  expiresIn: 86400000 // 24 hours
});
// Note: plaintext is only available at creation time
```

#### `tokens:revoke`

Revoke a token.

```typescript
await window.electron.tokens.revoke(tokenId);
```

### Policies

#### `policies:list`

List all policy rules.

```typescript
const policies = await window.electron.policies.list();
// Returns: PolicyRule[]
```

#### `policies:add`

Create a new policy rule.

```typescript
const policy = await window.electron.policies.add({
  name: 'Block dangerous tools',
  scope: 'global',
  resourceType: 'tool',
  pattern: 'dangerous-*',
  action: 'deny',
  priority: 100,
  enabled: true
});
```

#### `policies:update`

Update a policy rule.

```typescript
await window.electron.policies.update(policyId, {
  enabled: false
});
```

#### `policies:delete`

Delete a policy rule.

```typescript
await window.electron.policies.delete(policyId);
```

### Approvals

#### `approvals:list`

List approval requests.

```typescript
const approvals = await window.electron.approvals.list();
// Returns: ApprovalRequest[]
```

#### `approvals:approve`

Approve a request.

```typescript
await window.electron.approvals.approve(approvalId);
```

#### `approvals:reject`

Reject a request.

```typescript
await window.electron.approvals.reject(approvalId, 'Reason for rejection');
```

### Events

The IPC API also emits events for real-time updates:

#### `server:status-changed`

Emitted when a server's status changes.

```typescript
window.electron.on('server:status-changed', (server: MCPServer) => {
  console.log(`Server ${server.name} is now ${server.status}`);
});
```

#### `approval:new`

Emitted when a new approval request is created.

```typescript
window.electron.on('approval:new', (approval: ApprovalRequest) => {
  console.log(`New approval request for ${approval.toolKey}`);
});
```

#### `approval:updated`

Emitted when an approval request is resolved.

```typescript
window.electron.on('approval:updated', (approval: ApprovalRequest) => {
  console.log(`Approval ${approval.id} is now ${approval.status}`);
});
```
