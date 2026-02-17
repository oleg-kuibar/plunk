import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { consola } from "consola";
import type { PackageJson, PlunkMeta, StoreEntry } from "../types.js";
import { getStorePackagePath } from "../utils/paths.js";
import { resolvePackFiles } from "../utils/pack-list.js";
import { computeContentHash } from "../utils/hash.js";
import { copyWithCoW, ensureDir, removeDir } from "../utils/fs.js";
import { readMeta, writeMeta } from "./store.js";

export interface PublishResult {
  name: string;
  version: string;
  fileCount: number;
  /** True if content was unchanged and publish was skipped */
  skipped: boolean;
  contentHash: string;
}

/**
 * Publish a package from a directory to the plunk store.
 *
 * 1. Read package.json, validate name and version
 * 2. Resolve publishable files
 * 3. Compute content hash
 * 4. Skip if hash matches existing store entry
 * 5. Copy files to store
 * 6. Write .plunk-meta.json
 */
export async function publish(packageDir: string): Promise<PublishResult> {
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

  // 2. Resolve publishable files
  const files = await resolvePackFiles(packageDir, pkg);
  if (files.length === 0) {
    throw new Error("No publishable files found");
  }

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

  // 5. Copy files to store
  const storePackageDir = getStorePackagePath(pkg.name, pkg.version);
  await removeDir(storePackageDir);
  await ensureDir(storePackageDir);

  // Handle workspace:* protocol in package.json dependencies
  const processedPkg = rewriteWorkspaceProtocol(pkg);
  let processedPkgJson = false;

  for (const file of files) {
    const rel = relative(packageDir, file);
    const dest = join(storePackageDir, rel);

    if (rel === "package.json" && processedPkg !== pkg) {
      // Write the rewritten package.json
      await ensureDir(join(storePackageDir));
      const { writeFile } = await import("node:fs/promises");
      await writeFile(dest, JSON.stringify(processedPkg, null, 2));
      processedPkgJson = true;
    } else {
      await copyWithCoW(file, dest);
    }
  }

  // 6. Write metadata
  const meta: PlunkMeta = {
    contentHash,
    publishedAt: new Date().toISOString(),
    sourcePath: packageDir,
  };
  await writeMeta(pkg.name, pkg.version, meta);

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
        changed = true;
      }
    }
    if (changed) {
      (result as Record<string, unknown>)[depField] = newDeps;
    }
  }

  return changed ? result : pkg;
}
