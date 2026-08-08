/**
 * How a column makes room for a card being dragged over the board.
 *
 * A sortable list normally opens that room by sliding the card you're hovering
 * out of the way, which is fine when the only thing you can do is drop *between*
 * cards — and fatal here, where you can also drop *into* one. The card you're
 * aiming at is the last thing that should move.
 *
 * So the room is opened from the other side. Given the slot the dragged card
 * currently occupies (`hole`) and the slot a drop would open (`gap`), only the
 * cards *between* the two move: the hole closes and the gap opens in one motion,
 * total height unchanged, and the card the gap is measured from stays put.
 *
 * That last property holds for the near side of a card — the edge you reach first
 * travelling towards it — and for aiming into it, which are the states that have
 * to be aimable. Crossing to the far edge does move it, by which point the
 * pointer sits in the room that opened and the reading is still unambiguous.
 *
 * Indexes count slots in the column's *rendered* order, so a filtered column is
 * measured as it looks. `hole` is null for a column the dragged card isn't in,
 * `gap` for one it wouldn't land in; both null means this column has no part in
 * the drag.
 *
 * @returns how far to move, in whole card-steps: -1 up, 1 down, 0 stay.
 */
export function roomFor(
  index: number,
  hole: number | null,
  gap: number | null,
): -1 | 0 | 1 {
  if (gap === null) {
    // The card is on its way out of this column: everything under the slot it
    // came from closes up over it.
    return hole !== null && index > hole ? -1 : 0;
  }

  if (hole === null) {
    // Arriving from another column, so there's no hole to trade against: the
    // room has to come from pushing everything below the gap down.
    return index >= gap ? 1 : 0;
  }

  // Both in this column — a reorder. Only the run between the two slots moves,
  // and which way depends on which of them is further down.
  if (gap > hole) return index > hole && index < gap ? -1 : 0;
  return index >= gap && index < hole ? 1 : 0;
}

/**
 * The two slots a column cares about mid-drag. Both are indexes into `order`,
 * which is the column's rendered list of card ids.
 */
export type Room = { hole: number | null; gap: number | null };

/**
 * Reads those slots off the drag: where the card sits now, and where the drop
 * would put it. Returns null for a column with no part in the drag, and for the
 * column holding the card a fold-in is aimed at — nothing moves there, because
 * the card being aimed into is the one thing that mustn't.
 */
export function roomInColumn({
  order,
  draggingId,
  target,
}: {
  order: string[];
  draggingId: string | null;
  /** The card a drop is aimed at, and how — null if it's aimed nowhere. */
  target: { id: string; where: "above" | "below" | "into" } | null;
}): Room | null {
  const hole = draggingId ? indexOrNull(order, draggingId) : null;
  const at = target ? indexOrNull(order, target.id) : null;

  if (at !== null && target?.where === "into") return null;
  if (hole === null && at === null) return null;

  const gap =
    at === null ? null : at + (target?.where === "below" ? 1 : 0);
  return { hole, gap };
}

function indexOrNull(order: string[], id: string) {
  const index = order.indexOf(id);
  return index < 0 ? null : index;
}
