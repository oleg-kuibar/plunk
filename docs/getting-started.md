# Getting started

## Install

```bash
npm install -g plunk

# or just use npx
npx plunk init
```

## The workflow

```mermaid
sequenceDiagram
    participant Lib as Library
    participant Store as ~/.plunk/store
    participant App as App (node_modules)

    Note over Lib: npm run build
    Lib->>Store: plunk publish
    Store->>App: plunk add my-lib

    loop Watch mode
        Note over Lib: edit source
        Lib->>Lib: build (tsup, tsc, etc.)
        Lib->>Store: publish
        Store->>App: copy changed files
        Note over App: bundler detects changes → HMR
    end
```

## 1. Initialize your app

Run `plunk init` in any project that will consume local packages:

```bash
cd my-app
npx plunk init
```

This adds `.plunk/` to `.gitignore`, wires up a `postinstall` hook (`plunk restore || true`), and creates the `.plunk/` state directory. Safe to run multiple times.

## 2. Publish your library

In the library you're developing:

```bash
cd my-lib
npm run build         # build your library first
plunk publish
```

plunk reads the `files` field from `package.json` (same as `npm pack`) and copies those files to `~/.plunk/store/my-lib@<version>/`. If nothing changed since last time, it skips.

## 3. Link into your app

```bash
cd my-app
plunk add my-lib
```

This copies files from the store into `node_modules/my-lib/`. plunk checks your lockfile to figure out the package manager and uses the right injection strategy (pnpm needs special handling for `.pnpm/`).

You can also publish and add in one step:

```bash
plunk add my-lib --from ../my-lib
```

## 4. Push changes

After making changes to your library:

```bash
cd my-lib
npm run build
plunk push
```

This publishes to the store and copies changed files to every app that has `my-lib` linked. Only files that actually changed get re-copied.

## 5. Watch mode

Instead of manually rebuilding and pushing each time, use watch mode:

```bash
cd my-lib
plunk push --watch --build "npm run build"
```

```mermaid
graph LR
    A[File change] --> B[Debounce 300ms]
    B --> C[Run build cmd]
    C -->|Success| D[Publish to store]
    C -->|Failure| E[Log error, keep watching]
    D --> F[Copy to all consumers]
    F --> G[Bundler HMR triggers]

    style A fill:#e8f5e9,stroke:#43a047
    style C fill:#e3f2fd,stroke:#1e88e5
    style F fill:#fff3e0,stroke:#fb8c00
    style G fill:#fce4ec,stroke:#e53935
```

If a build fails, plunk logs the error and keeps watching. Fix the code, save again.

## 6. After `npm install`

Running `npm install` wipes `node_modules/` overrides. Get them back:

```bash
npm install        # links wiped
plunk restore      # all back
```

If you ran `plunk init`, this happens automatically via the `postinstall` hook.

## 7. Clean up

When you're done with local development:

```bash
plunk remove my-lib
```

This removes the plunk link and restores the original npm-installed version (if it was backed up).

## Try it for real

The [examples/](../examples/) folder has a working setup: two library packages, a Node.js consumer, and a React + Vite app with HMR. Good for kicking the tires.

## Next

- [Commands](commands.md) - every flag
- [How It Works](how-it-works.md) - store format, injection, copies
- [Bundler Guide](bundlers.md) - Vite, Webpack, esbuild setup
