import { TargetRings } from "@/components/target-rings";
import { columnIcon, columnIconTone } from "@/lib/column-icons";
import type { ClientColumn } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A column's mark, wherever it's shown — its own header, and the sheet's column
 * field.
 *
 * One component rather than two call sites agreeing, because they didn't: the
 * featured column's header draws `TargetRings`, two rings with no centre dot,
 * while `columnIcon` returns Lucide's `Target`, which has one. Picking the glyph
 * in two places meant the field showed a different mark from the column it named.
 *
 * The tone and the stroke come along with the shape, since they carry meaning too
 * — accent for the featured column, emerald and a heavier stroke for done.
 * `className` is for size and placement only.
 */
export function ColumnGlyph({
  column,
  className,
}: {
  column: Pick<ClientColumn, "name" | "isDone" | "isMuted" | "isFocus">;
  className?: string;
}) {
  if (column.isFocus) {
    return <TargetRings className={cn("text-accent", className)} />;
  }

  const Icon = columnIcon(column);
  return (
    <Icon
      aria-hidden
      strokeWidth={column.isDone ? 2.5 : 2}
      className={cn(columnIconTone(column) ?? "text-ink-faint", className)}
    />
  );
}
