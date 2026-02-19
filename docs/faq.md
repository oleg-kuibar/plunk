# FAQ

## Why not symlinks?

Node.js resolves `require()` and `import` from the symlink's **real path**, not the link location. When a library is symlinked from outside the consumer project, its `require('react')` resolves from the library's own `node_modules/`, not the consumer's. This creates two separate instances of React (or any shared dependency), which causes:

- "Invalid hook call" errors in React
- `instanceof` checks returning false
- Context not propagating across module boundaries
- Bundlers like Vite and Turbopack not detecting changes (symlink target is outside the watched project root)

plunk copies files directly into `node_modules/`, so the library resolves dependencies from the consumer's `node_modules/` tree, just like a real npm-installed package.

See [Comparison](comparison.md) for a detailed side-by-side with `npm link` and yalc.

## How does copy-on-write (CoW) work?

When plunk copies files, it probes each volume for reflink support using `COPYFILE_FICLONE_FORCE`. The result is cached per volume root, so the probe only happens once per process:

- **macOS (APFS):** The copy is instant and uses no additional disk space until one side is modified.
- **Linux (btrfs, XFS with reflink):** Same behavior.
- **Windows (ReFS):** Same behavior.

On filesystems that do not support reflinks (ext4, NTFS), plunk caches the failure and all subsequent copies on that volume go straight to a plain `copyFile` — no wasted syscalls retrying an unsupported operation.

plunk also uses incremental copying: it compares file sizes first (fast reject), then hashes both source and destination files using xxhash (xxh64, ~10x faster than SHA-256). Only files whose content changed get copied. Files removed from the source are deleted from the destination. All comparisons run in parallel, throttled to the available CPU core count.

## How is plunk different from yalc?

The main differences:

1. **plunk never modifies package.json.** yalc rewrites dependency versions to `file:.yalc/my-lib`, which shows up in git diffs and can leak into CI or npm publishes. plunk keeps `package.json` clean.

2. **plunk never creates project-level store directories.** yalc creates a `.yalc/` directory with package copies inside your project. plunk uses a single global store at `~/.plunk/store/` and only creates a gitignored `.plunk/` directory for state tracking.

3. **pnpm support.** yalc has been broken with pnpm since v7.10. plunk detects pnpm and follows the `.pnpm/` symlink chain to inject files at the correct location.

4. **Built-in watch mode.** yalc relies on the unmaintained `yalc-watch` package. plunk has `plunk dev` (auto-detects build command) and `plunk push --watch --build "cmd"` built in.

5. **Incremental copy.** yalc copies all files every time. plunk hashes files with xxhash (parallel, ~10x faster than SHA-256) and only copies what changed.

6. **Backup and restore.** plunk backs up the original npm-installed version and restores it on `plunk remove`. yalc does not.

See [Migrating from yalc](migrating-from-yalc.md) for a step-by-step migration guide.

## Does plunk modify package.json?

No. plunk never modifies the consumer's `package.json` or lockfile. The only project-level artifacts are:

- `.plunk/state.json` -- tracks which packages are linked (gitignored)
- `.plunk/backups/` -- backup of original npm-installed packages (gitignored)
- A `postinstall` script entry (`plunk restore || true`) added by `plunk init`

The `postinstall` script is the only change to `package.json`, and it is opt-in via `plunk init`. It does not affect dependency resolution or version specifiers.

## What about pnpm strict mode?

pnpm's strict mode (the default since pnpm v7) prevents packages from importing dependencies they did not declare. plunk works with strict mode because:

1. plunk injects files into the existing `node_modules/<pkg>` directory that pnpm already set up. It does not create new package entries or modify the dependency graph.

2. plunk follows pnpm's symlink chain: `node_modules/<pkg>` -> `.pnpm/<pkg>@<version>/node_modules/<pkg>`. Files are written at the real path, preserving pnpm's virtual store structure.

3. The library's dependencies are still resolved through pnpm's normal dependency tree. plunk only replaces the library's own files (source, types, package.json), not its dependencies.

If the library you are developing has a dependency that is not installed in the consumer, plunk warns you during `plunk add`:

```
warn  my-lib depends on "lodash" which is not installed in this project
```

You need to install it yourself (`pnpm add lodash`), just as you would with a real npm-published version.

## Can I use plunk in CI?

Yes. See [CI/CD Guide](ci-cd.md) for details. The short version:

1. Set `PLUNK_HOME` to an isolated temp directory per job.
2. Use `--json` for machine-readable output.
3. Use `--dry-run` for validation steps.
4. Use `npx plunk` -- no global install required.

```bash
export PLUNK_HOME=$(mktemp -d)
npx plunk publish packages/my-lib
cd apps/my-app && npx plunk init -y && npx plunk add my-lib
pnpm test
```

## How do I clean up the store?

The global store at `~/.plunk/store/` grows as you publish packages. To clean it up:

```bash
plunk clean
```

This removes:

- **Stale consumer registrations** -- entries in `~/.plunk/consumers.json` pointing to directories that no longer exist.
- **Unreferenced store entries** -- packages in the store that are not linked by any active consumer.

To see what is in the store before cleaning:

```bash
plunk list --store
```

To remove everything and start fresh:

```bash
rm -rf ~/.plunk
```

This deletes the store, the consumers registry, and all metadata. Existing linked packages in `node_modules/` will continue to work (they are real copies), but `plunk restore`, `plunk update`, and `plunk push` will not function until you re-publish.

## Does plunk work with Yarn PnP?

Yarn PnP (Plug'n'Play) does not use `node_modules/` at all, so plunk's copy-based approach does not apply. plunk requires a traditional `node_modules/` layout.

plunk detects this automatically and exits early with a clear error message:

```
Error: Yarn PnP mode is not compatible with plunk.

plunk works by copying files into node_modules/, but PnP eliminates
node_modules/ entirely. To use plunk with Yarn Berry, add this to
.yarnrc.yml:

  nodeLinker: node-modules

Then run: yarn install
```

If you use Yarn Berry, set the linker mode in `.yarnrc.yml`:

```yaml
nodeLinker: node-modules
```

Then run `yarn install` to recreate `node_modules/`.

Note: Yarn Berry's `nodeLinker: pnpm` mode (symlink-based virtual store, same layout as pnpm) is also supported. plunk detects this and follows the `.pnpm/` symlink chain automatically.

## Can I use plunk with private packages?

Yes. By default, plunk skips packages that have `"private": true` in `package.json`. To publish a private package, use the `--private` flag:

```bash
plunk publish --private
```

Typical for internal monorepo packages that aren't published to npm.

## What happens when I run npm install / pnpm install?

Running `npm install` or `pnpm install` replaces files in `node_modules/`, which overwrites plunk's injected files. To get them back:

```bash
plunk restore
```

If you ran `plunk init`, this happens automatically via the `postinstall` hook. The hook runs `plunk restore || true`, which re-injects all linked packages. The `|| true` ensures the install does not fail if plunk is not globally available.
