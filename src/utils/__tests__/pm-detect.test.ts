import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectPackageManager } from "../pm-detect.js";

describe("detectPackageManager", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "plunk-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("detects npm from package-lock.json", async () => {
    await writeFile(join(tempDir, "package-lock.json"), "{}");
    expect(await detectPackageManager(tempDir)).toBe("npm");
  });

  it("detects pnpm from pnpm-lock.yaml", async () => {
    await writeFile(join(tempDir, "pnpm-lock.yaml"), "");
    expect(await detectPackageManager(tempDir)).toBe("pnpm");
  });

  it("detects yarn from yarn.lock", async () => {
    await writeFile(join(tempDir, "yarn.lock"), "");
    expect(await detectPackageManager(tempDir)).toBe("yarn");
  });

  it("detects bun from bun.lockb", async () => {
    await writeFile(join(tempDir, "bun.lockb"), "");
    expect(await detectPackageManager(tempDir)).toBe("bun");
  });

  it("defaults to npm when no lockfile", async () => {
    expect(await detectPackageManager(tempDir)).toBe("npm");
  });

  it("prefers pnpm over npm when both exist", async () => {
    await writeFile(join(tempDir, "pnpm-lock.yaml"), "");
    await writeFile(join(tempDir, "package-lock.json"), "{}");
    expect(await detectPackageManager(tempDir)).toBe("pnpm");
  });
});
