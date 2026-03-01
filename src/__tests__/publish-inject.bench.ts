import { describe, bench, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { exists, removeDir } from "../utils/fs.js";
import { resolvePackFiles } from "../utils/pack-list.js";
import { publish } from "../core/publisher.js";
import { inject } from "../core/injector.js";
import { getStoreEntry } from "../core/store.js";
import { detectPackageManager } from "../utils/pm-detect.js";
import type { PackageJson, StoreEntry } from "../types.js";

const API_CLIENT_DIR = resolve(__dirname, "../../examples/packages/api-client");

let plunkHome: string;
let consumerDir: string;
let apiPkg: PackageJson;
let savedPlunkHome: string | undefined;

beforeAll(async () => {
  // Verify fixture is built
  if (!(await exists(join(API_CLIENT_DIR, "dist/index.js")))) {
    throw new Error(
      "api-client must be built before running benchmarks.\n" +
        "Run: cd examples/packages/api-client && pnpm install && pnpm tsup"
    );
  }

  apiPkg = JSON.parse(
    await (await import("node:fs/promises")).readFile(
      join(API_CLIENT_DIR, "package.json"),
      "utf-8"
    )
  ) as PackageJson;

  // Isolate store
  savedPlunkHome = process.env.PLUNK_HOME;
  plunkHome = await mkdtemp(join(tmpdir(), "plunk-bench-home-"));
  process.env.PLUNK_HOME = plunkHome;

  // Set up consumer with node_modules and a lockfile (npm-style)
  consumerDir = await mkdtemp(join(tmpdir(), "plunk-bench-consumer-"));
  await writeFile(
    join(consumerDir, "package.json"),
    JSON.stringify({ name: "bench-consumer", version: "1.0.0" })
  );
  await writeFile(join(consumerDir, "package-lock.json"), "{}");
  await mkdir(join(consumerDir, "node_modules"), { recursive: true });

  // Seed the store with an initial publish so inject benches have data
  await publish(API_CLIENT_DIR, { force: true });
});

afterAll(async () => {
  if (savedPlunkHome !== undefined) {
    process.env.PLUNK_HOME = savedPlunkHome;
  } else {
    delete process.env.PLUNK_HOME;
  }
  await rm(plunkHome, { recursive: true, force: true });
  await rm(consumerDir, { recursive: true, force: true });
});

describe("resolvePackFiles", () => {
  bench("api-client", async () => {
    await resolvePackFiles(API_CLIENT_DIR, apiPkg);
  });
});

describe("publish", () => {
  bench(
    "full (force)",
    async () => {
      await publish(API_CLIENT_DIR, { force: true });
    },
    {
      async setup() {
        // Clear store to force a real publish each iteration
        const entryPath = join(plunkHome, "store");
        if (await exists(entryPath)) {
          await removeDir(entryPath);
        }
      },
    }
  );
});

describe("inject", () => {
  bench(
    "cold (empty node_modules)",
    async () => {
      const entry = (await getStoreEntry(
        apiPkg.name,
        apiPkg.version
      )) as StoreEntry;
      await inject(entry, consumerDir, "npm");
    },
    {
      async setup() {
        // Ensure store is populated
        await publish(API_CLIENT_DIR, { force: true });
        // Clear consumer node_modules/<pkg> for a cold inject
        const pkgDir = join(consumerDir, "node_modules", apiPkg.name);
        if (await exists(pkgDir)) {
          await removeDir(pkgDir);
        }
      },
    }
  );

  bench(
    "incremental (no changes)",
    async () => {
      const entry = (await getStoreEntry(
        apiPkg.name,
        apiPkg.version
      )) as StoreEntry;
      await inject(entry, consumerDir, "npm");
    },
    {
      async setup() {
        // Ensure store is populated and first inject is done
        await publish(API_CLIENT_DIR, { force: true });
        const entry = (await getStoreEntry(
          apiPkg.name,
          apiPkg.version
        )) as StoreEntry;
        await inject(entry, consumerDir, "npm");
      },
    }
  );
});
