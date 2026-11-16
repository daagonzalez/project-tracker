import type { Board, BoardColumn, Label, Member, Project, SessionResponse, Ticket, User } from "@tracker/shared";

let n = 0;
/** Deterministic, valid UUIDs for fixtures. */
export const uid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const now = "2026-01-01T00:00:00.000Z";

export const fixtures = {
  user(overrides: Partial<User> = {}): User {
    return { id: uid(), email: "ann@example.com", ...overrides };
  },
  session(overrides: Partial<SessionResponse> = {}): SessionResponse {
    return { user: fixtures.user(), csrfToken: "csrf-token-1", ...overrides };
  },
  project(overrides: Partial<Project> = {}): Project {
    return { id: uid(), name: "Website", ownerId: uid(), createdAt: now, ...overrides };
  },
  member(overrides: Partial<Member> = {}): Member {
    return { id: uid(), email: "ann@example.com", isOwner: false, ...overrides };
  },
  label(overrides: Partial<Label> = {}): Label {
    return { id: uid(), projectId: uid(), name: "bug", color: "#cc3333", ...overrides };
  },
  ticket(overrides: Partial<Ticket> = {}): Ticket {
    return {
      id: uid(),
      projectId: uid(),
      columnId: uid(),
      title: "A ticket",
      description: "",
      points: null,
      assigneeId: null,
      position: "a0",
      labelIds: [],
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  },
  column(overrides: Partial<BoardColumn> = {}): BoardColumn {
    const tickets = overrides.tickets ?? [];
    return {
      id: uid(),
      projectId: uid(),
      name: "To Do",
      position: "a0",
      wipLimit: null,
      ticketCount: tickets.length,
      pointsTotal: tickets.reduce((s, t) => s + (t.points ?? 0), 0),
      tickets,
      ...overrides,
    };
  },
  board(overrides: Partial<Board> = {}): Board {
    return { project: fixtures.project(), columns: [], labels: [], members: [], ...overrides };
  },
};
