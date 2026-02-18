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
src/commands/*.ts    → one file per CLI command (init, publish, add, remove, push, restore, list, status)
src/core/*.ts        → publisher, injector, store, tracker, watcher
src/utils/*.ts       → fs, hash, paths, pack-list, pm-detect, bin-linker
src/types.ts         → shared interfaces
```
