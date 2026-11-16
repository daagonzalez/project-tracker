import type { Comment } from "@tracker/shared";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { comments, tickets, users } from "../../db/schema.js";
import { AppError } from "../../errors.js";

const commentSelect = {
  id: comments.id,
  ticketId: comments.ticketId,
  authorId: comments.authorId,
  authorEmail: users.email,
  body: comments.body,
  createdAt: comments.createdAt,
  updatedAt: comments.updatedAt,
};

type Row = {
  id: string;
  ticketId: string;
  authorId: string;
  authorEmail: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

const toDto = (r: Row): Comment => ({
  id: r.id,
  ticketId: r.ticketId,
  author: { id: r.authorId, email: r.authorEmail },
  body: r.body,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export async function listComments(db: Db, ticketId: string): Promise<Comment[]> {
  const rows = await db
    .select(commentSelect)
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.ticketId, ticketId))
    .orderBy(asc(comments.createdAt), asc(comments.id));
  return rows.map(toDto);
}

async function getCommentDto(db: Db, commentId: string): Promise<Comment> {
  const [row] = await db
    .select(commentSelect)
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.id, commentId));
  if (!row) throw new AppError("NOT_FOUND", "Comment not found");
  return toDto(row);
}

/** Loads a comment plus the project it belongs to (via its ticket), for authorization. */
export async function getCommentWithProject(db: Db, commentId: string): Promise<{ comment: Comment; projectId: string }> {
  const [row] = await db
    .select({ projectId: tickets.projectId })
    .from(comments)
    .innerJoin(tickets, eq(tickets.id, comments.ticketId))
    .where(eq(comments.id, commentId));
  if (!row) throw new AppError("NOT_FOUND", "Comment not found");
  return { comment: await getCommentDto(db, commentId), projectId: row.projectId };
}

export async function createComment(db: Db, ticketId: string, authorId: string, body: string): Promise<Comment> {
  const [row] = await db.insert(comments).values({ ticketId, authorId, body }).returning({ id: comments.id });
  return getCommentDto(db, row!.id);
}

export async function updateComment(db: Db, commentId: string, body: string): Promise<Comment> {
  await db.update(comments).set({ body, updatedAt: new Date() }).where(eq(comments.id, commentId));
  return getCommentDto(db, commentId);
}

export async function deleteComment(db: Db, commentId: string): Promise<void> {
  await db.delete(comments).where(eq(comments.id, commentId));
}
