import { describe, expect, it } from "vitest";
import { isComplexConfig } from "../vite-config.js";

describe("isComplexConfig", () => {
  it("detects ternaries inside defineConfig without scanning with a broad regex", () => {
    expect(
      isComplexConfig("export default defineConfig({ plugins: condition ? [react()] : [] })")
    ).toEqual({ complex: true, reason: "conditional defineConfig" });
  });

  it("ignores question marks in strings inside defineConfig", () => {
    expect(
      isComplexConfig('export default defineConfig({ server: { proxy: "https://example.test?a=1" } })')
    ).toEqual({ complex: false });
  });
});
