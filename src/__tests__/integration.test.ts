import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { exists } from "../utils/fs.js";

let testPlunkHome: string;
let testLib: string;
let testConsumer: string;

beforeEach(async () => {
  testPlunkHome = await mkdtemp(join(tmpdir(), "plunk-home-"));
  testLib = await mkdtemp(join(tmpdir(), "plunk-lib-"));
  testConsumer = await mkdtemp(join(tmpdir(), "plunk-consumer-"));

  // Point plunk store to temp dir
  process.env.PLUNK_HOME = testPlunkHome;

  // Create a test library
  await writeFile(
    join(testLib, "package.json"),
    JSON.stringify({
      name: "test-lib",
      version: "1.0.0",
      main: "dist/index.js",
      files: ["dist"],
    })
  );
  await mkdir(join(testLib, "dist"), { recursive: true });
  await writeFile(join(testLib, "dist", "index.js"), 'module.exports = "hello";');

  // Create a test consumer
  await writeFile(
    join(testConsumer, "package.json"),
    JSON.stringify({ name: "test-app", version: "1.0.0" })
  );
  await writeFile(join(testConsumer, "package-lock.json"), "{}");
  await mkdir(join(testConsumer, "node_modules"), { recursive: true });
});

afterEach(async () => {
  delete process.env.PLUNK_HOME;
  await rm(testPlunkHome, { recursive: true, force: true });
  await rm(testLib, { recursive: true, force: true });
  await rm(testConsumer, { recursive: true, force: true });
});

describe("publish", () => {
  it("publishes a package to the store", async () => {
    const { publish } = await import("../core/publisher.js");
    const result = await publish(testLib);

    expect(result.name).toBe("test-lib");
    expect(result.version).toBe("1.0.0");
    expect(result.skipped).toBe(false);
    expect(result.fileCount).toBeGreaterThan(0);

    // Verify store structure
    const storePkg = join(
      testPlunkHome,
      "store",
      "test-lib@1.0.0",
      "package"
    );
    expect(await exists(storePkg)).toBe(true);
    expect(await exists(join(storePkg, "package.json"))).toBe(true);
    expect(await exists(join(storePkg, "dist", "index.js"))).toBe(true);

    // Verify meta
    const meta = JSON.parse(
      await readFile(
        join(testPlunkHome, "store", "test-lib@1.0.0", ".plunk-meta.json"),
        "utf-8"
      )
    );
    expect(meta.contentHash).toMatch(/^sha256:/);
    expect(meta.sourcePath).toBe(testLib);
  });

  it("skips publish when content unchanged", async () => {
    const { publish } = await import("../core/publisher.js");
    await publish(testLib);
    const result = await publish(testLib);
    expect(result.skipped).toBe(true);
  });

  it("re-publishes when content changes", async () => {
    const { publish } = await import("../core/publisher.js");
    await publish(testLib);
    await writeFile(join(testLib, "dist", "index.js"), 'module.exports = "updated";');
    const result = await publish(testLib);
    expect(result.skipped).toBe(false);
  });
});

describe("inject", () => {
  it("copies files to consumer node_modules", async () => {
    const { publish } = await import("../core/publisher.js");
    const { getStoreEntry } = await import("../core/store.js");
    const { inject } = await import("../core/injector.js");

    await publish(testLib);
    const entry = await getStoreEntry("test-lib", "1.0.0");
    expect(entry).not.toBeNull();

    const result = await inject(entry!, testConsumer, "npm");
    expect(result.copied).toBeGreaterThan(0);

    const injectedFile = join(
      testConsumer,
      "node_modules",
      "test-lib",
      "dist",
      "index.js"
    );
    expect(await exists(injectedFile)).toBe(true);
    expect(await readFile(injectedFile, "utf-8")).toBe('module.exports = "hello";');
  });
});

describe("tracker", () => {
  it("records and reads link state", async () => {
    const { addLink, getLink, readConsumerState, removeLink } = await import(
      "../core/tracker.js"
    );

    await addLink(testConsumer, "test-lib", {
      version: "1.0.0",
      contentHash: "sha256:abc",
      linkedAt: new Date().toISOString(),
      sourcePath: testLib,
      backupExists: false,
      packageManager: "npm",
    });

    const link = await getLink(testConsumer, "test-lib");
    expect(link).not.toBeNull();
    expect(link!.version).toBe("1.0.0");

    const state = await readConsumerState(testConsumer);
    expect(Object.keys(state.links)).toHaveLength(1);

    await removeLink(testConsumer, "test-lib");
    const removed = await getLink(testConsumer, "test-lib");
    expect(removed).toBeNull();
  });

  it("manages global consumers registry", async () => {
    const { registerConsumer, getConsumers, unregisterConsumer } = await import(
      "../core/tracker.js"
    );

    await registerConsumer("test-lib", testConsumer);
    let consumers = await getConsumers("test-lib");
    expect(consumers).toHaveLength(1);

    await unregisterConsumer("test-lib", testConsumer);
    consumers = await getConsumers("test-lib");
    expect(consumers).toHaveLength(0);
  });
});

describe("incremental copy on push", () => {
  it("only copies changed files", async () => {
    const { publish } = await import("../core/publisher.js");
    const { getStoreEntry } = await import("../core/store.js");
    const { inject } = await import("../core/injector.js");

    await publish(testLib);
    let entry = await getStoreEntry("test-lib", "1.0.0");
    await inject(entry!, testConsumer, "npm");

    // Modify one file
    await writeFile(join(testLib, "dist", "index.js"), 'module.exports = "v2";');
    await publish(testLib);
    entry = await getStoreEntry("test-lib", "1.0.0");

    const result = await inject(entry!, testConsumer, "npm");
    // Only the changed file should be copied
    expect(result.copied).toBe(1);
    expect(result.skipped).toBeGreaterThan(0);
  });
});

describe("backup and restore", () => {
  it("backs up and restores existing package", async () => {
    const { publish } = await import("../core/publisher.js");
    const { getStoreEntry } = await import("../core/store.js");
    const { inject, backupExisting, restoreBackup } = await import(
      "../core/injector.js"
    );

    // Simulate an npm-installed version
    const nmDir = join(testConsumer, "node_modules", "test-lib");
    await mkdir(nmDir, { recursive: true });
    await writeFile(join(nmDir, "index.js"), "original");

    // Backup, then inject plunk version
    const hasBackup = await backupExisting(testConsumer, "test-lib", "npm");
    expect(hasBackup).toBe(true);

    await publish(testLib);
    const entry = await getStoreEntry("test-lib", "1.0.0");
    await inject(entry!, testConsumer, "npm");

    // Verify plunk version is injected
    expect(
      await readFile(join(nmDir, "dist", "index.js"), "utf-8")
    ).toBe('module.exports = "hello";');

    // Restore original
    const restored = await restoreBackup(testConsumer, "test-lib", "npm");
    expect(restored).toBe(true);
    expect(await readFile(join(nmDir, "index.js"), "utf-8")).toBe("original");
  });
});

describe("scoped packages", () => {
  it("handles @scope/name correctly", async () => {
    const { publish } = await import("../core/publisher.js");
    const { findStoreEntry } = await import("../core/store.js");

    // Create a scoped package
    await writeFile(
      join(testLib, "package.json"),
      JSON.stringify({
        name: "@my-scope/my-lib",
        version: "2.0.0",
        files: ["dist"],
      })
    );

    const result = await publish(testLib);
    expect(result.name).toBe("@my-scope/my-lib");

    // Verify it can be found
    const entry = await findStoreEntry("@my-scope/my-lib");
    expect(entry).not.toBeNull();
    expect(entry!.version).toBe("2.0.0");
  });
});

describe("missing transitive deps", () => {
  it("detects missing dependencies", async () => {
    const { publish } = await import("../core/publisher.js");
    const { getStoreEntry } = await import("../core/store.js");
    const { checkMissingDeps } = await import("../core/injector.js");

    // Create lib with dependencies
    await writeFile(
      join(testLib, "package.json"),
      JSON.stringify({
        name: "test-lib",
        version: "1.0.0",
        files: ["dist"],
        dependencies: {
          lodash: "^4.0.0",
          "not-installed": "^1.0.0",
        },
      })
    );

    await publish(testLib);
    const entry = await getStoreEntry("test-lib", "1.0.0");

    // Install lodash mock but not "not-installed"
    await mkdir(join(testConsumer, "node_modules", "lodash"), {
      recursive: true,
    });

    const missing = await checkMissingDeps(entry!, testConsumer);
    expect(missing).toContain("not-installed");
    expect(missing).not.toContain("lodash");
  });
});
