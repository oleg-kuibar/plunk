# Standalone Examples

Four separate apps, each using a different package manager. All consume `@example/api-client` and `@example/ui-kit` via plunk.

| App | Package Manager | Type |
|-----|----------------|------|
| `npm-app/` | npm | Node.js CLI |
| `pnpm-app/` | pnpm | Vite + vanilla TS |
| `yarn-app/` | yarn (v4, `nodeLinker: node-modules`) | Node.js CLI |
| `bun-app/` | bun | Node.js/Bun CLI |

## Setup

### 1. Build the packages

```bash
cd ../packages/api-client
npm install && npx tsup

cd ../ui-kit
npm install && npx tsup
```

### 2. Publish to plunk store

```bash
cd ../api-client && plunk publish
cd ../ui-kit && plunk publish
```

### 3. Set up an app (repeat for each)

**npm-app:**

```bash
cd npm-app
npm install
plunk add @example/api-client --from ../../packages/api-client
plunk add @example/ui-kit --from ../../packages/ui-kit
npm start
```

**pnpm-app:**

```bash
cd pnpm-app
pnpm install
plunk add @example/api-client --from ../../packages/api-client
plunk add @example/ui-kit --from ../../packages/ui-kit
pnpm dev
```

**yarn-app:**

```bash
cd yarn-app
yarn install
plunk add @example/api-client --from ../../packages/api-client
plunk add @example/ui-kit --from ../../packages/ui-kit
yarn start
```

**bun-app:**

```bash
cd bun-app
bun install
plunk add @example/api-client --from ../../packages/api-client
plunk add @example/ui-kit --from ../../packages/ui-kit
bun start
```

## Watch mode

Edit a package and see changes propagate:

```bash
cd ../../packages/api-client
plunk push --watch --build "npx tsup"
```

Save a file in `src/` — plunk rebuilds, publishes, and injects into all consumers.
