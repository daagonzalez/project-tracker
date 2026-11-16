import type { Link } from "@tracker/shared";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { ticketLinks, tickets } from "../../db/schema.js";
import { AppError } from "../../errors.js";

type Row = typeof ticketLinks.$inferSelect;
const toDto = (r: Row): Link => ({ id: r.id, ticketId: r.ticketId, url: r.url, title: r.title });

export async function listLinks(db: Db, ticketId: string): Promise<Link[]> {
  const rows = await db.select().from(ticketLinks).where(eq(ticketLinks.ticketId, ticketId)).orderBy(asc(ticketLinks.createdAt));
  return rows.map(toDto);
}

export async function createLink(db: Db, ticketId: string, input: { url: string; title: string | null }): Promise<Link> {
  const [row] = await db.insert(ticketLinks).values({ ticketId, ...input }).returning();
  return toDto(row!);
}

/** Loads a link plus its project (via its ticket), for authorization. */
export async function getLinkWithProject(db: Db, linkId: string): Promise<{ projectId: string }> {
  const [row] = await db
    .select({ projectId: tickets.projectId })
    .from(ticketLinks)
    .innerJoin(tickets, eq(tickets.id, ticketLinks.ticketId))
    .where(eq(ticketLinks.id, linkId));
  if (!row) throw new AppError("NOT_FOUND", "Link not found");
  return row;
}

export async function deleteLink(db: Db, linkId: string): Promise<void> {
  await db.delete(ticketLinks).where(eq(ticketLinks.id, linkId));
}
