// Every size is in millimetres, measured on the card held upright.
// `window` is the photo area inside the card. Instant-film sizes leave the wide
// strip under the photo for a caption; photo-print sizes are full bleed.

export type FormatId =
  | "instax-mini"
  | "instax-square"
  | "instax-wide"
  | "polaroid"
  | "polaroid-go"
  | "wallet"
  | "photo-4x6"
  | "photo-8x10";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Format {
  id: FormatId;
  name: string;
  kind: "instant" | "photo";
  blurb: string;
  w: number;
  h: number;
  window: Rect;
  /** Size shown to people, in the unit they'd measure it with. */
  label: string;
}

const instant = (
  id: FormatId,
  name: string,
  blurb: string,
  w: number,
  h: number,
  ww: number,
  wh: number,
  top: number,
  label: string,
): Format => ({
  id,
  name,
  kind: "instant",
  blurb,
  w,
  h,
  window: { x: (w - ww) / 2, y: top, w: ww, h: wh },
  label,
});

const photo = (id: FormatId, name: string, blurb: string, w: number, h: number, label: string): Format => ({
  id,
  name,
  kind: "photo",
  blurb,
  w,
  h,
  window: { x: 0, y: 0, w, h },
  label,
});

export const FORMATS: Format[] = [
  instant("instax-mini", "Instax Mini", "Credit-card size, the classic", 54, 86, 46, 62, 7, "54 × 86 mm"),
  instant("instax-square", "Instax Square", "Square photo, a little wider", 72, 86, 62, 62, 7, "72 × 86 mm"),
  instant("instax-wide", "Instax Wide", "Landscape, good for groups", 108, 86, 99, 62, 7, "108 × 86 mm"),
  instant("polaroid", "Polaroid", "The big square original", 88, 107, 79, 79, 6, "88 × 107 mm"),
  instant("polaroid-go", "Polaroid Go", "A tiny square Polaroid", 53.9, 66.6, 46, 47, 5, "54 × 67 mm"),
  photo("wallet", "Wallet", "Plain photo, fits a wallet", 63.5, 88.9, "2½ × 3½ in"),
  photo("photo-4x6", "4 × 6 photo", "Standard snapshot", 101.6, 152.4, "4 × 6 in"),
  photo("photo-8x10", "8 × 10 photo", "One per sheet, for a picture frame", 203.2, 254, "8 × 10 in"),
];

export const FORMAT_BY_ID = Object.fromEntries(FORMATS.map((f) => [f.id, f])) as Record<FormatId, Format>;

export function formatOf(id: string | undefined): Format {
  return FORMAT_BY_ID[id as FormatId] ?? FORMAT_BY_ID["instax-mini"];
}

/** The caption strip under the photo, or null for full-bleed prints. */
export function captionStrip(f: Format): Rect | null {
  if (f.kind !== "instant") return null;
  const y = f.window.y + f.window.h;
  return { x: f.window.x, y, w: f.window.w, h: f.h - y };
}

/** Full-bleed photos run a little past the cut line so a slightly-off cut still lands on the photo. */
export const BLEED = 1;

/**
 * The area a photo is framed against, in the card's frame. For full-bleed prints this includes the
 * bleed, so the photo always reaches past the cut line instead of stopping exactly on it.
 */
export function cropArea(f: Format): Rect {
  if (f.kind === "instant") return f.window;
  return { x: f.window.x - BLEED, y: f.window.y - BLEED, w: f.window.w + 2 * BLEED, h: f.window.h + 2 * BLEED };
}
