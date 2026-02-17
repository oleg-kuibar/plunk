# Examples

A realistic local dev setup you can actually run.

## What's here

```
examples/
├── packages/
│   ├── api-client/     # SDK with types (User, Product) and fetch helpers
│   └── ui-kit/         # Component library with Button and Card
└── apps/
    ├── web-app/        # Node.js/TS consumer using both packages
    └── react-app/      # React + Vite consumer with HMR
```

You're working on `api-client` and `ui-kit` simultaneously with two consumer apps. You want changes to the packages to show up without publishing to npm.

## Setup

### 1. Build plunk

```bash
# From the repo root
pnpm install
pnpm build
pnpm link --global
```

### 2. Build the packages

```bash
cd examples/packages/api-client
pnpm install && pnpm tsup

cd ../ui-kit
pnpm install && pnpm tsup
```

### 3. Publish to plunk store

```bash
cd ../api-client && plunk publish
cd ../ui-kit && plunk publish
```

### 4. Link into a consumer

```bash
cd ../../apps/web-app
pnpm install
plunk add @example/api-client
plunk add @example/ui-kit
```

### 5. Run it

```bash
# Node.js app
pnpm start

# React + Vite app (in another terminal)
cd ../react-app
pnpm install
plunk add @example/api-client
plunk add @example/ui-kit
pnpm dev
```

### 6. Watch mode

Make changes to a package and see them propagate automatically:

```bash
cd ../../packages/api-client
plunk push --watch --build "npx tsup"
```

Edit `src/client.ts`, save. plunk rebuilds, publishes, and copies to all consumers. The Vite dev server in `react-app` picks up the changes.

## Shortcut

Skip the separate publish step:

```bash
cd apps/web-app
plunk add @example/api-client --from ../../packages/api-client
```

## More

- [Getting started](../docs/getting-started.md)
- [Commands](../docs/commands.md)
- [Bundler guide](../docs/bundlers.md) (Vite config, etc.)
