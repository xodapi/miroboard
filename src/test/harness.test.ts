import { describe, expect, it } from "vitest";

describe("Vitest harness", () => {
  it("runs a placeholder suite in jsdom", () => {
    expect(window).toBeDefined();
  });
});
