<p align="center">
  <img src="plunk_logo.png" width="200" alt="plunk logo" />
</p>

<p align="center">
  <a href="https://plunk-playground.vercel.app"><img src="https://img.shields.io/badge/Try_in_Browser-Playground-58a6ff?style=flat&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0tMiAxNWwtNS01IDEuNDEtMS40MUwxMCAxNC4xN2w3LjU5LTcuNTlMMTkgOGwtOSA5eiIvPjwvc3ZnPg==" alt="Playground" /></a>
  <a href="https://www.npmjs.com/package/@olegkuibar/plunk"><img src="https://img.shields.io/npm/v/@olegkuibar/plunk?color=blue" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@olegkuibar/plunk"><img src="https://img.shields.io/npm/dm/@olegkuibar/plunk" alt="npm downloads" /></a>
  <a href="https://github.com/oleg-kuibar/plunk/actions/workflows/ci.yml"><img src="https://github.com/oleg-kuibar/plunk/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/oleg-kuibar/plunk/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22.12-brightgreen" alt="node version" />
</p>

# plunk

Modern local package development tool. Smart file copying into `node_modules` — no symlinks, no git contamination.

```bash
npx plunk init       # set up your app
plunk add my-lib     # link a package
plunk push --watch   # continuous dev mode
```

## Why not symlinks?

`npm link` creates symlinks that break module resolution: duplicate React instances, peer dep mismatches, bundlers that can't follow links outside the project root. `yalc` improves on this but [still has issues](https://github.com/wclr/yalc/issues) with pnpm, git contamination, and watch mode.

**plunk** just copies built files directly into `node_modules/`. It works.

## How it works

```mermaid
graph LR
    A["my-lib/"] -- "plunk publish" --> B["~/.plunk/store/<br/>my-lib@1.0.0"]
    B -- "plunk add" --> C["app/node_modules/<br/>my-lib/"]
    B -- "plunk push" --> D["app-2/node_modules/<br/>my-lib/"]

    style A fill:#2e7d32,stroke:#66bb6a,color:#e8f5e9
    style B fill:#1565c0,stroke:#64b5f6,color:#e3f2fd
    style C fill:#e65100,stroke:#ffb74d,color:#fff3e0
    style D fill:#e65100,stroke:#ffb74d,color:#fff3e0
```

1. `publish` copies built files to a local store at `~/.plunk/store/`
2. `add` copies from store into your app's `node_modules/`
3. `push` = publish + copy to all consumers
4. `--watch` = file change → build → push loop

> Uses CoW reflinks for instant copy-on-write on APFS/btrfs/ReFS, with automatic fallback. Reflink support is probed once per volume and cached — no wasted syscalls. Only changed files are re-copied (xxhash-based diffing).

## Quick start

```bash
# In your app — one-time setup
cd my-app
npx plunk init

# In your library — build and publish to plunk store
cd my-lib
pnpm build
plunk publish

# Back in your app — link the library
cd my-app
plunk add my-lib

# Continuous dev: watch → build → push
cd my-lib
plunk push --watch --build "pnpm build"
```

## At a glance

| | npm link | yalc | plunk |
|---|---|---|---|
| Module resolution | Broken (dual instances) | Works | Works |
| Git contamination | None | package.json + .yalc/ | None |
| Bundler HMR | Often broken | Fragile | Works |
| pnpm support | Fragile | Broken since v7.10 | Works |
| Watch mode | None | External | Built-in |
| Survives `npm install` | No | No | `plunk restore` |

## Install

```bash
pnpm add -g @olegkuibar/plunk       # or npm, yarn, bun
npx @olegkuibar/plunk init          # set up a consumer project
```

## Try it online

Experience plunk directly in your browser with our interactive playground:

**[Open Playground](https://plunk-playground.vercel.app)** — Run real `plunk publish`, `plunk add`, and `plunk push` commands with live HMR preview.

## Documentation

| | |
|---|---|
| [Getting Started](docs/getting-started.md) | Install, first publish/add cycle, watch mode |
| [Commands](docs/commands.md) | Every command, every flag |
| [How It Works](docs/how-it-works.md) | Store format, injection, CoW copies |
| [Bundler Guide](docs/bundlers.md) | Vite, Webpack, esbuild, Turbopack setup |
| [Comparison](docs/comparison.md) | npm link vs yalc vs plunk |
| [CI/CD](docs/ci-cd.md) | Using plunk in CI pipelines |
| [Monorepo Guide](docs/monorepo.md) | Workspace setup and recursive publish |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and fixes |
| [FAQ](docs/faq.md) | Frequently asked questions |
| [Migrating from yalc](docs/migrating-from-yalc.md) | Step-by-step migration guide |
| [Architecture](docs/architecture.md) | Internals for contributors |
| [API Reference](docs/api.md) | Programmatic API (TypeScript) |
| [Examples](examples/) | Try it yourself with real packages |
| [Playground](playground/) | Interactive browser-based playground |
| [Contributing](CONTRIBUTING.md) | Dev setup and guidelines |

## License

[MIT](LICENSE)
