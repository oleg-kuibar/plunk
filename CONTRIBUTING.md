# Contributing

## Development setup

```bash
git clone https://github.com/oleg-kuibar/plunk.git
cd plunk
pnpm install
pnpm build
```

### Running locally

```bash
# Link the CLI globally for testing
pnpm link --global

# Now you can use `plunk` anywhere
plunk --help
```

### Scripts

| Command | What it does |
|---|---|
| `pnpm build` | Build with tsup |
| `pnpm dev` | Build in watch mode |
| `pnpm test` | Run tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Type-check with tsc |

## Project structure

```
src/
├── cli.ts                # Entry point, citty command routing
├── commands/             # CLI command definitions (one file per command)
├── core/                 # Core logic (publisher, injector, store, tracker, watcher)
├── utils/                # Shared utilities (fs, hash, paths, pack-list, pm-detect, bin-linker)
├── types.ts              # Shared TypeScript types
└── index.ts              # Public API exports
```

See [How it works](docs/how-it-works.md) for details on the store, injection, and copy strategy.

## Testing

Tests use [vitest](https://vitest.dev/):

- Unit tests in `src/utils/__tests__/`
- Integration tests in `src/__tests__/integration.test.ts` (uses temp dirs)
- E2E tests in `src/__tests__/e2e.test.ts` (uses the `examples/` packages as real fixtures)

### Running e2e tests

The e2e tests require example packages to be built first:

```bash
cd examples/packages/api-client && pnpm install && pnpm tsup
cd ../ui-kit && pnpm install && pnpm tsup
cd ../../..
pnpm test
```

### Writing tests

- Tests use `PLUNK_HOME` env var to redirect the store to a temp directory
- Each test creates fresh temp dirs and cleans up in `afterEach`
- Prefer testing through the core module APIs rather than CLI

## Submitting changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Add or update tests as needed
4. Run `pnpm test` and `pnpm lint` to verify
5. Open a pull request

## Code style

- TypeScript with strict mode
- ESM (`type: "module"`)
- No default exports (except CLI commands for citty)
- Use `consola` for user-facing output
- Use `picocolors` for terminal colors
