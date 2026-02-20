# CLAUDE.md

## Project

plunk — Modern local package development tool. Copies built files into `node_modules/` instead of using symlinks.

## Tech stack

- TypeScript (ESM, strict), Node.js >= 22.12
- Package manager: pnpm
- CLI: citty, consola, picocolors
- File watching: chokidar v5
- File hashing: xxhash-wasm (per-file), SHA-256 (aggregate content hash)
- Build: tsup (bundles all deps)
- Tests: vitest

## Key concepts

- **Store** (`~/.plunk/store/`): mutable package cache, keyed by `name@version`
- **Publish**: copy built files (respecting `files` field) to the store
- **Inject**: copy from store into consumer's `node_modules/` (incremental, CoW)
- **Push**: publish + inject to all registered consumers
- **Tracker**: `.plunk/state.json` per consumer, `~/.plunk/consumers.json` globally
- `PLUNK_HOME` env var overrides the store location (used in tests)

## Commands

```
pnpm build       # tsup build
pnpm test        # vitest run (requires example packages to be built)
pnpm lint        # tsc --noEmit
pnpm dev         # tsup --watch
```

## Testing

E2E tests use `examples/packages/` as real fixtures. They must be built first:
```
cd examples/packages/api-client && pnpm install && pnpm tsup
cd ../ui-kit && pnpm install && pnpm tsup
```

Tests redirect the store via `process.env.PLUNK_HOME` to temp dirs.

## Architecture

```
src/cli.ts           → citty entry point
src/commands/*.ts    → one file per CLI command
src/core/*.ts        → publisher, injector, store, tracker, watcher
src/utils/*.ts       → shared helpers (fs, hash, pm-detect, bundler-detect, config rewriters, etc.)
src/vite-plugin.ts   → Vite plugin entry (exported as @papoy/plunk/vite)
src/index.ts         → programmatic API entry (exported as @papoy/plunk)
src/types.ts         → shared interfaces
```

## Code style

- One `defineCommand()` per file in `src/commands/`, default-exported
- Utils are named exports, no default exports
- Use `consola` for user-facing messages, `verbose()` for debug-only logs
- Use `import type` for type-only imports
- Dynamic `import()` for heavy deps only loaded in some code paths (chokidar, vite-config)

## Gotchas

- `pnpm dev` (in the Commands section above) is `tsup --watch` for building plunk itself — not the same as the `plunk dev` CLI command
- pnpm injects into `.pnpm/` virtual store by following symlinks — see `src/core/injector.ts`
- `workspace:*` protocol versions are rewritten to real versions in the store copy (source untouched)
- Vite plugin watches `.plunk/state.json` and triggers full reload — not HMR
