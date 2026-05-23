import { cookies } from "next/headers";
import { validateSessionToken } from "./sessions";
import { SESSION_COOKIE_NAME } from "./cookies";
import type { Role, User } from "@/db/schema";

export class AuthRequiredError extends Error {
  constructor() {
    super("auth required");
    this.name = "AuthRequiredError";
  }
}

export class PermissionDeniedError extends Error {
  constructor(required: Role, actual: Role) {
    super(`permission denied: requires ${required}, actor is ${actual}`);
    this.name = "PermissionDeniedError";
  }
}

const ROLE_RANK: Record<Role, number> = {
  subscriber: 0,
  contributor: 1,
  author: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

export async function getOptionalUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const { user } = await validateSessionToken(token);
  return user;
}

export async function requireUser(): Promise<User> {
  const u = await getOptionalUser();
  if (!u) throw new AuthRequiredError();
  return u;
}

export async function requireRole(minimum: Role): Promise<User> {
  const u = await requireUser();
  if (ROLE_RANK[u.role] < ROLE_RANK[minimum]) {
    throw new PermissionDeniedError(minimum, u.role);
  }
  return u;
}
