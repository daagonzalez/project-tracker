import { randomUUID } from "node:crypto";
import type { Db } from "../../src/db/client.js";
import { columns, labels, projectMembers, projects, tickets, users } from "../../src/db/schema.js";

let seq = 0;
const next = () => ++seq;

export async function makeUser(db: Db, overrides: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await db
    .insert(users)
    .values({ email: `user${next()}-${randomUUID().slice(0, 6)}@example.com`, passwordHash: "x", ...overrides })
    .returning();
  return row!;
}

export async function makeProject(db: Db, opts: { ownerId: string; name?: string }) {
  const [row] = await db
    .insert(projects)
    .values({ name: opts.name ?? `Project ${next()}`, ownerId: opts.ownerId })
    .returning();
  await db.insert(projectMembers).values({ projectId: row!.id, userId: opts.ownerId });
  return row!;
}

export async function makeColumn(
  db: Db,
  opts: { projectId: string; name?: string; position?: string; wipLimit?: number | null },
) {
  const n = next();
  const [row] = await db
    .insert(columns)
    .values({
      projectId: opts.projectId,
      name: opts.name ?? `Column ${n}`,
      position: opts.position ?? `a${String(n).padStart(6, "0")}`,
      wipLimit: opts.wipLimit ?? null,
    })
    .returning();
  return row!;
}

export async function makeTicket(
  db: Db,
  opts: {
    projectId: string;
    columnId: string;
    title?: string;
    position?: string;
    points?: number | null;
    archivedAt?: Date | null;
  },
) {
  const n = next();
  const [row] = await db
    .insert(tickets)
    .values({
      projectId: opts.projectId,
      columnId: opts.columnId,
      title: opts.title ?? `Ticket ${n}`,
      position: opts.position ?? `a${String(n).padStart(6, "0")}`,
      points: opts.points ?? null,
      archivedAt: opts.archivedAt ?? null,
    })
    .returning();
  return row!;
}

export async function addMember(db: Db, projectId: string, userId: string) {
  await db.insert(projectMembers).values({ projectId, userId }).onConflictDoNothing();
}

export async function makeLabel(db: Db, opts: { projectId: string; name?: string; color?: string }) {
  const [row] = await db
    .insert(labels)
    .values({ projectId: opts.projectId, name: opts.name ?? `Label ${next()}`, color: opts.color ?? "#336699" })
    .returning();
  return row!;
}
