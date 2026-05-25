import { describe, expect, it, vi } from "vitest";
import { assertUrlSafeForOutboundFetch, isBlockedIp, SsrfError } from "./ssrf";

vi.mock("node:dns", () => ({
  promises: {
    lookup: async (host: string) => {
      switch (host) {
        case "metadata.google.internal":
          return [{ address: "169.254.169.254", family: 4 }];
        case "internal.corp":
          return [{ address: "10.0.0.5", family: 4 }];
        case "rogue.example.com":
          return [
            { address: "203.0.113.10", family: 4 },
            { address: "127.0.0.1", family: 4 },
          ];
        case "ok.example.com":
          return [{ address: "203.0.113.42", family: 4 }];
        case "nx.example":
          throw new Error("ENOTFOUND");
        default:
          return [{ address: "203.0.113.7", family: 4 }];
      }
    },
  },
}));

describe("isBlockedIp", () => {
  it("blocks loopback / private / link-local / metadata", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.5.5",
      "172.31.0.1",
      "192.168.0.1",
      "169.254.169.254", // GCP/AWS metadata
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "fe80::1",
      "fc00::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });
  it("allows public IPs", () => {
    for (const ip of ["8.8.8.8", "203.0.113.1", "172.32.0.1", "2001:db8::1"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });
});

describe("assertUrlSafeForOutboundFetch", () => {
  it("allows a public https URL", async () => {
    await expect(
      assertUrlSafeForOutboundFetch("https://ok.example.com/hook"),
    ).resolves.toBeUndefined();
  });
  it("rejects http://", async () => {
    await expect(
      assertUrlSafeForOutboundFetch("http://ok.example.com/hook"),
    ).rejects.toBeInstanceOf(SsrfError);
  });
  it("rejects literal private IP", async () => {
    await expect(assertUrlSafeForOutboundFetch("https://10.0.0.5/x")).rejects.toBeInstanceOf(
      SsrfError,
    );
  });
  it("rejects cloud-metadata hostname after DNS resolve", async () => {
    await expect(
      assertUrlSafeForOutboundFetch("https://metadata.google.internal/computeMetadata/v1/"),
    ).rejects.toThrow(/169\.254\.169\.254/);
  });
  it("rejects hostname that resolves to a mix of public + loopback", async () => {
    await expect(
      assertUrlSafeForOutboundFetch("https://rogue.example.com/hook"),
    ).rejects.toBeInstanceOf(SsrfError);
  });
  it("rejects unresolvable hostnames (fail closed)", async () => {
    await expect(assertUrlSafeForOutboundFetch("https://nx.example/hook")).rejects.toBeInstanceOf(
      SsrfError,
    );
  });
});
