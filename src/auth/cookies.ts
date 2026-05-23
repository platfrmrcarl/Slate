export const SESSION_COOKIE_NAME = "wpk_session";

export interface CookieAttrs {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  expires?: Date;
  maxAge?: number;
}

export interface CookieOptions {
  secure: boolean;
}

export function buildSessionCookie(
  token: string,
  expiresAt: Date,
  opts: CookieOptions,
): CookieAttrs {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: opts.secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  };
}

export function clearedSessionCookie(opts: CookieOptions): CookieAttrs {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: opts.secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
}
