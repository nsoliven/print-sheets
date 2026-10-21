import fontUrl from "../assets/fonts/Caveat-Medium.ttf?url";
import { CAPTION_FONT } from "./caption";

/** Load the caption font before measuring or drawing any caption. */
export const captionFontReady: Promise<void> = (async () => {
  try {
    const face = new FontFace(CAPTION_FONT, `url(${fontUrl})`);
    await face.load();
    document.fonts.add(face);
  } catch {
    // Captions fall back to the system's handwriting font.
  }
})();

let ctx: CanvasRenderingContext2D | null = null;
const widths = new Map<string, number>();

/** Width of `text` in mm at a 1 mm font size. */
export function measureCaption(text: string): number {
  const hit = widths.get(text);
  if (hit !== undefined) return hit;
  ctx ??= document.createElement("canvas").getContext("2d")!;
  ctx.font = `100px "${CAPTION_FONT}"`;
  const w = ctx.measureText(text).width / 100;
  if (widths.size > 500) widths.clear();
  widths.set(text, w);
  return w;
}
