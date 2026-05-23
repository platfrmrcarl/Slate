import https from "node:https";
import { resolveSafeIp, SsrfError } from "./ssrf";

export interface SafeFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Hard timeout for the entire request in milliseconds. Default 15s. */
  timeoutMs?: number;
}

export interface SafeFetchResponse {
  status: number;
  headers: Record<string, string>;
  text: () => Promise<string>;
}

/**
 * Outbound HTTPS request that defends against DNS rebinding: the hostname is
 * resolved once via `resolveSafeIp` (which rejects private / loopback /
 * link-local / metadata IPs), and the resulting IP is pinned for the actual
 * socket connect via `https.request`'s `lookup` option. TLS still validates
 * against the original hostname (SNI), so the cert chain is unaffected.
 *
 * A second resolver call between check and connect cannot redirect the dial
 * because the `lookup` override never re-consults the system resolver.
 */
export async function safeFetch(
  rawUrl: string,
  init: SafeFetchInit = {},
): Promise<SafeFetchResponse> {
  const { url, ip, family } = await resolveSafeIp(rawUrl);
  const timeoutMs = init.timeoutMs ?? 15_000;

  return await new Promise<SafeFetchResponse>((resolve, reject) => {
    // Merge in Host header so the upstream sees the real hostname, not the IP.
    const headers: Record<string, string> = {
      ...(init.headers ?? {}),
      host: url.host,
    };
    if (init.body !== undefined && headers["content-length"] === undefined) {
      headers["content-length"] = String(Buffer.byteLength(init.body));
    }
    const port = url.port ? Number(url.port) : 443;

    const req = https.request(
      {
        hostname: url.hostname,
        port,
        path: `${url.pathname}${url.search}`,
        method: init.method ?? "GET",
        headers,
        servername: url.hostname, // SNI = hostname; cert validates against this
        lookup(_hostname, _options, callback) {
          // Pinned — ignore the system resolver entirely from here on.
          callback(null, ip, family);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const responseHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) responseHeaders[k] = v.join(", ");
            else if (typeof v === "string") responseHeaders[k] = v;
          }
          resolve({
            status: res.statusCode ?? 0,
            headers: responseHeaders,
            text: async () => buf.toString("utf8"),
          });
        });
        res.on("error", (err) => reject(err));
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new SsrfError(`request timed out after ${timeoutMs}ms`));
    });
    req.on("error", (err) => reject(err));
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}
