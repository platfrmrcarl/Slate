import { promises as dns } from "node:dns";
import net from "node:net";

/**
 * SSRF guard for outbound webhook delivery. Rejects:
 *   - non-https schemes
 *   - literal loopback / private / link-local / metadata IPs
 *   - hostnames that resolve to any of the above
 *
 * `resolveSafeIp` returns a single safe IP that callers should pin for the
 * subsequent connect (see `safeFetch`) — pinning closes the DNS-rebinding
 * window where a hostile resolver could return a public IP at check time
 * and a private IP at fetch time.
 */
export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

export async function assertUrlSafeForOutboundFetch(rawUrl: string): Promise<void> {
  await resolveSafeIp(rawUrl);
}

export interface ResolvedSafe {
  url: URL;
  ip: string;
  family: 4 | 6;
}

/**
 * Validates the URL + resolves DNS + returns one safe IP from the resolved
 * set. Callers must pin this IP for the subsequent socket connect so a
 * hostile resolver can't rebind to a private IP between check and fetch.
 */
export async function resolveSafeIp(rawUrl: string): Promise<ResolvedSafe> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("invalid URL");
  }
  if (url.protocol !== "https:") {
    throw new SsrfError(`scheme not allowed: ${url.protocol}`);
  }

  // Literal IP in the hostname — no DNS round-trip, no rebind window.
  const literalFamily = net.isIP(url.hostname);
  if (literalFamily) {
    if (isBlockedIp(url.hostname)) {
      throw new SsrfError(`blocked IP: ${url.hostname}`);
    }
    return { url, ip: url.hostname, family: literalFamily === 4 ? 4 : 6 };
  }

  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new SsrfError(`cannot resolve host: ${url.hostname}`);
  }
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new SsrfError(`host resolves to blocked IP: ${a.address}`);
    }
  }
  const first = addrs[0];
  if (!first) throw new SsrfError(`no addresses for host: ${url.hostname}`);
  return { url, ip: first.address, family: first.family === 6 ? 6 : 4 };
}

/**
 * True if the given IPv4 or IPv6 literal falls inside any range that must
 * never be reachable from outbound webhook traffic.
 */
export function isBlockedIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return isBlockedIpv4(ip);
  if (v === 6) return isBlockedIpv6(ip);
  return false;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((s) => Number(s));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // malformed → block
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true; // unspecified + loopback
  if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true; // link-local
  if (lower.startsWith("fec0:")) return true; // deprecated site-local
  // fc00::/7 (unique local) → first byte 0xfc or 0xfd
  if (/^fc[0-9a-f]{2}:/.test(lower) || /^fd[0-9a-f]{2}:/.test(lower)) return true;
  if (lower.startsWith("ff")) return true; // multicast
  // IPv4-mapped: ::ffff:a.b.c.d — defer to v4 check
  const mapped = lower.match(/^::ffff:([0-9.]+)$/);
  if (mapped && mapped[1]) return isBlockedIpv4(mapped[1]);
  return false;
}
