import { PDFDocument, PrintScaling, rgb } from "pdf-lib";
import { CAPTION_FONT, CAPTION_MAX, fitCaption, inkFor } from "./caption";
import { photoBox, type Crop } from "./crop";
import { captionStrip, cropArea, formatOf, type Format, type Rect } from "./formats";
import { captionFontReady, measureCaption } from "./fonts";
import { PAGE, layoutFor, slotMatrix, type Sides, type Slot } from "./layout";
import { drawDownscaled, loadImage, releaseImage, type Photo } from "./photos";
import type { Doc, Frame } from "./store";

/** Epson drivers work at 360 pixels per inch, so photos are sent at exactly that. */
export const PRINT_PPI = 360;
/**
 * Captions are drawn by the browser, exactly as on screen (same handwriting alternates, and emoji
 * or symbols the font lacks still appear), at a resolution well past what the printer can resolve.
 */
const CAPTION_PPI = 1200;
const PT = 72 / 25.4;

export const FRAME_COLORS: Record<Frame, string> = { white: "#ffffff", cream: "#f3ecdd", black: "#1b1a19" };

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

/** Which prints land on which sheet. */
export function sheetsOf(doc: Doc): number {
  const per = layoutFor(formatOf(doc.format)).slots.length;
  return Math.max(1, Math.ceil(doc.prints.length / per));
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function toPage(s: Slot, local: Box): Box {
  const [a, b, c, d, e, f] = slotMatrix(s);
  const pts = [
    [local.x, local.y],
    [local.x + local.w, local.y],
    [local.x, local.y + local.h],
    [local.x + local.w, local.y + local.h],
  ].map(([u, v]) => [a * u + c * v + e, b * u + d * v + f]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** A page box in mm (y down) as PDF points (y up). */
const pdfBox = (b: Box) => ({ x: b.x * PT, y: (PAGE.h - b.y - b.h) * PT, width: b.w * PT, height: b.h * PT });

/** Draw one photo window (plus any bleed) at print resolution, turned to match its spot on the sheet. */
async function renderWindow(photo: Photo, crop: Crop, f: Format, bleed: Sides, slot: Slot, fill: string): Promise<Uint8Array> {
  const k = PRINT_PPI / 25.4;
  const ew = f.window.w + bleed.left + bleed.right;
  const eh = f.window.h + bleed.top + bleed.bottom;
  const cw = Math.round(ew * k);
  const ch = Math.round(eh * k);
  const canvas = document.createElement("canvas");
  canvas.width = slot.rotated ? ch : cw;
  canvas.height = slot.rotated ? cw : ch;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (slot.rotated) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  }
  // Pixel rounding is spread evenly so the photo lands exactly on its mm grid.
  ctx.scale(cw / ew, ch / eh);
  ctx.translate(bleed.left, bleed.top);

  const area = cropArea(f);
  ctx.translate(area.x - f.window.x, area.y - f.window.y);
  const box = photoBox(area, photo, crop);
  const img = await loadImage(photo.blob);
  try {
    const outW = Math.max(1, Math.round(box.w * k));
    const outH = Math.max(1, Math.round(box.h * k));
    const src = outW < img.naturalWidth / 2 ? drawDownscaled(img, outW, outH) : img;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(box.centerX, box.centerY);
    ctx.rotate((box.rotation * Math.PI) / 180);
    ctx.drawImage(src, -box.w / 2, -box.h / 2, box.w, box.h);
  } finally {
    releaseImage(img);
  }
  return encode(canvas, "image/jpeg", 0.93);
}

const encode = (canvas: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Uint8Array>((res, rej) =>
    canvas.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a))) : rej(new Error("Could not encode"))), type, q),
  );

/** The caption on a transparent background, covering the strip from edge to edge of the card. */
async function renderCaption(text: string, f: Format, strip: Rect, slot: Slot, ink: string): Promise<{ png: Uint8Array; area: Box }> {
  const k = CAPTION_PPI / 25.4;
  const area = { x: 0, y: strip.y, w: f.w, h: f.h - strip.y };
  const cw = Math.round(area.w * k);
  const ch = Math.round(area.h * k);
  const canvas = document.createElement("canvas");
  canvas.width = slot.rotated ? ch : cw;
  canvas.height = slot.rotated ? cw : ch;
  const ctx = canvas.getContext("2d")!;
  if (slot.rotated) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  }
  const fit = fitCaption(text, strip, measureCaption);
  // Font sizes are set in device pixels rather than by scaling the context, so tiny sizes are never rounded.
  ctx.font = `${fit.size * k}px "${CAPTION_FONT}", "Bradley Hand", cursive`;
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, (fit.centerX - area.x) * k, (fit.baseline - area.y) * k);
  return { png: await encode(canvas, "image/png"), area };
}

export interface ExportOptions {
  doc: Doc;
  /** Zero-based sheet numbers to include. */
  sheets: number[];
  photo: (id: string) => Photo | undefined;
  onProgress?: (done: number, total: number) => void;
}

export async function buildPdf({ doc, sheets, photo, onProgress }: ExportOptions): Promise<Uint8Array> {
  const f = formatOf(doc.format);
  const { slots } = layoutFor(f);
  await captionFontReady;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${f.name} prints`);
  pdf.setCreator("Print Sheets");
  pdf.setProducer("Print Sheets");
  // Ask viewers not to shrink the page to fit. Preview and Acrobat honour this.
  pdf.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);

  const strip = captionStrip(f);
  const ink = inkFor(doc.frame);
  const frameFill = f.kind === "instant" ? FRAME_COLORS[doc.frame] : "#ffffff";
  const total = sheets.reduce((n, s) => n + doc.prints.slice(s * slots.length, (s + 1) * slots.length).length, 0);
  let done = 0;

  for (const s of sheets) {
    const page = pdf.addPage([PAGE.w * PT, PAGE.h * PT]);
    const prints = doc.prints.slice(s * slots.length, (s + 1) * slots.length);
    const used: Slot[] = [];
    for (let i = 0; i < prints.length; i++) {
      const slot = slots[i];
      const p = prints[i];
      const ph = photo(p.photoId);
      used.push(slot);
      if (f.kind === "instant" && doc.frame !== "white") {
        page.drawRectangle({ ...pdfBox({ x: slot.x, y: slot.y, w: slot.w, h: slot.h }), color: hex(frameFill) });
      }
      if (ph) {
        const bleed = slot.bleed;
        const jpg = await pdf.embedJpg(await renderWindow(ph, p.crop, f, bleed, slot, frameFill));
        const local = {
          x: f.window.x - bleed.left,
          y: f.window.y - bleed.top,
          w: f.window.w + bleed.left + bleed.right,
          h: f.window.h + bleed.top + bleed.bottom,
        };
        page.drawImage(jpg, pdfBox(toPage(slot, local)));
      }
      const text = p.caption.trim().slice(0, CAPTION_MAX);
      if (strip && text) {
        const cap = await renderCaption(text, f, strip, slot, ink);
        page.drawImage(await pdf.embedPng(cap.png), pdfBox(toPage(slot, cap.area)));
      }
      onProgress?.(++done, total);
    }
    if (doc.cutLines) {
      const line = doc.frame === "black" && f.kind === "instant" ? rgb(0.45, 0.45, 0.45) : rgb(0.76, 0.76, 0.76);
      for (const slot of used) {
        page.drawRectangle({ ...pdfBox(slot), borderColor: line, borderWidth: 0.3 });
      }
    }
  }
  return pdf.save();
}

export function pdfName(doc: Doc, sheets: number[], count: number): string {
  const f = formatOf(doc.format);
  const which =
    sheets.length === count ? (count > 1 ? `${count} sheets` : "sheet") : `sheet ${sheets.map((s) => s + 1).join(", ")}`;
  return `${f.name} ${which}.pdf`;
}
