import { BLEED, type Format } from "./formats";

/** US Letter, in millimetres. */
export const PAGE = { w: 215.9, h: 279.4 };
/** The ET-2850 can't print closer than 3 mm to the edge; keep half a millimetre spare for feed skew. */
export const MIN_MARGIN = 3.5;
const PRINTABLE_EDGE = 3;
const EPS = 1e-6;

export interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** One card's spot on the page. `rotated` cards are turned a quarter turn clockwise. */
export interface Slot {
  x: number;
  y: number;
  /** Size of the spot on the page (swapped from the card's size when rotated). */
  w: number;
  h: number;
  rotated: boolean;
  /** How far the photo may run past each card edge, in the card's own upright frame. */
  bleed: Sides;
}

export interface SheetLayout {
  slots: Slot[];
  gap: number;
  /** How many separate blocks of same-direction cards. 1 means a plain grid. */
  groups: number;
}

interface Pack {
  items: { x: number; y: number; rotated: boolean }[];
  groups: number;
}

function grid(W: number, H: number, cw: number, ch: number, gap: number, rotated: boolean): Pack {
  const cols = Math.floor((W + gap) / (cw + gap) + EPS);
  const rows = Math.floor((H + gap) / (ch + gap) + EPS);
  const items = [];
  if (cols > 0 && rows > 0) {
    // Centre the grid in its region so neighbouring blocks line up evenly.
    const ox = (W - (cols * cw + (cols - 1) * gap)) / 2;
    const oy = (H - (rows * ch + (rows - 1) * gap)) / 2;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) items.push({ x: ox + c * (cw + gap), y: oy + r * (ch + gap), rotated });
  }
  return { items, groups: items.length ? 1 : 0 };
}

const upright = (p: Pack) => p.items.filter((i) => !i.rotated).length;

function better(a: Pack, b: Pack): Pack {
  if (a.items.length !== b.items.length) return a.items.length > b.items.length ? a : b;
  if (a.groups !== b.groups) return a.groups < b.groups ? a : b;
  return upright(a) >= upright(b) ? a : b;
}

/**
 * Guillotine packing: a block of same-direction cards, and the rest of the region packed
 * the same way. Every cut runs straight across whatever piece you're holding, so a paper
 * trimmer or scissors never has to stop partway.
 */
function pack(W: number, H: number, w: number, h: number, gap: number, depth: number): Pack {
  let best = better(grid(W, H, w, h, gap, false), grid(W, H, h, w, gap, true));
  if (depth === 0) return best;
  for (const rotated of [false, true]) {
    const cw = rotated ? h : w;
    const ch = rotated ? w : h;
    for (let k = 1; k * cw + (k - 1) * gap < W; k++) {
      const used = k * cw + (k - 1) * gap;
      const a = grid(used, H, cw, ch, gap, rotated);
      const b = pack(W - used - gap, H, w, h, gap, depth - 1);
      const shifted = b.items.map((i) => ({ ...i, x: i.x + used + gap }));
      best = better(best, { items: [...a.items, ...shifted], groups: a.groups + b.groups });
    }
    for (let k = 1; k * ch + (k - 1) * gap < H; k++) {
      const used = k * ch + (k - 1) * gap;
      const a = grid(W, used, cw, ch, gap, rotated);
      const b = pack(W, H - used - gap, w, h, gap, depth - 1);
      const shifted = b.items.map((i) => ({ ...i, y: i.y + used + gap }));
      best = better(best, { items: [...a.items, ...shifted], groups: a.groups + b.groups });
    }
  }
  return best;
}

const cache = new Map<string, SheetLayout>();

export function layoutFor(f: Format): SheetLayout {
  const hit = cache.get(f.id);
  if (hit) return hit;

  // Instant-film cards share their white edges, so one cut separates two cards.
  // Full-bleed photos get a small gap the photo runs into, so a slightly-off cut still looks clean.
  const gap = f.kind === "photo" ? 2 * BLEED : 0;
  const W = PAGE.w - 2 * MIN_MARGIN;
  const H = PAGE.h - 2 * MIN_MARGIN;
  const p = pack(W, H, f.w, f.h, gap, 2);

  const boxes = p.items.map((i) => ({ ...i, w: i.rotated ? f.h : f.w, h: i.rotated ? f.w : f.h }));
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  const dx = (PAGE.w - (maxX - minX)) / 2 - minX;
  const dy = (PAGE.h - (maxY - minY)) / 2 - minY;

  const slots: Slot[] = boxes.map((b) => {
    const x = b.x + dx;
    const y = b.y + dy;
    const page = {
      left: x - PRINTABLE_EDGE,
      top: y - PRINTABLE_EDGE,
      right: PAGE.w - PRINTABLE_EDGE - (x + b.w),
      bottom: PAGE.h - PRINTABLE_EDGE - (y + b.h),
    };
    const lim = (room: number) => (f.kind === "photo" ? Math.max(0, Math.min(BLEED, room)) : 0);
    // A clockwise quarter turn puts the card's top on the page's right, its left on the page's top.
    const bleed: Sides = b.rotated
      ? { top: lim(page.right), right: lim(page.bottom), bottom: lim(page.left), left: lim(page.top) }
      : { top: lim(page.top), right: lim(page.right), bottom: lim(page.bottom), left: lim(page.left) };
    return { x, y, w: b.w, h: b.h, rotated: b.rotated, bleed };
  });

  const result = { slots, gap, groups: p.groups };
  cache.set(f.id, result);
  return result;
}

/** SVG/PDF-style transform from the card's upright frame (mm) onto the page (mm). */
export function slotMatrix(s: Slot): [number, number, number, number, number, number] {
  // (u, v) -> (a*u + c*v + e, b*u + d*v + f)
  return s.rotated ? [0, 1, -1, 0, s.x + s.w, s.y] : [1, 0, 0, 1, s.x, s.y];
}
