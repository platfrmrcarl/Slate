import { describe, expect, it } from "vitest";
import { renderEmail } from "./render";
import { PasswordResetEmail } from "./PasswordResetEmail";

describe("renderEmail", () => {
  it("returns html + text for a React Email template", async () => {
    const out = await renderEmail(
      <PasswordResetEmail
        resetUrl="https://example.com/reset?token=abc"
        displayName="Test User"
      />,
    );
    expect(out.html).toContain("reset?token=abc");
    expect(out.html).toContain("Test User");
    expect(out.text).toContain("https://example.com/reset?token=abc");
  });
});
