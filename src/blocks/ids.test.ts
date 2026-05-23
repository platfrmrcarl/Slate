import { describe, expect, it } from "vitest";
import { generateBlockId } from "./ids";

// The block schema (src/blocks/types.ts) requires `id` to be 8..64 chars.
// The generator emits 10 chars from a URL-safe alphabet — verify that here
// so a future schema/regex change doesn't silently break id generation.
const ID_RE = /^[abcdefghijkmnpqrstuvwxyz23456789]{10}$/;

describe("generateBlockId", () => {
  it("matches the block-id format expected by the schema", () => {
    const id = generateBlockId();
    expect(id).toMatch(ID_RE);
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(id.length).toBeLessThanOrEqual(64);
  });

  it("produces unique IDs across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateBlockId());
    expect(seen.size).toBe(500);
  });
});
