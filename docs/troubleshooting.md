# Troubleshooting

## HMR not working after push

**Symptom:** You run `plunk push` and the bundler does not pick up the changes.

**Cause:** Most often this is bundler caching. Vite pre-bundles dependencies into `.vite/deps/` and serves the cached version. Changes to `node_modules/` files are invisible unless the package is excluded from pre-bundling.

**Fix:**

1. Add the package to `optimizeDeps.exclude` in your Vite config:

```ts
// vite.config.ts
export default defineConfig({
  optimizeDeps: {
    exclude: ['my-lib'],
  },
})
```

`plunk add` does this automatically when it detects Vite. If it was missed, run `plunk init` to re-detect.

2. Delete the Vite cache and restart the dev server:

```bash
rm -rf node_modules/.vite
pnpm dev
```

3. For Webpack with `cache: { type: 'filesystem' }`, delete `.cache/` or `node_modules/.cache/` and restart.

4. If filesystem events are not being detected at all (rare), enable polling in Vite:

```ts
server: {
  watch: {
    usePolling: true,
    interval: 500,
  },
},
```

See [Bundler Guide](bundlers.md) for full details.

---

## Files not updating after push

**Symptom:** `plunk push` says it pushed, but `node_modules/` still has old files.

**Steps:**

1. Run `plunk status` to check the health of linked packages. It will tell you if the store entry is stale, if the content hash is mismatched, or if files are missing from `node_modules/`.

2. Run `plunk update` to pull the latest versions from the store into `node_modules/`.

3. If the problem persists, run `plunk doctor` for a full diagnostic. It checks the store, global registry, consumer state, `node_modules/` presence, package manager, bundler, and `.gitignore` configuration.

4. As a last resort, remove and re-add the package:

```bash
plunk remove my-lib
plunk add my-lib --from ../my-lib
```

---

## pnpm symlink resolution issues

**Symptom:** After `plunk add`, the package is not found or imports resolve to the wrong location.

**Cause:** pnpm uses a `.pnpm/` virtual store with symlinks. plunk follows the symlink chain to write files at the real directory inside `.pnpm/`. If the symlink structure is broken (for example, after a partial `pnpm install`), injection may fail.

**Fix:**

1. Run a clean install to restore the symlink structure:

```bash
pnpm install
plunk restore
```

2. Check that the package is actually installed via pnpm before linking with plunk. plunk injects into an existing `node_modules/<pkg>` directory -- it does not create one from scratch.

3. Run `plunk doctor` to verify detection:

```bash
plunk doctor
```

It reports the detected package manager. If it shows the wrong one, check that your lockfile (`pnpm-lock.yaml`) is present.

---

## Permission errors on Windows

**Symptom:** `EPERM` or `EACCES` errors when plunk tries to write to `node_modules/` or the store.

**Causes and fixes:**

1. **Antivirus or Windows Defender** may lock files in `node_modules/`. Exclude your project directory and `~/.plunk/` from real-time scanning.

2. **File locks from running processes.** If your dev server or IDE has files open in `node_modules/<pkg>/`, plunk cannot overwrite them. Stop the dev server, run `plunk push`, then restart.

3. **Read-only files.** Some packages ship files with read-only permissions. plunk overwrites files in place, which fails on read-only targets. Run:

```bash
plunk remove my-lib
plunk add my-lib
```

4. **Long paths.** Windows has a 260-character path limit by default. If your package has deeply nested paths, enable long paths in Git and Windows:

```bash
git config --global core.longpaths true
```

And enable the Windows long paths group policy or set the registry key `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled` to `1`.

---

## "Store entry missing" errors

**Symptom:** `plunk restore`, `plunk update`, or `plunk status` warns that a store entry is missing.

**Cause:** The global store at `~/.plunk/store/` does not have the expected `name@version` entry. This happens when:

- The store was cleaned (`plunk clean`) while consumers still reference the entry.
- `PLUNK_HOME` was set to a different location during publish than during restore.
- The store directory was manually deleted.

**Fix:**

1. Re-publish the package:

```bash
cd /path/to/my-lib
plunk publish
```

2. Check that `PLUNK_HOME` is consistent. If you override it, make sure both publish and restore use the same value.

3. Run `plunk doctor` to see which entries are missing and what action to take.

---

## General debugging with --verbose

When something is not working as expected, pass `--verbose` (or `-v`) to any plunk command for detailed debug output:

```bash
plunk push --verbose
plunk add my-lib --verbose
plunk restore --verbose
plunk status --verbose
```

Verbose mode logs:

- File hash computations and skip decisions
- Symlink resolution paths (useful for pnpm debugging)
- Store read/write operations
- Consumer registry lookups
- Timing information for each phase

Combine with `--json` for machine-readable structured output that includes all of the above:

```bash
plunk status --json
plunk push --json --verbose 2>debug.log
```

With `--json`, human-readable output is suppressed and structured JSON is printed to stdout. Verbose debug logs still go to stderr via consola, so you can redirect them separately.

---

## Common error messages

| Error | Meaning | Fix |
|---|---|---|
| `Package "x" is not linked in this project` | You ran a command for a package that was never added via `plunk add` | Run `plunk add x` first |
| `No consumers registered` | `plunk push` found no projects with this package linked | Run `plunk add` in a consumer project |
| `Store entry missing for x@y` | The published version is not in the store | Re-publish with `plunk publish` |
| `No linked packages in this project` | `.plunk/state.json` has no links | Run `plunk add` to link packages |
| `Package is private` | The package has `"private": true` in package.json | Use `--private` flag: `plunk publish --private` |
