import { describe, expect, it } from "vitest";
import { buildSessionCookie, clearedSessionCookie, SESSION_COOKIE_NAME } from "./cookies";

describe("session cookie", () => {
  it("name is 'wpk_session'", () => {
    expect(SESSION_COOKIE_NAME).toBe("wpk_session");
  });

  it("buildSessionCookie sets HttpOnly, Secure (prod), SameSite=Lax, Path=/, value", () => {
    const cookie = buildSessionCookie("token-value", new Date("2099-01-01T00:00:00Z"), {
      secure: true,
    });
    expect(cookie.name).toBe("wpk_session");
    expect(cookie.value).toBe("token-value");
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.path).toBe("/");
    expect(cookie.expires?.toISOString()).toBe("2099-01-01T00:00:00.000Z");
  });

  it("omits Secure when secure=false (dev over http)", () => {
    const cookie = buildSessionCookie("t", new Date("2099-01-01"), { secure: false });
    expect(cookie.secure).toBe(false);
  });

  it("clearedSessionCookie has empty value + maxAge 0", () => {
    const cookie = clearedSessionCookie({ secure: true });
    expect(cookie.name).toBe("wpk_session");
    expect(cookie.value).toBe("");
    expect(cookie.maxAge).toBe(0);
  });
});
