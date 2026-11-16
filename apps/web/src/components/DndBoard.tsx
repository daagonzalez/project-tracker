import { closestCorners, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Board } from "@tracker/shared";
import { ApiError } from "../api/client";
import { useMoveTicket } from "../api/hooks";
import { planMove } from "../board/plan";
import { ColumnView } from "./ColumnView";

type Props = { board: Board; onMoveError: (message: string) => void };

export function DndBoard({ board, onMoveError }: Props) {
  const move = useMoveTicket(board.project.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const dragged = active.rect.current.translated;
    const below = dragged ? dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2 : false;
    const plan = planMove(board, String(active.id), String(over.id), below);
    if (!plan) return;
    const targetName = board.columns.find((c) => c.id === plan.columnId)?.name ?? "that column";
    move.mutate(plan, {
      onError: (error) =>
        onMoveError(
          error instanceof ApiError && error.code === "WIP_LIMIT_EXCEEDED"
            ? `"${targetName}" is at its WIP limit, so the ticket stayed where it was.`
            : "Could not move the ticket. It was put back.",
        ),
    });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {board.columns.map((column) => (
          <ColumnView key={column.id} projectId={board.project.id} column={column} labels={board.labels} members={board.members} />
        ))}
      </div>
    </DndContext>
  );
}
