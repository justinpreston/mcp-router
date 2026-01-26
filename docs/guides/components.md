# UI Components Guide

This guide documents the UI components available in MCP Router.

## Base Components

Base components are located in `src/renderer/components/ui/` and follow shadcn/ui patterns.

### Button

A versatile button component with multiple variants and sizes.

```tsx
import { Button } from '@renderer/components/ui';

// Variants
<Button>Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><IconComponent /></Button>

// States
<Button disabled>Disabled</Button>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| variant | 'default' \| 'secondary' \| 'destructive' \| 'outline' \| 'ghost' \| 'link' | 'default' | Visual variant |
| size | 'default' \| 'sm' \| 'lg' \| 'icon' | 'default' | Size variant |
| disabled | boolean | false | Disabled state |
| className | string | - | Additional CSS classes |

---

### Card

Container component for grouped content.

```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@renderer/components/ui';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description text</CardDescription>
  </CardHeader>
  <CardContent>
    Main content goes here
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

---

### Badge

Small status indicator component.

```tsx
import { Badge } from '@renderer/components/ui';

// Variants
<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Outline</Badge>
<Badge variant="success">Success</Badge>
<Badge variant="warning">Warning</Badge>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| variant | 'default' \| 'secondary' \| 'destructive' \| 'outline' \| 'success' \| 'warning' | 'default' | Visual variant |

---

### Input

Text input component for forms.

```tsx
import { Input } from '@renderer/components/ui';

<Input placeholder="Enter text..." />
<Input type="password" />
<Input disabled />
```

**Props:**
Extends all native `<input>` props.

---

### Label

Form label component.

```tsx
import { Label, Input } from '@renderer/components/ui';

<div>
  <Label htmlFor="email">Email</Label>
  <Input id="email" type="email" />
</div>
```

---

### Dialog

Modal dialog component.

```tsx
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@renderer/components/ui';

<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>
        Description text for the dialog.
      </DialogDescription>
    </DialogHeader>
    <div>Dialog body content</div>
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

// Controlled usage
const [open, setOpen] = useState(false);

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>...</DialogContent>
</Dialog>
```

---

## Feature Components

Feature components are located in `src/renderer/features/` and implement specific application functionality.

### Server Components

Located in `features/servers/`:

#### ServerList

Displays a list of all configured servers.

```tsx
import { ServerList } from '@renderer/features';

<ServerList onServerSelect={(server) => console.log(server)} />
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| onServerSelect | (server: MCPServer) => void | Called when a server is selected |

#### ServerCard

Individual server card with status and actions.

```tsx
import { ServerCard } from '@renderer/features';

<ServerCard
  server={server}
  isSelected={true}
  onSelect={(s) => selectServer(s.id)}
  onStart={(id) => startServer(id)}
  onStop={(id) => stopServer(id)}
  onDelete={(id) => deleteServer(id)}
/>
```

#### AddServerDialog

Dialog for adding new servers.

```tsx
import { AddServerDialog } from '@renderer/features';

const [open, setOpen] = useState(false);

<Button onClick={() => setOpen(true)}>Add Server</Button>
<AddServerDialog open={open} onOpenChange={setOpen} />
```

#### ServerDetails

Detailed view of a single server.

```tsx
import { ServerDetails } from '@renderer/features';

<ServerDetails
  server={selectedServer}
  onStart={startServer}
  onStop={stopServer}
  onDelete={deleteServer}
/>
```

---

### Policy Components

Located in `features/policies/`:

#### PolicyList

Displays all policy rules sorted by priority.

```tsx
import { PolicyList } from '@renderer/features';

<PolicyList onPolicySelect={(policy) => console.log(policy)} />
```

#### PolicyCard

Individual policy rule card.

```tsx
import { PolicyCard } from '@renderer/features';

<PolicyCard
  policy={policy}
  isSelected={true}
  onSelect={(p) => selectPolicy(p.id)}
  onToggle={(id, enabled) => togglePolicy(id, enabled)}
  onDelete={(id) => deletePolicy(id)}
/>
```

#### AddPolicyDialog

Dialog for creating new policy rules.

```tsx
import { AddPolicyDialog } from '@renderer/features';

<AddPolicyDialog open={open} onOpenChange={setOpen} />
```

---

### Approval Components

Located in `features/approvals/`:

#### ApprovalQueue

Displays pending approval requests.

```tsx
import { ApprovalQueue } from '@renderer/features';

// Show only pending
<ApprovalQueue />

// Show all including resolved
<ApprovalQueue showResolved />
```

#### ApprovalCard

Individual approval request card.

```tsx
import { ApprovalCard } from '@renderer/features';

<ApprovalCard
  approval={approval}
  onApprove={(id) => approveRequest(id)}
  onReject={(id, reason) => rejectRequest(id, reason)}
  onSelect={(a) => setSelectedApproval(a)}
/>
```

#### ApprovalDetailDialog

Detailed view of an approval request.

```tsx
import { ApprovalDetailDialog } from '@renderer/features';

<ApprovalDetailDialog
  approval={selectedApproval}
  open={!!selectedApproval}
  onOpenChange={(open) => !open && setSelectedApproval(null)}
  onApprove={approveRequest}
  onReject={rejectRequest}
/>
```

---

### Layout Components

Located in `features/layout/`:

#### MainLayout

Root layout with sidebar and header.

```tsx
import { MainLayout } from '@renderer/features';

<MainLayout
  activeNav="servers"
  pageTitle="Servers"
  onNavigate={(item) => setActiveNav(item)}
>
  <YourPageContent />
</MainLayout>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| children | ReactNode | Page content |
| activeNav | NavItem | Current navigation item |
| pageTitle | string | Title displayed in header |
| onNavigate | (item: NavItem) => void | Navigation handler |

#### Sidebar

Navigation sidebar.

```tsx
import { Sidebar } from '@renderer/features';

<Sidebar
  activeItem="servers"
  onNavigate={(item) => navigate(item)}
/>
```

#### Header

Application header with title and window controls.

```tsx
import { Header } from '@renderer/features';

<Header title="Servers" />
```

---

## Styling Utilities

### cn() Function

Utility for merging Tailwind classes.

```tsx
import { cn } from '@renderer/lib/utils';

<div className={cn(
  'base-classes',
  isActive && 'active-classes',
  className
)} />
```

### CSS Variables

Theme colors are defined as CSS variables:

```css
/* Light theme */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --muted: 210 40% 96.1%;
  --accent: 210 40% 96.1%;
  --destructive: 0 84.2% 60.2%;
  --border: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
}

/* Dark theme */
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... */
}
```

Use in Tailwind classes:

```tsx
<div className="bg-background text-foreground" />
<div className="bg-primary text-primary-foreground" />
<div className="border-border" />
```

---

## Creating New Components

### 1. Create the component file

```tsx
// components/ui/switch.tsx
import * as React from 'react';
import { cn } from '@renderer/lib/utils';

export interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked = false,
  onCheckedChange,
  disabled = false,
  className,
}: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full',
        checked ? 'bg-primary' : 'bg-input',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-background transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}
```

### 2. Export from index

```tsx
// components/ui/index.ts
export { Switch, type SwitchProps } from './switch';
```

### 3. Use in your application

```tsx
import { Switch } from '@renderer/components/ui';

<Switch
  checked={enabled}
  onCheckedChange={setEnabled}
/>
```
