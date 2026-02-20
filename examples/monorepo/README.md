# Monorepo Example

A pnpm workspace where **internal packages use workspace links** and **external packages use plunk**. This is the hybrid workflow: workspace links for co-developed packages, plunk for testing published builds from separate repos.

## Structure

```
monorepo/
├── packages/
│   └── shared-utils/       # @mono/shared-utils — workspace package (pnpm link)
└── apps/
    ├── web/                 # Vite app — shared-utils (workspace) + api-client (plunk)
    └── server/              # Node app — shared-utils (workspace) + ui-kit (plunk)
```

## Setup

### 1. Build the external packages

```bash
cd ../packages/api-client
npm install && npx tsup

cd ../ui-kit
npm install && npx tsup
```

### 2. Publish external packages to plunk store

```bash
cd ../api-client && plunk publish
cd ../ui-kit && plunk publish
```

### 3. Install the monorepo

```bash
cd ../../monorepo
pnpm install
```

This installs workspace links for `@mono/shared-utils` automatically.

### 4. Build the workspace package

```bash
cd packages/shared-utils
pnpm build
```

### 5. Link external packages via plunk

```bash
cd ../../apps/web
plunk add @example/api-client --from ../../../packages/api-client

cd ../server
plunk add @example/ui-kit --from ../../../packages/ui-kit
```

### 6. Run

```bash
# Vite app
cd ../web
pnpm dev

# Node app (in another terminal)
cd ../server
pnpm start
```

## Watch mode

Edit an external package and see changes propagate:

```bash
cd ../../packages/api-client
plunk push --watch --build "npx tsup"
```

The Vite plugin in `apps/web` watches `.plunk/state.json` and triggers a full reload when plunk pushes new files.

## Key points

- `@mono/shared-utils` is linked via pnpm workspace protocol (`workspace:*`) — no plunk needed
- `@example/api-client` and `@example/ui-kit` are injected via plunk — simulating external packages from other repos
- The Vite app uses `@papoy/plunk/vite` plugin for automatic reload on plunk push
