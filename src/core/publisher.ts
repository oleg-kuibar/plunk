import { readFile, writeFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join, relative, dirname } from "node:path";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { consola } from "consola";
import pLimit from "p-limit";
import { availableParallelism } from "node:os";
import type { PackageJson, PlunkMeta, StoreEntry } from "../types.js";
import { getStorePackagePath, getStoreEntryPath } from "../utils/paths.js";
import { resolvePackFiles } from "../utils/pack-list.js";
import { computeContentHash } from "../utils/hash.js";
import { copyWithCoW, ensureDir, ensurePrivateDir, removeDir, moveDir, exists } from "../utils/fs.js";
import { readMeta, writeMeta } from "./store.js";
import { withFileLock } from "../utils/lockfile.js";
import type { Catalogs } from "../utils/workspace.js";
import { verbose } from "../utils/logger.js";

export interface PublishOptions {
  allowPrivate?: boolean;
}

export interface PublishResult {
  name: string;
  version: string;
  fileCount: number;
  /** True if content was unchanged and publish was skipped */
  skipped: boolean;
  contentHash: string;
  /** 8-char hex identifier generated on each successful publish */
  buildId: string;
}

const copyLimit = pLimit(Math.max(availableParallelism(), 8));

/**
 * Publish a package from a directory to the plunk store.
 *
 * 1. Read package.json, validate name and version
 * 2. Resolve publishable files
 * 3. Compute content hash
 * 4. Skip if hash matches existing store entry
 * 5. Copy files to temp dir, then atomic rename to store
 * 6. Write .plunk-meta.json
 */
export async function publish(
  packageDir: string,
  options: PublishOptions = {}
): Promise<PublishResult> {
  // 1. Read and validate package.json
  const pkgPath = join(packageDir, "package.json");
  let pkgContent: string;
  try {
    pkgContent = await readFile(pkgPath, "utf-8");
  } catch {
    throw new Error(`No package.json found in ${packageDir}`);
  }

  const pkg = JSON.parse(pkgContent) as PackageJson;
  if (!pkg.name) throw new Error("package.json missing 'name' field");
  if (!pkg.version) throw new Error("package.json missing 'version' field");
  if (pkg.private && !options.allowPrivate) {
    throw new Error(
      `Package "${pkg.name}" is private. Use --private flag to publish private packages.`
    );
  }

  // Run preplunk lifecycle hook
  await runLifecycleHook(packageDir, pkg, "preplunk");

  // 2. Resolve publishable files
  const files = await resolvePackFiles(packageDir, pkg);
  if (files.length === 0) {
    throw new Error("No publishable files found");
  }
  verbose(`[publish] Resolved ${files.length} files for ${pkg.name}@${pkg.version}`);

  // 3. Compute content hash
  const contentHash = await computeContentHash(files, packageDir);

  // 4. Pre-load catalog definitions if any dep uses catalog: protocol
  await preloadCatalogs(pkg, packageDir);

  // 5. Fast path: check if already up to date (no lock needed)
  const existingMeta = await readMeta(pkg.name, pkg.version);
  if (existingMeta && existingMeta.contentHash === contentHash) {
    consola.info(`${pkg.name}@${pkg.version} already up to date`);
    return {
      name: pkg.name,
      version: pkg.version,
      fileCount: files.length,
      skipped: true,
      contentHash,
      buildId: existingMeta.buildId ?? "",
    };
  }

  // 6. Acquire lock and copy files to store (prevents concurrent publish corruption)
  const storeEntryDir = getStoreEntryPath(pkg.name, pkg.version);

  const result = await withFileLock(
    storeEntryDir + ".lock",
    async () => {
      // Re-check hash under lock — another process may have published while we waited
      const metaUnderLock = await readMeta(pkg.name, pkg.version);
      if (metaUnderLock && metaUnderLock.contentHash === contentHash) {
        consola.info(`${pkg.name}@${pkg.version} already up to date`);
        return {
          name: pkg.name,
          version: pkg.version,
          fileCount: files.length,
          skipped: true,
          contentHash,
          buildId: metaUnderLock.buildId ?? "",
        } satisfies PublishResult;
      }

      const tmpDir = storeEntryDir + ".tmp-" + Date.now();
      const tmpPackageDir = join(tmpDir, "package");
      const buildId = randomBytes(4).toString("hex");

      try {
        await ensurePrivateDir(tmpPackageDir);

        // Handle workspace:* protocol in package.json dependencies
        const processedPkg = rewriteProtocolVersions(pkg, packageDir);

        verbose(`[publish] Copying files to temp store...`);

        // Pre-compute and create unique parent directories before parallel copy
        const uniqueDirs = new Set(
          files.map((file) => dirname(join(tmpPackageDir, relative(packageDir, file))))
        );
        await Promise.all([...uniqueDirs].map((d) => ensureDir(d)));

        // Copy files in parallel
        await Promise.all(
          files.map((file) =>
            copyLimit(async () => {
              const rel = relative(packageDir, file);
              const dest = join(tmpPackageDir, rel);

              if (rel === "package.json" && processedPkg !== pkg) {
                // Write the rewritten package.json
                await writeFile(dest, JSON.stringify(processedPkg, null, 2));
              } else {
                await copyWithCoW(file, dest);
              }
            })
          )
        );

        // Write metadata to temp dir
        const meta: PlunkMeta = {
          contentHash,
          publishedAt: new Date().toISOString(),
          sourcePath: packageDir,
          buildId,
        };
        await writeFile(
          join(tmpDir, ".plunk-meta.json"),
          JSON.stringify(meta, null, 2)
        );

        // Atomic swap: rename old aside, move temp to final, then clean up old
        const hadOld = await exists(storeEntryDir);
        const oldDir = storeEntryDir + ".old-" + Date.now();
        if (hadOld) await rename(storeEntryDir, oldDir);
        await moveDir(tmpDir, storeEntryDir);
        if (hadOld) await removeDir(oldDir);

        verbose(`[publish] Stored at ${storeEntryDir}`);
      } catch (err) {
        // Clean up temp dir on failure
        await removeDir(tmpDir);
        throw err;
      }

      return {
        name: pkg.name,
        version: pkg.version,
        fileCount: files.length,
        skipped: false,
        contentHash,
        buildId,
      } satisfies PublishResult;
    },
    { stale: 60000 }
  );

  if (result.skipped) return result;

  // Run postplunk lifecycle hook (outside the lock so slow scripts don't hold it)
  await runLifecycleHook(packageDir, pkg, "postplunk");

  consola.success(
    `Published ${pkg.name}@${pkg.version} (${files.length} files) [${result.buildId}]`
  );

  return result;
}

const HOOK_TIMEOUT = parseInt(process.env.PLUNK_HOOK_TIMEOUT ?? "30000", 10);

/**
 * Run a lifecycle hook script if defined in package.json scripts.
 */
async function runLifecycleHook(
  packageDir: string,
  pkg: PackageJson,
  hookName: string
): Promise<void> {
  const script = pkg.scripts?.[hookName];
  if (!script) return;

  verbose(`[lifecycle] Running ${hookName}: ${script}`);
  return new Promise((resolve, reject) => {
    const isWin = platform() === "win32";
    const shell = isWin ? "cmd" : "sh";
    const shellFlag = isWin ? "/c" : "-c";

    const child = spawn(shell, [shellFlag, script], {
      cwd: packageDir,
      stdio: "inherit",
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${hookName} script timed out after ${HOOK_TIMEOUT}ms`));
    }, HOOK_TIMEOUT);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${hookName} script failed with exit code ${code}`));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`${hookName} script error: ${err.message}`));
    });
  });
}

/**
 * Rewrite workspace:* and catalog:* protocol versions to actual versions.
 * Only modifies dependencies/devDependencies/peerDependencies.
 * Returns a new object if changes were made, the same object if not.
 */
function rewriteProtocolVersions(pkg: PackageJson, packageDir: string): PackageJson {
  let changed = false;
  const result = { ...pkg };
  let catalogs: Catalogs | null = null;
  let catalogsLoaded = false;

  for (const depField of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
  ] as const) {
    const deps = pkg[depField];
    if (!deps) continue;

    let fieldChanged = false;
    const newDeps = { ...deps };
    for (const [name, version] of Object.entries(deps)) {
      if (version.startsWith("workspace:")) {
        const versionPart = version.slice("workspace:".length);
        // workspace:* or workspace:^ or workspace:~ → use the package's own version
        if (versionPart === "*" || versionPart === "^" || versionPart === "~") {
          newDeps[name] = versionPart === "*" ? pkg.version : versionPart + pkg.version;
        } else {
          // workspace:1.0.0 → 1.0.0
          newDeps[name] = versionPart;
        }
        fieldChanged = true;
        changed = true;
      } else if (version.startsWith("catalog:")) {
        // Lazy-load catalogs only when needed
        if (!catalogsLoaded) {
          catalogs = loadCatalogsSync(packageDir);
          catalogsLoaded = true;
        }
        if (catalogs) {
          const resolved = resolveCatalogVersion(version, name, catalogs);
          if (resolved) {
            newDeps[name] = resolved;
            fieldChanged = true;
            changed = true;
          } else {
            verbose(`[publish] catalog: specifier for "${name}" not found, leaving as-is`);
          }
        } else {
          verbose(`[publish] No pnpm-workspace.yaml found, cannot resolve catalog: for "${name}"`);
        }
      }
    }
    if (fieldChanged) {
      (result as Record<string, unknown>)[depField] = newDeps;
    }
  }

  return changed ? result : pkg;
}

/**
 * Resolve a catalog: specifier to the actual version string.
 * - `catalog:` or `catalog:default` → default catalog
 * - `catalog:<name>` → named catalog
 */
function resolveCatalogVersion(
  specifier: string,
  depName: string,
  catalogs: Catalogs
): string | null {
  const catalogRef = specifier.slice("catalog:".length);

  if (catalogRef === "" || catalogRef === "default") {
    return catalogs.default[depName] ?? null;
  }

  return catalogs.named[catalogRef]?.[depName] ?? null;
}

// Cached catalogs per workspace root to avoid re-parsing
let _cachedCatalogs: { root: string; catalogs: Catalogs } | null = null;

/**
 * Synchronously-cached catalog loader. Reads catalogs on first call per workspace root.
 * Returns null if no pnpm-workspace.yaml is found.
 */
function loadCatalogsSync(packageDir: string): Catalogs | null {
  // This is called from a sync context within rewriteProtocolVersions,
  // but we need async I/O. We pre-load catalogs before calling the rewrite function.
  // See the preloadCatalogs() call in publish().
  return _cachedCatalogs?.catalogs ?? null;
}

/**
 * Pre-load catalog definitions from pnpm-workspace.yaml if any deps use catalog: protocol.
 */
async function preloadCatalogs(
  pkg: PackageJson,
  packageDir: string
): Promise<void> {
  // Check if any dep uses catalog: protocol
  const hasCatalog = (["dependencies", "devDependencies", "peerDependencies"] as const).some(
    (field) => {
      const deps = pkg[field];
      return deps && Object.values(deps).some((v) => v.startsWith("catalog:"));
    }
  );
  if (!hasCatalog) return;

  const { findWorkspaceRoot, parseCatalogs } = await import("../utils/workspace.js");
  const root = await findWorkspaceRoot(packageDir);
  if (!root) {
    _cachedCatalogs = null;
    return;
  }

  // Use cached result if same workspace root
  if (_cachedCatalogs?.root === root) return;

  const catalogs = await parseCatalogs(root);
  _cachedCatalogs = { root, catalogs };
}
