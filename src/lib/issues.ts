import { fitCaption } from "./caption";
import { effectivePpi, sharpness } from "./crop";
import { captionStrip, cropArea, formatOf } from "./formats";
import { measureCaption } from "./fonts";
import { layoutFor } from "./layout";
import { photoStore } from "./photos";
import type { Doc } from "./store";

export interface Issues {
  blurry: string[];
  soft: string[];
  long: string[];
}

/** Prints that would look bad on paper, optionally only on some sheets. */
export function findIssues(doc: Doc, sheets?: number[]): Issues {
  const f = formatOf(doc.format);
  const per = layoutFor(f).slots.length;
  const strip = captionStrip(f);
  const chosen = sheets ? new Set(sheets) : null;
  const out: Issues = { blurry: [], soft: [], long: [] };
  doc.prints.forEach((p, i) => {
    if (chosen && !chosen.has(Math.floor(i / per))) return;
    const ph = photoStore.get(p.photoId);
    if (ph) {
      const q = sharpness(effectivePpi(cropArea(f), ph, p.crop));
      if (q === "blurry") out.blurry.push(p.id);
      if (q === "soft") out.soft.push(p.id);
    }
    const text = p.caption.trim();
    if (strip && text && !fitCaption(text, strip, measureCaption).fits) out.long.push(p.id);
  });
  return out;
}

export function issueCount(i: Issues) {
  return i.blurry.length + i.soft.length + i.long.length;
}

/** The most serious problem, in plain words, and the print to show for it. */
export function worstIssue(i: Issues): { text: string; id: string } | null {
  const n = (ids: string[], one: string, many: string) => (ids.length === 1 ? one : many.replace("#", String(ids.length)));
  if (i.blurry.length) return { text: n(i.blurry, "1 photo will look blurry", "# photos will look blurry"), id: i.blurry[0] };
  if (i.long.length) return { text: n(i.long, "1 caption is too long", "# captions are too long"), id: i.long[0] };
  if (i.soft.length) return { text: n(i.soft, "1 photo may look soft", "# photos may look soft"), id: i.soft[0] };
  return null;
}
