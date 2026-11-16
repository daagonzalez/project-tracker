import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { columns, projects, tickets } from "../src/db/schema.js";
import { makeColumn, makeProject, makeTicket, makeUser } from "./support/factories.js";
import { createTestDb, type TestDb } from "./support/testDb.js";

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.cause?.code ?? e.code;
}

describe("schema", () => {
  let t: TestDb;
  beforeEach(async () => {
    t ??= await createTestDb();
    await t.reset();
  });
  afterAll(async () => {
    await t.close();
  });

  it("rejects ticket points outside the Fibonacci scale", async () => {
    const user = await makeUser(t.db);
    const project = await makeProject(t.db, { ownerId: user.id });
    const column = await makeColumn(t.db, { projectId: project.id });
    const err = await makeTicket(t.db, { projectId: project.id, columnId: column.id, points: 4 }).catch((e) => e);
    expect(pgCode(err)).toBe("23514");
    await expect(
      makeTicket(t.db, { projectId: project.id, columnId: column.id, points: 13 }),
    ).resolves.toMatchObject({ points: 13 });
  });

  it("rejects a WIP limit below 1", async () => {
    const user = await makeUser(t.db);
    const project = await makeProject(t.db, { ownerId: user.id });
    const err = await makeColumn(t.db, { projectId: project.id, wipLimit: 0 }).catch((e) => e);
    expect(pgCode(err)).toBe("23514");
  });

  it("cascades project deletion to columns and tickets", async () => {
    const user = await makeUser(t.db);
    const project = await makeProject(t.db, { ownerId: user.id });
    const column = await makeColumn(t.db, { projectId: project.id });
    await makeTicket(t.db, { projectId: project.id, columnId: column.id });
    await t.db.delete(projects).where(eq(projects.id, project.id));
    expect(await t.db.select().from(columns)).toHaveLength(0);
    expect(await t.db.select().from(tickets)).toHaveLength(0);
  });
});

describe("loadConfig", () => {
  it("throws naming every missing variable", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it("returns typed config with defaults", () => {
    const cfg = loadConfig({ DATABASE_URL: "postgres://x" });
    expect(cfg).toMatchObject({ databaseUrl: "postgres://x", nodeEnv: "development", port: 3000 });
  });
});
