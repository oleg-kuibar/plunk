import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { computeContentHash, hashFile } from "../hash.js";

describe("hashFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "plunk-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns consistent hash for same content", async () => {
    const file = join(tempDir, "test.txt");
    await writeFile(file, "hello world");
    const hash1 = await hashFile(file);
    const hash2 = await hashFile(file);
    expect(hash1).toBe(hash2);
  });

  it("returns different hash for different content", async () => {
    const file1 = join(tempDir, "a.txt");
    const file2 = join(tempDir, "b.txt");
    await writeFile(file1, "hello");
    await writeFile(file2, "world");
    const hash1 = await hashFile(file1);
    const hash2 = await hashFile(file2);
    expect(hash1).not.toBe(hash2);
  });
});

describe("computeContentHash", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "plunk-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns sha256v2-prefixed hash", async () => {
    const file = join(tempDir, "test.txt");
    await writeFile(file, "content");
    const hash = await computeContentHash([file], tempDir);
    expect(hash).toMatch(/^sha256v2:[a-f0-9]{64}$/);
  });

  it("is deterministic regardless of file order", async () => {
    const fileA = join(tempDir, "a.txt");
    const fileB = join(tempDir, "b.txt");
    await writeFile(fileA, "aaa");
    await writeFile(fileB, "bbb");
    const hash1 = await computeContentHash([fileA, fileB], tempDir);
    const hash2 = await computeContentHash([fileB, fileA], tempDir);
    expect(hash1).toBe(hash2);
  });

  it("changes when file content changes", async () => {
    const file = join(tempDir, "test.txt");
    await writeFile(file, "before");
    const hash1 = await computeContentHash([file], tempDir);
    await writeFile(file, "after");
    const hash2 = await computeContentHash([file], tempDir);
    expect(hash1).not.toBe(hash2);
  });
});
