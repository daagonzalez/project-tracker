import type { Member, Project } from "@tracker/shared";
import { and, asc, eq } from "drizzle-orm";
import { generateNKeysBetween } from "fractional-indexing";
import type { Db } from "../../db/client.js";
import { columns, projectMembers, projects, users } from "../../db/schema.js";
import { AppError } from "../../errors.js";

const DEFAULT_COLUMNS = ["To Do", "In Progress", "Done"];

type ProjectRow = typeof projects.$inferSelect;

export const toProjectDto = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  ownerId: row.ownerId,
  createdAt: row.createdAt.toISOString(),
});

export async function listProjects(db: Db, userId: string): Promise<Project[]> {
  const rows = await db
    .select({ project: projects })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.userId, userId))
    .orderBy(asc(projects.createdAt));
  return rows.map((r) => toProjectDto(r.project));
}

export async function createProject(db: Db, ownerId: string, name: string): Promise<Project> {
  return db.transaction(async (tx) => {
    const [project] = await tx.insert(projects).values({ name, ownerId }).returning();
    await tx.insert(projectMembers).values({ projectId: project!.id, userId: ownerId });
    const positions = generateNKeysBetween(null, null, DEFAULT_COLUMNS.length);
    await tx
      .insert(columns)
      .values(DEFAULT_COLUMNS.map((columnName, i) => ({ projectId: project!.id, name: columnName, position: positions[i]! })));
    return toProjectDto(project!);
  });
}

export async function getProject(db: Db, projectId: string): Promise<Project> {
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!row) throw new AppError("NOT_FOUND", "Project not found");
  return toProjectDto(row);
}

export async function renameProject(db: Db, projectId: string, name: string): Promise<Project> {
  const [row] = await db.update(projects).set({ name }).where(eq(projects.id, projectId)).returning();
  if (!row) throw new AppError("NOT_FOUND", "Project not found");
  return toProjectDto(row);
}

export async function deleteProject(db: Db, projectId: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, projectId));
}

export async function listMembers(db: Db, projectId: string): Promise<Member[]> {
  const rows = await db
    .select({ id: users.id, email: users.email, ownerId: projects.ownerId })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(users.email));
  return rows.map((r) => ({ id: r.id, email: r.email, isOwner: r.id === r.ownerId }));
}

export async function addMember(db: Db, projectId: string, email: string): Promise<Member> {
  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email));
  if (!user) throw new AppError("NOT_FOUND", "No user with that email");
  await db.insert(projectMembers).values({ projectId, userId: user.id }).onConflictDoNothing();
  return { id: user.id, email: user.email, isOwner: false };
}

export async function removeMember(db: Db, projectId: string, userId: string): Promise<void> {
  const [project] = await db.select({ ownerId: projects.ownerId }).from(projects).where(eq(projects.id, projectId));
  if (project?.ownerId === userId) throw new AppError("VALIDATION", "The project owner cannot be removed");
  const removed = await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .returning();
  if (removed.length === 0) throw new AppError("NOT_FOUND", "Member not found");
}
