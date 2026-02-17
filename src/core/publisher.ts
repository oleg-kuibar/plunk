import { readFile, writeFile, rename } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { consola } from "consola";
import pLimit from "p-limit";
import type { PackageJson, PlunkMeta, StoreEntry } from "../types.js";
import { getStorePackagePath, getStoreEntryPath } from "../utils/paths.js";
import { resolvePackFiles } from "../utils/pack-list.js";
import { computeContentHash } from "../utils/hash.js";
import { copyWithCoW, ensureDir, removeDir } from "../utils/fs.js";
import { readMeta, writeMeta } from "./store.js";
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
}

const copyLimit = pLimit(8);

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

  // 4. Check if already up to date
  const existingMeta = await readMeta(pkg.name, pkg.version);
  if (existingMeta && existingMeta.contentHash === contentHash) {
    consola.info(`${pkg.name}@${pkg.version} already up to date`);
    return {
      name: pkg.name,
      version: pkg.version,
      fileCount: files.length,
      skipped: true,
      contentHash,
    };
  }

  // 5. Copy files to temp dir, then atomic rename
  const storeEntryDir = getStoreEntryPath(pkg.name, pkg.version);
  const tmpDir = storeEntryDir + ".tmp-" + Date.now();
  const tmpPackageDir = join(tmpDir, "package");

  try {
    await ensureDir(tmpPackageDir);

    // Handle workspace:* protocol in package.json dependencies
    const processedPkg = rewriteWorkspaceProtocol(pkg);

    verbose(`[publish] Copying files to temp store...`);

    // Copy files in parallel
    await Promise.all(
      files.map((file) =>
        copyLimit(async () => {
          const rel = relative(packageDir, file);
          const dest = join(tmpPackageDir, rel);
          await ensureDir(dirname(dest));

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
    };
    await writeFile(
      join(tmpDir, ".plunk-meta.json"),
      JSON.stringify(meta, null, 2)
    );

    // Atomic rename: remove old, rename temp to final
    await removeDir(storeEntryDir);
    await rename(tmpDir, storeEntryDir);

    verbose(`[publish] Stored at ${storeEntryDir}`);
  } catch (err) {
    // Clean up temp dir on failure
    await removeDir(tmpDir);
    throw err;
  }

  // Run postplunk lifecycle hook
  await runLifecycleHook(packageDir, pkg, "postplunk");

  consola.success(
    `Published ${pkg.name}@${pkg.version} (${files.length} files)`
  );

  return {
    name: pkg.name,
    version: pkg.version,
    fileCount: files.length,
    skipped: false,
    contentHash,
  };
}

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

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${hookName} script failed with exit code ${code}`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`${hookName} script error: ${err.message}`));
    });
  });
}

/**
 * Rewrite workspace:* protocol versions to the actual version.
 * Only modifies dependencies/devDependencies/peerDependencies.
 * Returns a new object if changes were made, the same object if not.
 */
function rewriteWorkspaceProtocol(pkg: PackageJson): PackageJson {
  let changed = false;
  const result = { ...pkg };

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
      }
    }
    if (fieldChanged) {
      (result as Record<string, unknown>)[depField] = newDeps;
    }
  }

  return changed ? result : pkg;
}
