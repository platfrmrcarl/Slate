import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwords";

describe("hashPassword / verifyPassword", () => {
  it("produces a distinct hash each call", async () => {
    const a = await hashPassword("correct horse battery staple");
    const b = await hashPassword("correct horse battery staple");
    expect(a).not.toBe(b);
    expect(a.startsWith("$argon2id$")).toBe(true);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("hunter2hunter2");
    expect(await verifyPassword(hash, "hunter2hunter2")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("hunter2hunter2");
    expect(await verifyPassword(hash, "hunter2hunter3")).toBe(false);
  });

  it("rejects passwords shorter than 12 chars at hash time", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/at least 12/);
  });

  it("rejects passwords longer than 256 chars (avoid DoS)", async () => {
    await expect(hashPassword("a".repeat(257))).rejects.toThrow(/at most 256/);
  });

  it("treats null/garbage hash inputs as invalid", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
    expect(await verifyPassword("", "anything")).toBe(false);
  });
});
