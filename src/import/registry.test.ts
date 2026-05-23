import { describe, expect, it } from "vitest";
import { IMPORTERS } from "./registry";

describe("import registry", () => {
  it("exposes a record entry for every known importer name", () => {
    for (const name of ["wordpress", "ghost", "markdown", "csv"] as const) {
      expect(IMPORTERS[name]).toBeDefined();
      expect(IMPORTERS[name]?.name).toBe(name);
      expect(typeof IMPORTERS[name]?.parse).toBe("function");
    }
  });

  it("flags markdown as bytes content-type, others as text", () => {
    expect(IMPORTERS.markdown.contentType).toBe("bytes");
    expect(IMPORTERS.wordpress.contentType).toBe("text");
    expect(IMPORTERS.ghost.contentType).toBe("text");
    expect(IMPORTERS.csv.contentType).toBe("text");
  });

  it("returns undefined for an unknown importer key", () => {
    // Cast-around to verify runtime behavior of a key not in the union.
    const r = IMPORTERS as unknown as Record<string, unknown>;
    expect(r["nope"]).toBeUndefined();
  });
});
