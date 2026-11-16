import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { projectMembers, projects } from "../db/schema.js";
import { AppError } from "../errors.js";

export type Membership = { isOwner: boolean };

/**
 * Throws NOT_FOUND unless the user is a member of the project, so a project's
 * existence is never revealed to non-members. Call first in every project-scoped handler.
 */
export async function assertMember(db: Db, userId: string, projectId: string): Promise<Membership> {
  const [row] = await db
    .select({ ownerId: projects.ownerId })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  if (!row) throw new AppError("NOT_FOUND", "Project not found");
  return { isOwner: row.ownerId === userId };
}

/** Like assertMember, but a non-owner member gets FORBIDDEN. */
export async function assertOwner(db: Db, userId: string, projectId: string): Promise<void> {
  const { isOwner } = await assertMember(db, userId, projectId);
  if (!isOwner) throw new AppError("FORBIDDEN", "Only the project owner can do this");
}
