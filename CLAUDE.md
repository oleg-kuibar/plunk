# CLAUDE.md

## Project

plunk — Local npm package development without symlinks. Copies built files into consumer `node_modules/` with incremental sync and watch mode.

## Tech stack

- TypeScript (ESM, strict), Node.js >= 22.12
- Package manager: pnpm
- CLI: citty, picocolors, custom `consola` logger (`src/utils/console.ts`)
- File watching: chokidar v5
- File hashing: xxhash-wasm (per-file, incremental copy), SHA-256 (aggregate content hash)
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
pnpm build       # tsup build (three entries: CLI, API, Vite plugin)
pnpm test        # vitest run (requires example packages to be built)
pnpm lint        # tsc --noEmit
pnpm dev         # tsup --watch (builds plunk itself, NOT the plunk dev CLI command)
pnpm bench       # vitest bench
```

## Testing

E2E tests use `examples/packages/` as real fixtures. They must be built first:
```
cd examples/packages/api-client && pnpm install && pnpm tsup
cd ../ui-kit && pnpm install && pnpm tsup
```

Tests redirect the store via `process.env.PLUNK_HOME` to temp dirs. Coverage threshold: 70% lines (`vitest.config.ts`).

## Architecture

```
src/cli.ts           → citty entry point, global flags (--verbose, --dry-run, --json)
src/commands/*.ts    → one file per CLI command (15 commands, including reset)
src/core/
  publisher.ts       → file resolution, hashing, atomic store write, lifecycle hooks
  injector.ts        → incremental copy from store to node_modules, backup/restore
  store.ts           → store CRUD, meta read/write
  tracker.ts         → consumer state (state.json) + global registry (consumers.json)
  push-engine.ts     → doPush() orchestrator, watch config resolution
  watcher.ts         → chokidar watcher with debounce + cooldown, build subprocess
src/utils/           → shared helpers
  fs.ts              → copyWithCoW, incrementalCopy, ensureDir
  hash.ts            → xxHash64 per-file, SHA-256 aggregate (computeContentHash)
  pack-list.ts       → resolvePackFiles (npm-pack-compatible file resolution)
  pm-detect.ts       → packageManager field + lockfile-based PM detection
  workspace.ts       → workspace root detection, catalog: parsing
  lockfile.ts        → withFileLock (mkdir-based atomic lock)
  concurrency.ts     → minimal pLimit reimplementation (two-pointer O(1) dequeue)
  bin-linker.ts      → create/remove node_modules/.bin entries
  bundler-detect.ts  → detect Vite, Webpack, etc.
  bundler-cache.ts   → invalidate bundler caches after injection
  vite-config.ts     → auto-inject/remove plunk Vite plugin in user config
  nextjs-config.ts   → auto-add transpilePackages for Next.js
  tailwind-source.ts → auto-inject @source directive for Tailwind v4
  init-helpers.ts    → ensureGitignore, addPostinstall
  build-detect.ts    → auto-detect build command from package.json scripts
  output.ts          → structured JSON output (--json mode)
  logger.ts          → verbose() debug logging, flag init
  console.ts         → custom consola instance
  errors.ts          → errorWithSuggestion helper
  validators.ts      → input validation
  banner.ts          → CLI banner display
  paths.ts           → store/consumer path helpers
  timer.ts           → elapsed time tracker
src/vite-plugin.ts   → Vite plugin entry (exported as @olegkuibar/plunk/vite)
src/index.ts         → programmatic API entry (exported as @olegkuibar/plunk)
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
- `workspace:*` and `catalog:` protocol versions are rewritten to real versions in the store copy (source untouched) — see `src/core/publisher.ts` and `src/utils/workspace.ts`
- Vite plugin watches `.plunk/state.json` and triggers server restart (new package) or full reload (existing package update) — not HMR
- Lifecycle hooks run in order: `preplunk` → `prepack` → [publish] → `postpack` → `postplunk`. Default timeout 30s (`PLUNK_HOOK_TIMEOUT` env var)
- tsup has three build entries: CLI (bundled+minified, `noExternal: [/.*/]`), API lib (with .d.ts), Vite plugin (with .d.ts, vite external)
- Watch mode defaults: 500ms debounce, 500ms cooldown between builds
- `plunk clean` / `plunk gc` are aliases (same command registered twice in `src/cli.ts`)
