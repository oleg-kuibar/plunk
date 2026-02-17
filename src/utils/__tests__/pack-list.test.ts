import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolvePackFiles } from "../pack-list.js";
import type { PackageJson } from "../../types.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "plunk-pack-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("resolvePackFiles", () => {
  it("always includes package.json", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");
    const pkg: PackageJson = { name: "test", version: "1.0.0" };
    const files = await resolvePackFiles(tempDir, pkg);
    expect(files.some((f) => f.endsWith("package.json"))).toBe(true);
  });

  it("uses files field when present", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");
    await mkdir(join(tempDir, "dist"), { recursive: true });
    await writeFile(join(tempDir, "dist", "index.js"), "");
    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src", "index.ts"), "");

    const pkg: PackageJson = { name: "test", version: "1.0.0", files: ["dist"] };
    const files = await resolvePackFiles(tempDir, pkg);
    const rels = files.map((f) => f.replace(tempDir + "\\", "").replace(tempDir + "/", ""));

    expect(rels).toContainEqual(expect.stringContaining("dist"));
    // src/ should NOT be included since files only says dist
    expect(rels.every((r) => !r.startsWith("src"))).toBe(true);
  });

  it("includes README.md and LICENSE even with files field", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");
    await writeFile(join(tempDir, "README.md"), "# hello");
    await writeFile(join(tempDir, "LICENSE"), "MIT");
    await mkdir(join(tempDir, "dist"), { recursive: true });
    await writeFile(join(tempDir, "dist", "index.js"), "");

    const pkg: PackageJson = { name: "test", version: "1.0.0", files: ["dist"] };
    const files = await resolvePackFiles(tempDir, pkg);

    expect(files.some((f) => f.endsWith("README.md"))).toBe(true);
    expect(files.some((f) => f.endsWith("LICENSE"))).toBe(true);
  });

  it("deduplicates files", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");
    await mkdir(join(tempDir, "dist"), { recursive: true });
    await writeFile(join(tempDir, "dist", "index.js"), "");

    // files field includes dist and explicit dist/index.js (overlap)
    const pkg: PackageJson = {
      name: "test",
      version: "1.0.0",
      files: ["dist", "dist/index.js"],
    };
    const files = await resolvePackFiles(tempDir, pkg);
    const unique = new Set(files);
    expect(files.length).toBe(unique.size);
  });

  it("ignores default directories when no files field", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");
    await writeFile(join(tempDir, "index.js"), "");
    await mkdir(join(tempDir, "node_modules", "dep"), { recursive: true });
    await writeFile(join(tempDir, "node_modules", "dep", "x.js"), "");
    await mkdir(join(tempDir, "test"), { recursive: true });
    await writeFile(join(tempDir, "test", "spec.js"), "");
    await mkdir(join(tempDir, ".git"), { recursive: true });
    await writeFile(join(tempDir, ".git", "config"), "");

    const pkg: PackageJson = { name: "test", version: "1.0.0" };
    const files = await resolvePackFiles(tempDir, pkg);
    const rels = files.map((f) => f.slice(tempDir.length + 1).replace(/\\/g, "/"));

    expect(rels).not.toContainEqual(expect.stringContaining("node_modules/"));
    expect(rels).not.toContainEqual(expect.stringContaining("test/"));
    expect(rels).not.toContainEqual(expect.stringContaining(".git/"));
  });

  it("respects .npmignore when no files field", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");
    await writeFile(join(tempDir, "index.js"), "");
    await writeFile(join(tempDir, "secret.js"), "");
    await writeFile(join(tempDir, ".npmignore"), "# Comment\nsecret.js\n");

    const pkg: PackageJson = { name: "test", version: "1.0.0" };
    const files = await resolvePackFiles(tempDir, pkg);

    expect(files.some((f) => f.endsWith("index.js"))).toBe(true);
    expect(files.some((f) => f.endsWith("secret.js"))).toBe(false);
  });

  it("skips non-existent paths in files field", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");

    const pkg: PackageJson = {
      name: "test",
      version: "1.0.0",
      files: ["does-not-exist", "also-missing"],
    };
    const files = await resolvePackFiles(tempDir, pkg);
    // Should still include package.json at minimum
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it("handles files field with single files (not directories)", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");
    await writeFile(join(tempDir, "index.js"), "exports");

    const pkg: PackageJson = {
      name: "test",
      version: "1.0.0",
      files: ["index.js"],
    };
    const files = await resolvePackFiles(tempDir, pkg);
    expect(files.some((f) => f.endsWith("index.js"))).toBe(true);
  });
});
