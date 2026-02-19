# Monorepo and multi-consumer setup

plunk works with monorepos and multi-project setups where a library is consumed by several apps.

## How plunk handles multiple consumers

When you run `plunk add my-lib` in different projects, each one is registered in the global consumers registry at `~/.plunk/consumers.json`:

```json
{
  "my-lib": [
    "/home/user/projects/app-1",
    "/home/user/projects/app-2",
    "/home/user/projects/app-3"
  ]
}
```

When you run `plunk push` from the library directory, plunk publishes to the store once and then copies changed files into every registered consumer in parallel (up to 4 concurrent injections).

```
my-lib/
  plunk push
    -> publish to store (once)
    -> inject into app-1/node_modules/my-lib/
    -> inject into app-2/node_modules/my-lib/
    -> inject into app-3/node_modules/my-lib/
```

Each consumer gets its own backup, state tracking, and content hash. Consumers can even be on different package managers.

## pnpm workspaces with plunk

In a pnpm workspace, internal packages are typically linked via `workspace:*` protocol. plunk is useful when you want to test a package as it would appear after publishing to npm -- with built output, resolved workspace versions, and the `files` field applied -- rather than using the raw source link.

### Setup

```
monorepo/
  packages/
    my-lib/           # the library you're developing
  apps/
    web-app/          # consumer app
    mobile-app/       # another consumer
  pnpm-workspace.yaml
```

```bash
# Build and publish the library
cd packages/my-lib
pnpm build
plunk publish

# Set up each consumer
cd ../../apps/web-app
plunk init -y
plunk add my-lib

cd ../mobile-app
plunk init -y
plunk add my-lib
```

Now `plunk push` from `packages/my-lib/` will update both apps.

### workspace:* protocol

When plunk publishes a package, it rewrites `workspace:*`, `workspace:^`, and `workspace:~` version specifiers to the actual resolved versions in the store copy. Your source `package.json` is never modified.

For example, if `my-lib/package.json` has:

```json
{
  "dependencies": {
    "shared-utils": "workspace:^"
  }
}
```

And `shared-utils` is version `2.1.0`, the store copy will have:

```json
{
  "dependencies": {
    "shared-utils": "^2.1.0"
  }
}
```

This means the injected version in `node_modules/` behaves like a real published package.

## Watch mode with multiple consumers

Use `plunk dev` to continuously push changes to all consumers as you edit:

```bash
cd packages/my-lib
plunk dev
```

`plunk dev` auto-detects the build command from `package.json` scripts. For explicit control, use `plunk push --watch --build "pnpm build"`.

The flow is:

1. Source file changes detected immediately
2. Coalesce window (default 100ms, configurable via `--debounce`)
3. Build command runs (`pnpm build`)
4. Publish to store (skipped if content hash unchanged)
5. Copy changed files to all registered consumers
6. Each consumer's bundler detects the `node_modules/` change and triggers HMR
7. If changes arrived during steps 3-5, automatically re-runs

In a separate terminal, run your consumer's dev server:

```bash
cd apps/web-app
pnpm dev
```

If a build fails, plunk logs the error and keeps watching. Fix the code and save again.

### Coalesce tuning

For large builds, increase the coalesce window to avoid redundant rebuilds while you are making rapid edits:

```bash
plunk dev --debounce 500
```

## Multiple libraries

If you are developing multiple libraries simultaneously, run `plunk push --watch` for each one in its own terminal:

```bash
# Terminal 1
cd packages/my-lib
plunk dev

# Terminal 2
cd packages/shared-utils
plunk dev

# Terminal 3
cd apps/web-app
pnpm dev
```

Each library tracks its own consumers independently.

## Tips for monorepo setups

### Initialize all consumers at once

```bash
for app in apps/*/; do
  (cd "$app" && plunk init -y)
done
```

### Link a library to all consumers

```bash
cd packages/my-lib
pnpm build
plunk publish

for app in apps/*/; do
  (cd "$app" && plunk add my-lib)
done
```

### Check status across consumers

From any consumer:

```bash
plunk status
plunk doctor
```

### After pnpm install

Running `pnpm install` in a workspace can wipe `node_modules/` overrides. If `plunk init` was run in each consumer, the `postinstall` hook (`plunk restore || true`) will re-inject automatically.

If you need to re-inject manually:

```bash
for app in apps/*/; do
  (cd "$app" && plunk restore)
done
```

### Clean up stale state

When you remove a consumer project or stop using plunk in one, the global registry may still reference it. Run:

```bash
plunk clean
```

This removes stale consumer registrations (directories that no longer exist) and unreferenced store entries.

## Mixing plunk with workspace protocol

plunk and pnpm workspace links can coexist. You might use `workspace:*` for packages that are consumed as raw source (with shared `tsconfig` paths), and plunk for packages you want to test as published builds.

The general rule: if you want to test the "npm publish" output of a package locally, use plunk. If you want live source links with your bundler handling the transpilation, use the regular workspace protocol.
