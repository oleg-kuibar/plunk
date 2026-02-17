# Using plunk in CI/CD

plunk can run in CI pipelines to test against local (unpublished) versions of packages — useful when you want to verify a library change doesn't break consumers before publishing to npm.

## Key flags for CI

### --json

All plunk commands support `--json` for machine-readable output. When enabled, human-readable log messages are suppressed and structured JSON is printed to stdout.

```bash
plunk publish --json
# Output:
# {
#   "name": "my-lib",
#   "version": "1.0.0",
#   "files": 12,
#   "skipped": false,
#   "elapsed": 45
# }

plunk status --json
plunk list --json
plunk push --json
```

Use this to parse results in CI scripts:

```bash
RESULT=$(plunk push --json)
CONSUMERS=$(echo "$RESULT" | jq '.consumers')
echo "Pushed to $CONSUMERS consumer(s)"
```

### --dry-run

Preview what plunk would do without writing any files:

```bash
plunk publish --dry-run
plunk push --dry-run
```

Good for validation steps where you want to confirm the operation succeeds without writing files.

### --verbose

Enable debug-level logging for troubleshooting CI failures:

```bash
plunk push --verbose
```

Logs file hash computations, symlink resolution, store operations, and timing. In combination with `--json`, verbose logs go to stderr while structured output goes to stdout.

### --private

Allow publishing packages that have `"private": true` in package.json:

```bash
plunk publish --private
```

Private packages are skipped by default. Use this flag in CI when testing internal packages that are not meant for the npm registry.

## PLUNK_HOME for isolated environments

By default, plunk stores data in `~/.plunk/`. In CI, you typically want an isolated store per job to avoid cross-contamination between builds.

Set the `PLUNK_HOME` environment variable to redirect the store:

```bash
export PLUNK_HOME=$(mktemp -d)
plunk publish
plunk add my-lib
```

Or inline:

```bash
PLUNK_HOME=/tmp/plunk-ci plunk publish
PLUNK_HOME=/tmp/plunk-ci plunk add my-lib
```

Everything (store, registry, metadata) goes under that directory.

## GitHub Actions example

A full workflow: build a library, inject it into a consumer, run the consumer's tests.

```yaml
name: Test with local packages

on:
  pull_request:
    paths:
      - 'packages/my-lib/**'
      - 'apps/my-app/**'

jobs:
  integration-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Build library
        run: pnpm --filter my-lib build

      - name: Set up plunk
        env:
          PLUNK_HOME: ${{ runner.temp }}/plunk
        run: |
          cd apps/my-app
          npx plunk init -y

      - name: Publish and link
        env:
          PLUNK_HOME: ${{ runner.temp }}/plunk
        run: |
          npx plunk publish packages/my-lib
          cd apps/my-app
          npx plunk add my-lib

      - name: Verify link
        env:
          PLUNK_HOME: ${{ runner.temp }}/plunk
        run: |
          cd apps/my-app
          npx plunk status --json

      - name: Run consumer tests
        run: pnpm --filter my-app test

      - name: Run consumer build
        run: pnpm --filter my-app build
```

Key points:

- `PLUNK_HOME` is set to `${{ runner.temp }}/plunk` so the store is isolated to the job and cleaned up automatically.
- `plunk init -y` skips interactive prompts.
- `plunk status --json` is used as a verification step.
- The library is built before publishing, since plunk copies built output.

## Testing multiple consumers

If you have several apps that depend on the same library, you can push to all of them at once:

```yaml
      - name: Publish library
        env:
          PLUNK_HOME: ${{ runner.temp }}/plunk
        run: npx plunk publish packages/my-lib

      - name: Link to all consumers
        env:
          PLUNK_HOME: ${{ runner.temp }}/plunk
        run: |
          for app in apps/app-1 apps/app-2 apps/app-3; do
            cd $app
            npx plunk init -y
            npx plunk add my-lib
            cd ${{ github.workspace }}
          done

      - name: Run all tests
        run: pnpm --filter './apps/*' test
```

## Validating with --dry-run

Add a dry-run step to catch packaging issues without modifying anything:

```yaml
      - name: Validate packaging
        run: npx plunk publish packages/my-lib --dry-run --json
```

Catches `files` field or `.npmignore` mistakes before writing to the store.

## Tips

- Always set `PLUNK_HOME` in CI. The default `~/.plunk/` may persist across cached runners and cause stale state.
- Use `--json` for any step where you need to parse output or check results programmatically.
- Run `plunk doctor --json` as a diagnostic step if link verification fails.
- plunk does not require global installation. `npx plunk` works in any step.
- The `postinstall` hook (`plunk restore || true`) is safe in CI -- if plunk is not installed globally, `|| true` prevents the hook from failing.
