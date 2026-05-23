import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, type Role, type User } from "@/db/schema";
import { emitSafe } from "@/plugins/emit";
import { hashPassword, verifyPassword } from "./passwords";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
  role?: Role;
}

export class EmailInUseError extends Error {
  constructor() {
    super("email already in use");
    this.name = "EmailInUseError";
  }
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const email = normalizeEmail(input.email);
  const existing = await findUserByEmail(email);
  if (existing) throw new EmailInUseError();
  const passwordHash = await hashPassword(input.password);
  const [row] = await db()
    .insert(users)
    .values({
      email,
      passwordHash,
      displayName: input.displayName.trim(),
      role: input.role ?? "subscriber",
    })
    .returning();
  emitSafe("user.created", { userId: row!.id, email: row!.email, role: row!.role });
  return row!;
}

export async function updateRole(userId: string, newRole: Role): Promise<User> {
  const before = await findUserById(userId);
  if (!before) throw new Error(`user not found: ${userId}`);
  const [row] = await db()
    .update(users)
    .set({ role: newRole, updatedAt: sql`now()` })
    .where(eq(users.id, userId))
    .returning();
  if (row && before.role !== newRole) {
    emitSafe("user.roleChanged", {
      userId: row.id,
      oldRole: before.role,
      newRole: row.role,
    });
  }
  return row!;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const e = normalizeEmail(email);
  const rows = await db().select().from(users).where(eq(users.email, e));
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const rows = await db().select().from(users).where(eq(users.id, id));
  return rows[0] ?? null;
}

// A pre-computed argon2id hash of an opaque random string. Used to keep the
// failure path through verifyCredentials in the same time bucket as the
// success path, so an attacker can't probe email existence by measuring
// response latency.
const DUMMY_ARGON2_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$YWFhYWFhYWFhYWFhYWFhYQ$" +
  "GmCAVe3pVqe/9pPHzhTYM6jzcRrAvNo7Hb88e1lxXgU";

export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email);
  // Always run argon2 to flatten timing. If the user doesn't exist we verify
  // against a fixed dummy hash so the failed branch costs the same as a real
  // verify and returns null.
  const hashToVerify = user?.passwordHash ?? DUMMY_ARGON2_HASH;
  const ok = await verifyPassword(hashToVerify, password);
  return user && ok ? user : null;
}

export async function countOwners(): Promise<number> {
  const rows = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, "owner"));
  return rows[0]?.n ?? 0;
}
