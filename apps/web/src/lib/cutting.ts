import type { Piece, Placement, Plan } from "./types";

/** Deterministic first-fit decreasing shelf heuristic. Dimensions are millimetres. */
export function createPlan(
  width: number,
  quantity: number,
  pieces: Piece[],
  allowance = 10,
  shrinkage = 0,
  gap = 3,
): Plan {
  const usableWidth = width - 2 * allowance;
  if (
    !Number.isFinite(width) ||
    width < 100 ||
    width > 5000 ||
    usableWidth <= 0 ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 5000
  )
    throw new Error("Invalid fabric width or garment quantity");
  if (
    !pieces.length ||
    pieces.length > 30 ||
    allowance < 0 ||
    allowance > 100 ||
    gap < 0 ||
    gap > 50 ||
    shrinkage < 0 ||
    shrinkage > 20
  )
    throw new Error("Invalid cutting allowances");
  const expanded: {
    name: string;
    width: number;
    length: number;
    rotate: boolean;
  }[] = [];
  for (const piece of pieces) {
    if (
      !piece.name.trim() ||
      !Number.isInteger(piece.count) ||
      piece.count < 1 ||
      piece.count > 100 ||
      !Number.isFinite(piece.width) ||
      !Number.isFinite(piece.length) ||
      piece.width <= 0 ||
      piece.length <= 0 ||
      piece.width > 10000 ||
      piece.length > 10000
    )
      throw new Error("Enter valid dimensions and counts for every piece");
    if (expanded.length + piece.count * quantity > 20000)
      throw new Error(
        "Plan exceeds 20,000 pieces; split into smaller production batches",
      );
    for (let n = 0; n < piece.count * quantity; n++)
      expanded.push({
        name: piece.name,
        width: Math.ceil(piece.width / (1 - shrinkage / 100)),
        length: Math.ceil(piece.length / (1 - shrinkage / 100)),
        rotate: piece.rotate,
      });
  }
  expanded.sort((a, b) => b.length - a.length || b.width - a.width);
  const shelves: { y: number; length: number; used: number }[] = [];
  const placements: Placement[] = [];
  let length = 0;
  let area = 0;
  for (const p of expanded) {
    const orientations = [
      { width: p.width, length: p.length, rotated: false },
      ...(p.rotate
        ? [{ width: p.length, length: p.width, rotated: true }]
        : []),
    ].filter((o) => o.width <= usableWidth);
    if (!orientations.length)
      throw new Error(
        `${p.name} does not fit the usable fabric width. Check grain direction or dimensions.`,
      );
    let placed = false;
    for (const shelf of shelves) {
      const fitting = orientations
        .filter(
          (o) =>
            o.length <= shelf.length &&
            shelf.used + gap + o.width <= usableWidth,
        )
        .sort((a, b) => a.width - b.width)[0];
      if (fitting) {
        placements.push({
          name: p.name,
          x: allowance + shelf.used + gap,
          y: shelf.y,
          ...fitting,
        });
        shelf.used += gap + fitting.width;
        placed = true;
        break;
      }
    }
    if (!placed) {
      const o = orientations.sort(
        (a, b) => a.length - b.length || a.width - b.width,
      )[0];
      const y = length ? length + gap : 0;
      shelves.push({ y, length: o.length, used: o.width });
      placements.push({ name: p.name, x: allowance, y, ...o });
      length = y + o.length;
    }
    area += p.width * p.length;
  }
  const utilization = Math.round((area / (length * width)) * 1000) / 10;
  return {
    width,
    usableWidth,
    quantity,
    pieces,
    allowance,
    shrinkage,
    gap,
    length,
    utilization,
    waste: Math.round(length * width - area),
    placements,
  };
}
