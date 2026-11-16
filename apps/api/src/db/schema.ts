import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(), // stored lowercased by the service layer
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // SHA-256 of the session token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  csrfToken: text("csrf_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const projects = pgTable("projects", {
  id: id(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

export const columns = pgTable(
  "columns",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: text("position").notNull(),
    wipLimit: integer("wip_limit"),
  },
  (t) => [check("columns_wip_limit_positive", sql`${t.wipLimit} IS NULL OR ${t.wipLimit} >= 1`)],
);

export const labels = pgTable("labels", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
});

export const tickets = pgTable(
  "tickets",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    columnId: uuid("column_id").notNull().references(() => columns.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    points: integer("points"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    position: text("position").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("tickets_points_scale", sql`${t.points} IS NULL OR ${t.points} IN (1, 2, 3, 5, 8, 13)`),
    index("tickets_column_idx").on(t.columnId),
  ],
);

export const ticketLabels = pgTable(
  "ticket_labels",
  {
    ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
    labelId: uuid("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.labelId] })],
);

export const ticketLinks = pgTable("ticket_links", {
  id: id(),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title"),
});

export const comments = pgTable("comments", {
  id: id(),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ticketEvents = pgTable("ticket_events", {
  id: id(),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  data: jsonb("data").notNull().default({}),
  // clock_timestamp() (not now()) so events written in one transaction still order correctly
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
});
