# Getting started

## Install

```bash
pnpm add -g @olegkuibar/plunk

# or just use npx
npx @olegkuibar/plunk init
```

## The workflow

```mermaid
sequenceDiagram
    box rgb(46,125,50) Source
        participant Lib as Library
    end
    box rgb(21,101,192) Store
        participant Store as ~/.plunk/store
    end
    box rgb(230,81,0) Consumer
        participant App as App (node_modules)
    end

    Note over Lib: pnpm build
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

## 1. Initialize your app (optional)

Run `plunk init` in any project that will consume local packages:

```bash
cd my-app
npx plunk init
```

This adds `.plunk/` to `.gitignore`, wires up a `postinstall` hook (`plunk restore || true`), creates the `.plunk/` state directory, and auto-injects the plunk Vite plugin if a Vite config is detected. Safe to run multiple times.

> **Note:** `plunk add` auto-initializes the consumer if needed, so you can skip this step and go straight to step 3.

## 2. Publish your library

In the library you're developing:

```bash
cd my-lib
pnpm build            # build your library first
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
pnpm build
plunk push
```

This publishes to the store and copies changed files to every app that has `my-lib` linked. Only files that actually changed get re-copied.

## 5. Watch mode

Instead of manually rebuilding and pushing each time, use `plunk dev`:

```bash
cd my-lib
plunk dev
```

This auto-detects your build command from `package.json` scripts and enters watch mode. You can also use `plunk push --watch` for more control:

```bash
plunk push --watch --build "pnpm build"
```

```mermaid
graph LR
    A[File change] --> B[Coalesce 100ms]
    B --> C[Run build cmd]
    C -->|Success| D[Publish to store]
    C -->|Failure| E[Log error, keep watching]
    D --> F[Copy to all consumers]
    F --> G[Bundler HMR triggers]
    F -->|Changes during push?| B

    style A fill:#2e7d32,stroke:#66bb6a,color:#e8f5e9
    style B fill:#e65100,stroke:#ffb74d,color:#fff3e0
    style C fill:#1565c0,stroke:#64b5f6,color:#e3f2fd
    style D fill:#6a1b9a,stroke:#ba68c8,color:#f3e5f5
    style E fill:#c62828,stroke:#ef5350,color:#ffebee
    style F fill:#e65100,stroke:#ffb74d,color:#fff3e0
    style G fill:#00838f,stroke:#4dd0e1,color:#e0f2f1
```

Changes are detected immediately but coalesced — rapid saves within 100ms collapse into a single push. If new changes arrive while a push is running, plunk automatically re-pushes after it finishes. Build failures are logged but the watcher keeps running.

## 6. After `npm install`

Running `pnpm install` wipes `node_modules/` overrides. Get them back:

```bash
pnpm install       # links wiped
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
