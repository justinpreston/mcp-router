# ADR-002: Use InversifyJS for Dependency Injection

## Status

Accepted

## Context

The main process contains multiple services with complex interdependencies:
- TokenService depends on Logger, Config, Repository
- ServerManager depends on Logger, Config, Audit
- PolicyEngine depends on Logger, Repository
- Many services depend on each other

We need a way to:
- Manage these dependencies cleanly
- Enable easy testing with mocks
- Support singleton and transient lifecycles
- Maintain loose coupling between components

## Decision

We will use **InversifyJS** for dependency injection in the main process.

Key implementation details:
- Services are decorated with `@injectable()`
- Dependencies are injected via constructor with `@inject()`
- Type symbols are used to identify dependencies
- A single container is created at application startup

## Consequences

### Positive

1. **Testability**: Easy to swap real services with mocks in tests
2. **Loose coupling**: Services depend on interfaces, not implementations
3. **Centralized configuration**: All bindings in one place (container.ts)
4. **Lifecycle management**: Built-in singleton/transient scopes
5. **TypeScript support**: First-class TypeScript integration with decorators
6. **Explicit dependencies**: Constructor injection makes dependencies visible

### Negative

1. **Boilerplate**: Need to define interfaces, symbols, and decorators
2. **Runtime overhead**: Small performance cost for DI resolution
3. **Decorator requirement**: Requires `experimentalDecorators` and `emitDecoratorMetadata`
4. **Learning curve**: Team needs to understand DI patterns

### Code Example

```typescript
// types.ts
export const TYPES = {
  Logger: Symbol.for('Logger'),
  TokenService: Symbol.for('TokenService'),
};

// interfaces.ts
export interface ILogger {
  info(message: string, meta?: object): void;
}

export interface ITokenService {
  create(input: TokenInput): Promise<TokenResult>;
}

// token.service.ts
@injectable()
export class TokenService implements ITokenService {
  constructor(
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  async create(input: TokenInput): Promise<TokenResult> {
    this.logger.info('Creating token', { name: input.name });
    // ...
  }
}

// container.ts
const container = new Container();
container.bind<ILogger>(TYPES.Logger).to(LoggerService).inSingletonScope();
container.bind<ITokenService>(TYPES.TokenService).to(TokenService).inSingletonScope();
```

## Alternatives Considered

### Manual Dependency Injection

**Pros**: No library needed, full control
**Cons**: Boilerplate for wiring, no lifecycle management

**Why not chosen**: Would require significant manual wiring code and doesn't scale well.

### TSyringe

**Pros**: Simpler API, automatic token generation
**Cons**: Less flexible, smaller community

**Why not chosen**: InversifyJS has better documentation and more flexible configuration.

### NestJS-style DI

**Pros**: Familiar to NestJS users
**Cons**: Tied to NestJS ecosystem, overkill for non-server apps

**Why not chosen**: Too opinionated for a desktop application context.

### No DI (Direct Instantiation)

**Pros**: Simpler code, no decorators
**Cons**: Tight coupling, difficult to test, hard to manage dependencies

**Why not chosen**: Would make testing significantly harder and code more coupled.
