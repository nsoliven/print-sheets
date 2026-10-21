// How a photo sits in its window. All window measurements are millimetres; photo sizes are pixels.
//
// `zoom` 1 means the photo just covers the window. (cx, cy) is the point of the turned photo,
// as a fraction of its width and height, that sits at the window's centre.

export type Rotation = 0 | 90 | 180 | 270;

export interface Crop {
  rotation: Rotation;
  zoom: number;
  cx: number;
  cy: number;
}

export interface Size {
  w: number;
  h: number;
}

export const DEFAULT_CROP: Crop = { rotation: 0, zoom: 1, cx: 0.5, cy: 0.5 };
export const MAX_ZOOM = 6;

export function turned(img: Size, rotation: Rotation): Size {
  return rotation % 180 ? { w: img.h, h: img.w } : img;
}

/** The smallest zoom, where the whole photo fits inside the window. */
export function minZoom(win: Size, img: Size, rotation: Rotation): number {
  const t = turned(img, rotation);
  return Math.min(win.w / t.w, win.h / t.h) / Math.max(win.w / t.w, win.h / t.h);
}

/** Millimetres per photo pixel. */
export function mmPerPx(win: Size, img: Size, crop: Crop): number {
  const t = turned(img, crop.rotation);
  return Math.max(win.w / t.w, win.h / t.h) * crop.zoom;
}

function clampAxis(c: number, shown: number, win: number): number {
  if (shown <= win) return 0.5;
  const half = win / 2 / shown;
  return Math.min(1 - half, Math.max(half, c));
}

/** Keep the zoom in range and the photo covering the window wherever it can. */
export function clampCrop(crop: Crop, win: Size, img: Size): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(minZoom(win, img, crop.rotation), crop.zoom));
  const t = turned(img, crop.rotation);
  const s = mmPerPx(win, img, { ...crop, zoom });
  return {
    rotation: crop.rotation,
    zoom,
    cx: clampAxis(crop.cx, t.w * s, win.w),
    cy: clampAxis(crop.cy, t.h * s, win.h),
  };
}

/**
 * Where to draw the photo, unturned, before turning it about its own centre.
 * Coordinates are in the window's frame, in mm.
 */
export function photoBox(win: Size, img: Size, crop: Crop) {
  const t = turned(img, crop.rotation);
  const s = mmPerPx(win, img, crop);
  const centerX = win.w / 2 + (0.5 - crop.cx) * t.w * s;
  const centerY = win.h / 2 + (0.5 - crop.cy) * t.h * s;
  const w = img.w * s;
  const h = img.h * s;
  return { x: centerX - w / 2, y: centerY - h / 2, w, h, centerX, centerY, rotation: crop.rotation };
}

export function panBy(crop: Crop, win: Size, img: Size, dxMm: number, dyMm: number): Crop {
  const t = turned(img, crop.rotation);
  const s = mmPerPx(win, img, crop);
  return clampCrop({ ...crop, cx: crop.cx - dxMm / (t.w * s), cy: crop.cy - dyMm / (t.h * s) }, win, img);
}

/** Zoom by `factor`, keeping the photo point under (px, py) in the window where it is. */
export function zoomAt(crop: Crop, win: Size, img: Size, factor: number, px: number, py: number): Crop {
  const t = turned(img, crop.rotation);
  const s0 = mmPerPx(win, img, crop);
  const next = clampCrop({ ...crop, zoom: crop.zoom * factor }, win, img);
  const s1 = mmPerPx(win, img, next);
  const u = crop.cx + (px - win.w / 2) / (t.w * s0);
  const v = crop.cy + (py - win.h / 2) / (t.h * s0);
  return clampCrop({ ...next, cx: u - (px - win.w / 2) / (t.w * s1), cy: v - (py - win.h / 2) / (t.h * s1) }, win, img);
}

export function rotateCrop(crop: Crop, win: Size, img: Size): Crop {
  const rotation = ((crop.rotation + 90) % 360) as Rotation;
  // Turn the centre point with the photo so the same subject stays in view.
  return clampCrop({ rotation, zoom: Math.max(1, crop.zoom), cx: 1 - crop.cy, cy: crop.cx }, win, img);
}

/** Toggle between filling the window and showing the whole photo. */
export function toggleWhole(crop: Crop, win: Size, img: Size): Crop {
  const min = minZoom(win, img, crop.rotation);
  const showingWhole = crop.zoom <= min + 1e-3;
  return clampCrop({ ...crop, zoom: showingWhole ? 1 : min, cx: 0.5, cy: 0.5 }, win, img);
}

/** Photo pixels per printed inch. */
export function effectivePpi(win: Size, img: Size, crop: Crop): number {
  return 25.4 / mmPerPx(win, img, crop);
}

export type Sharpness = "sharp" | "soft" | "blurry";

export function sharpness(ppi: number): Sharpness {
  if (ppi >= 180) return "sharp";
  if (ppi >= 110) return "soft";
  return "blurry";
}
