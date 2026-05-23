import { describe, expect, it } from "vitest";
import { chatTools, findTool } from "./tools";

describe("chat tools", () => {
  it("includes list_recent_posts, get_site_settings, suggest_block", () => {
    expect(chatTools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["list_recent_posts", "get_site_settings", "suggest_block"]),
    );
  });

  it("findTool returns undefined for unknown name", () => {
    expect(findTool("nope")).toBeUndefined();
  });

  it("findTool returns the tool by name", () => {
    const t = findTool("suggest_block");
    expect(t).toBeDefined();
    expect(t!.name).toBe("suggest_block");
  });

  it("suggest_block returns a paragraph stub with a fresh id", async () => {
    const t = findTool("suggest_block")!;
    const result = (await t.run({ purpose: "a CTA" })) as {
      id: string;
      type: string;
      markdown?: string;
    };
    expect(result.type).toBe("paragraph");
    expect(result.id).toMatch(/^chat-/);
    expect(result.markdown).toMatch(/a CTA/);
  });
});
