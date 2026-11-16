# Project Tracker

A simple, Kanban-focused project management tool for tracking work across multiple projects.

## Language

**Project**:
A self-contained body of work with exactly one board, its own columns, labels and tickets. The board is the project's view, not a separate thing.
_Avoid_: Board (as a separate entity), workspace

**User**:
A person with an account who can be a member of projects and be assigned tickets. Accounts are created by an admin; there is no public sign-up.
_Avoid_: Account, member (unless meaning project membership)

**Owner**:
The user who created a project. Only the owner can delete the project or manage its members.
_Avoid_: Admin (reserved for the system-level user who creates accounts)

**Member**:
A user who belongs to a project and can do everything inside it except delete it or manage membership. Non-members cannot see the project.
_Avoid_: Collaborator, participant

**Column**:
A named stage of a project's workflow that holds tickets, defined per project, with an optional WIP limit.
_Avoid_: Lane, status, list

**WIP limit**:
The maximum number of tickets a column may hold. It is a hard limit: a move that would exceed it is rejected.
_Avoid_: Cap, soft limit

**Ticket**:
A unit of work on a project's board, with a description, comments, labels, optional story points and links.
_Avoid_: Card, issue, task

**Label**:
A coloured tag defined per project and applied to that project's tickets.
_Avoid_: Tag, category

**Story points**:
An optional size estimate on a ticket, drawn from the scale 1, 2, 3, 5, 8, 13. A column shows the sum of its tickets' points.
_Avoid_: Estimate, size

**Link**:
A manually entered URL, with an optional title, attached to a ticket (typically a pull request). It is never synced with the external service.
_Avoid_: Attachment, integration

**Comment**:
A note written by a user on a ticket. Only its author can edit or delete it.
_Avoid_: Reply, note

**Archive**:
To hide a ticket from the board while keeping it restorable. Tickets are archived, never hard-deleted.
_Avoid_: Delete, close

**Ticket event**:
A recorded change to a ticket (moved, label added, points changed, assignee changed), shown in its history alongside comments.
_Avoid_: Audit entry, activity
