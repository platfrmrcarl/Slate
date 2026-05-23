import { describe, expect, it } from "vitest";
import { classifyCommentSpam } from "./spam";

describe("classifyCommentSpam (stub)", () => {
  it("returns 'unknown' when AI is disabled (no key)", async () => {
    const result = await classifyCommentSpam("Buy cheap meds at http://spam.example", {
      authorEmail: "x@y.com",
      authorName: "Bot",
      ipAddress: "1.2.3.4",
    });
    expect(result).toBe("unknown");
  });

  it("returns 'unknown' for empty body without throwing", async () => {
    expect(await classifyCommentSpam("", {})).toBe("unknown");
  });
});
