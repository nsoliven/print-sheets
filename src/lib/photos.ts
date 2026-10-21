import { newId } from "./id";

export interface Photo {
  id: string;
  name: string;
  /** Size of the original, already turned the way the camera meant it. */
  w: number;
  h: number;
  /** The original file. Exports always draw from this. */
  blob: Blob;
  /** A smaller copy for the screen. */
  preview: Blob;
  url: string;
}

const PREVIEW_EDGE = 2048;

type Listener = () => void;
const photos = new Map<string, Photo>();
const listeners = new Set<Listener>();
let version = 0;

export const photoStore = {
  subscribe(l: Listener) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  version: () => version,
  get: (id: string) => photos.get(id),
  all: () => [...photos.values()],
  add(p: Photo) {
    photos.set(p.id, p);
    version++;
    listeners.forEach((l) => l());
  },
};

/** Browsers turn photos upright from their EXIF data when loading them into an <img>. */
export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  return img;
}

export function releaseImage(img: HTMLImageElement) {
  URL.revokeObjectURL(img.src);
}

/** Shrink in halving steps so large photos stay crisp instead of shimmering. */
export function drawDownscaled(
  img: CanvasImageSource & { width: number; height: number },
  w: number,
  h: number,
): HTMLCanvasElement {
  let src: CanvasImageSource = img;
  let sw = img.width;
  let sh = img.height;
  while (sw / 2 >= w && sh / 2 >= h) {
    const c = document.createElement("canvas");
    c.width = Math.round(sw / 2);
    c.height = Math.round(sh / 2);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, c.width, c.height);
    src = c;
    sw = c.width;
    sh = c.height;
  }
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return out;
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), type, q));

export async function importPhoto(file: File): Promise<Photo> {
  const img = await loadImage(file);
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error("empty image");
    const k = Math.min(1, PREVIEW_EDGE / Math.max(w, h));
    const preview = k < 1 ? await toBlob(drawDownscaled(img, Math.round(w * k), Math.round(h * k)), "image/jpeg", 0.88) : file;
    const p: Photo = { id: newId(), name: file.name, w, h, blob: file, preview, url: URL.createObjectURL(preview) };
    photoStore.add(p);
    return p;
  } finally {
    releaseImage(img);
  }
}

export function restorePhoto(rec: Omit<Photo, "url">) {
  photoStore.add({ ...rec, url: URL.createObjectURL(rec.preview) });
}

export function looksLikeImage(f: File) {
  return f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|avif|gif|tiff?)$/i.test(f.name);
}
