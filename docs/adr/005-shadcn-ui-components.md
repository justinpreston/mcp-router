# ADR-005: Use shadcn/ui Component Patterns

## Status

Accepted

## Context

The renderer process needs a UI component library that:
- Provides consistent, accessible components
- Supports customization and theming
- Works well with Tailwind CSS
- Doesn't add significant bundle size
- Can be modified as needed

## Decision

We will use **shadcn/ui component patterns** with Tailwind CSS for the UI.

Key implementation details:
- Components are copied into the codebase (not installed as dependency)
- Use `class-variance-authority` (cva) for variant styling
- Tailwind CSS for all styling
- Full ownership of component code

Note: We selectively use Radix UI primitives where they add significant value (e.g., `@radix-ui/react-slot` for the Button `asChild` pattern), while implementing our own accessible behaviors for simpler components like Dialog.

## Consequences

### Positive

1. **Full ownership**: Components are in our codebase, fully customizable
2. **No dependency lock-in**: Can modify any component freely
3. **Consistent design**: Shared design tokens and patterns
4. **Tailwind integration**: First-class Tailwind support
5. **Tree-shaking**: Only import what we use
6. **Type safety**: Full TypeScript support
7. **Copy-paste**: Easy to add new components from shadcn/ui

### Negative

1. **Maintenance**: We own the component code and bugs
2. **Updates**: Manual process to incorporate upstream improvements
3. **Accessibility**: Must ensure our implementations are accessible
4. **More code**: Components in our repo vs external dependency

### Component Structure

```typescript
// components/ui/button.tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@renderer/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
```

### Theme Configuration

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // ... more semantic colors
      },
    },
  },
};
```

```css
/* index.css */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  /* ... */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... */
}
```

## Alternatives Considered

### Material UI (MUI)

**Pros**: Comprehensive, well-documented, accessible
**Cons**: Large bundle, opinionated styling, harder to customize

**Why not chosen**: Too heavy and harder to achieve custom design.

### Chakra UI

**Pros**: Good DX, accessible, themeable
**Cons**: Runtime CSS-in-JS overhead, less Tailwind integration

**Why not chosen**: Prefer Tailwind's utility-first approach.

### Ant Design

**Pros**: Comprehensive enterprise components
**Cons**: Large bundle, specific design language, hard to customize

**Why not chosen**: Design language doesn't fit our needs.

### Headless UI

**Pros**: Accessible primitives, works with Tailwind
**Cons**: Very minimal, need to build more ourselves

**Why not chosen**: Would require more styling work. shadcn/ui provides good defaults.

### Radix UI + Custom Styles

**Pros**: Excellent accessibility, unstyled primitives
**Cons**: Need to style everything from scratch

**Why not chosen**: shadcn/ui already does this integration for us.
