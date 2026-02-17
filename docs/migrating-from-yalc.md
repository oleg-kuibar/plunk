# Migrating from yalc

This guide covers switching from yalc to plunk. The migration is straightforward because both tools solve the same problem (local package development), but plunk avoids the things that make yalc fragile.

## Key differences

| | yalc | plunk |
|---|---|---|
| **package.json** | Rewrites deps to `file:.yalc/` | Never touches package.json |
| **Git contamination** | `.yalc/` dir + modified package.json | Everything in gitignored `.plunk/` |
| **Lock file** | `yalc.lock` in project root | `.plunk/state.json` (gitignored) |
| **pnpm support** | Broken since pnpm v7.10 | Works (follows `.pnpm/` symlinks) |
| **Watch mode** | External (yalc-watch, unmaintained) | Built-in (`plunk push --watch`) |
| **After npm install** | Manual `yalc link` again | Automatic via `postinstall` hook |
| **Incremental copy** | Full copy every time | Hash-based diff, only changed files |
| **Backup/restore** | No | Yes, original npm version backed up |
| **Git hooks** | Adds pre-push hook to warn | No git hooks |

## Automated migration

plunk provides a `migrate` command that cleans up yalc artifacts:

```bash
cd my-app
plunk migrate
```

This command:

1. Reads `yalc.lock` to find which packages were linked via yalc
2. Removes `file:.yalc/` references from `package.json` (dependencies, devDependencies, peerDependencies)
3. Deletes the `.yalc/` directory
4. Deletes `yalc.lock`
5. Prints next steps

After running `migrate`, you still need to set up plunk:

```bash
plunk init                              # set up plunk in the consumer
plunk add my-lib --from ../my-lib       # publish + link each package
```

## Manual migration

If you prefer to do it by hand, or if `plunk migrate` does not cover your setup:

### 1. Remove yalc from the consumer project

```bash
# Revert any yalc-added packages
yalc remove --all

# Delete yalc artifacts
rm -rf .yalc yalc.lock
```

Check `package.json` to make sure no `file:.yalc/` references remain. If they do, restore the original version specifiers (e.g., `"my-lib": "^1.0.0"`).

### 2. Restore clean dependencies

```bash
pnpm install    # or npm install / yarn install
```

This gets you back to a clean `node_modules/` with the registry-published versions.

### 3. Set up plunk

```bash
plunk init
```

This creates `.plunk/`, adds it to `.gitignore`, and wires up the `postinstall` hook.

### 4. Publish and link your packages

For each local package you were developing with yalc:

```bash
# In the library directory
cd ../my-lib
pnpm build
plunk publish

# In the consumer directory
cd ../my-app
plunk add my-lib
```

Or in one step:

```bash
cd my-app
plunk add my-lib --from ../my-lib
```

### 5. Set up watch mode

Replace your yalc-watch setup with plunk's built-in watch:

```bash
# Before (yalc)
# Terminal 1: yalc publish --watch  (or yalc-watch)
# Terminal 2: pnpm dev

# After (plunk)
# Terminal 1:
cd my-lib
plunk push --watch --build "pnpm build"

# Terminal 2:
cd my-app
pnpm dev
```

### 6. Clean up global yalc store (optional)

yalc stores packages in `~/.yalc/`. Once you have confirmed everything works with plunk, you can delete it:

```bash
rm -rf ~/.yalc
```

## Things plunk handles differently

### No git hooks

yalc installs a pre-push git hook that warns if yalc packages are linked. plunk does not add git hooks. Since plunk never modifies `package.json`, there is nothing dangerous to accidentally commit.

### No package.json modifications

yalc rewrites dependency versions to `file:.yalc/my-lib`. This means `git diff` shows changes, CI might install from the wrong source, and `npm publish` from the consumer can accidentally include the override.

plunk never touches `package.json`. The real version from the registry stays in your dependency list. plunk just overwrites the files inside `node_modules/` at runtime.

### postinstall hook

plunk uses a `postinstall` script (`plunk restore || true`) to automatically re-inject linked packages after `npm install` / `pnpm install`. The `|| true` ensures it does not break installs if plunk is not globally installed.

### Verify with doctor

After migrating, run the diagnostic command to confirm everything is set up correctly:

```bash
plunk doctor
```

This checks the store, consumer state, `node_modules/` presence, package manager detection, bundler detection, and `.gitignore` configuration.
