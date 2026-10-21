import type { Rect } from "./formats";

/** Metrics of the bundled Caveat Medium, in font units. */
export const CAVEAT = { unitsPerEm: 1000, ascender: 960, descender: -300, capHeight: 610, xHeight: 400 };
export const CAPTION_FONT = "Caveat Print";
export const CAPTION_MAX = 48;

export interface CaptionFit {
  /** Font size in mm. */
  size: number;
  /** Baseline, in the card's frame (mm). */
  baseline: number;
  centerX: number;
  /** False when even the smallest size runs past the strip. */
  fits: boolean;
}

/** `measure` returns the text width in mm at a 1 mm font size. */
export function fitCaption(text: string, strip: Rect, measure: (text: string) => number): CaptionFit {
  const base = Math.min(strip.h * 0.42, 8.5);
  const room = strip.w - 2;
  const width = text ? measure(text) : 0;
  const ideal = width > 0 ? room / width : base;
  const size = Math.max(base * 0.55, Math.min(base, ideal));
  // Sit the lowercase letters on the strip's middle, the way people write on instant film.
  const baseline = strip.y + strip.h / 2 + (size * CAVEAT.xHeight) / CAVEAT.unitsPerEm / 2 + size * 0.04;
  return { size, baseline, centerX: strip.x + strip.w / 2, fits: width * size <= room + 0.01 };
}

export function inkFor(frame: string): string {
  return frame === "black" ? "#f3f0ea" : "#26231f";
}
