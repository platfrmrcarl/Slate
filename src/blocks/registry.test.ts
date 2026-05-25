import { beforeEach, describe, expect, it } from "vitest";
import { blockRegistry } from "./registry";

beforeEach(() => {
  blockRegistry._reset();
});

describe("blockRegistry", () => {
  it("register + has + get round-trip", () => {
    const def = { type: "custom:foo-widget", render: () => null };
    blockRegistry.register(def);
    expect(blockRegistry.has("custom:foo-widget")).toBe(true);
    expect(blockRegistry.get("custom:foo-widget")).toBe(def);
  });

  it("list returns all registered definitions", () => {
    blockRegistry.register({ type: "a" });
    blockRegistry.register({ type: "b" });
    const types = blockRegistry
      .list()
      .map((d) => d.type)
      .sort();
    expect(types).toEqual(["a", "b"]);
  });

  it("has returns false for unknown types", () => {
    expect(blockRegistry.has("nope")).toBe(false);
    expect(blockRegistry.get("nope")).toBeUndefined();
  });

  it("registering the same type overwrites the previous definition", () => {
    const first = { type: "dup", marker: 1 };
    const second = { type: "dup", marker: 2 };
    blockRegistry.register(first);
    blockRegistry.register(second);
    expect(blockRegistry.get("dup")).toBe(second);
    expect(blockRegistry.list()).toHaveLength(1);
  });

  it("throws when type is empty or not a string", () => {
    expect(() => blockRegistry.register({ type: "" })).toThrow(/non-empty string/);
    expect(() => blockRegistry.register({ type: undefined as unknown as string })).toThrow(
      /non-empty string/,
    );
  });

  it("_reset clears all registered definitions", () => {
    blockRegistry.register({ type: "x" });
    expect(blockRegistry.list()).toHaveLength(1);
    blockRegistry._reset();
    expect(blockRegistry.list()).toHaveLength(0);
  });
});
