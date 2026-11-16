import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { sessions, users } from "../../db/schema.js";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 12;

export type AuthUser = { id: string; email: string };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });

let dummyHash: Promise<string> | undefined;

/** Creates a user. Only called from the CLI; there is no public sign-up. */
export async function createUser(db: Db, email: string, password: string): Promise<AuthUser> {
  const normalized = email.trim().toLowerCase();
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalized));
  if (existing.length > 0) throw new Error(`A user with email ${normalized} already exists`);
  const [row] = await db
    .insert(users)
    .values({ email: normalized, passwordHash: await hashPassword(password) })
    .returning({ id: users.id, email: users.email });
  return row!;
}

/** Returns the user for valid credentials, otherwise null. Takes the same work for unknown emails. */
export async function verifyCredentials(db: Db, email: string, password: string): Promise<AuthUser | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!row) {
    dummyHash ??= hashPassword("timing-equalisation-dummy");
    await argon2.verify(await dummyHash, password);
    return null;
  }
  const ok = await argon2.verify(row.passwordHash, password).catch(() => false);
  return ok ? { id: row.id, email: row.email } : null;
}

export async function createSession(db: Db, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, csrfToken, expiresAt });
  return { token, csrfToken, expiresAt };
}

export async function findSession(db: Db, token: string): Promise<{ user: AuthUser; csrfToken: string } | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email, csrfToken: sessions.csrfToken })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())));
  return row ? { user: { id: row.id, email: row.email }, csrfToken: row.csrfToken } : null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}
