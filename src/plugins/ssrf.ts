import { promises as dns } from "node:dns";
import net from "node:net";

/**
 * Best-effort SSRF guard for outbound webhook delivery. Rejects:
 *   - non-https schemes
 *   - literal loopback / private / link-local / metadata IPs
 *   - hostnames that resolve to any of the above
 *
 * Caveat: this does NOT defend against DNS rebinding mid-request. Node's fetch
 * re-resolves the hostname when it dials, so a hostile resolver could return a
 * public IP at check time and a private IP at fetch time. Mitigating that
 * would require pinning the resolved IP and rewriting the request — out of
 * scope for v1. The guard still raises the bar considerably and blocks the
 * common "subscribe to http://169.254.169.254/" attacks.
 */
export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

export async function assertUrlSafeForOutboundFetch(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("invalid URL");
  }
  if (url.protocol !== "https:") {
    throw new SsrfError(`scheme not allowed: ${url.protocol}`);
  }

  // Reject literal blocked IPs in the hostname (skipping DNS).
  if (net.isIP(url.hostname)) {
    if (isBlockedIp(url.hostname)) {
      throw new SsrfError(`blocked IP: ${url.hostname}`);
    }
    return;
  }

  // Resolve all A / AAAA records and reject if ANY resolves into a blocked range.
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await dns.lookup(url.hostname, { all: true });
  } catch {
    // If we can't resolve, fail closed.
    throw new SsrfError(`cannot resolve host: ${url.hostname}`);
  }
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new SsrfError(`host resolves to blocked IP: ${a.address}`);
    }
  }
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
