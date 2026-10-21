// The one open document and the edits people can make to it.
import { clampCrop, DEFAULT_CROP, rotateCrop, toggleWhole, type Crop } from "./crop";
import { formatOf, type FormatId } from "./formats";
import { newId } from "./id";
import { importPhoto, looksLikeImage, photoStore, type Photo } from "./photos";
import { createDocStore, EMPTY_DOC, updatePrint, type Doc, type Frame, type PrintItem } from "./store";

export const docStore = createDocStore(EMPTY_DOC);

const win = (doc: Doc) => formatOf(doc.format).window;

function freshCrop(doc: Doc, p: Photo): Crop {
  return clampCrop(DEFAULT_CROP, win(doc), p);
}

export interface AddResult {
  added: number;
  failed: string[];
}

/**
 * Bring photos in. With `replaceId`, the first photo replaces that print's photo and keeps its caption.
 * With `at`, new prints are inserted from that position instead of at the end.
 */
export async function addFiles(files: File[], opts: { replaceId?: string; at?: number } = {}): Promise<AddResult> {
  const images = files.filter(looksLikeImage);
  const failed = files.filter((f) => !looksLikeImage(f)).map((f) => f.name);
  const loaded: Photo[] = [];
  // Decode a few at a time: fast, without holding dozens of full-size photos in memory at once.
  const queue = [...images];
  const results = new Map<File, Photo>();
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        try {
          results.set(file, await importPhoto(file));
        } catch {
          failed.push(file.name);
        }
      }
    }),
  );
  for (const f of images) {
    const p = results.get(f);
    if (p) loaded.push(p);
  }
  if (!loaded.length) return { added: 0, failed };

  docStore.commit(loaded.length === 1 ? "Added a photo" : `Added ${loaded.length} photos`, (doc) => {
    let prints = [...doc.prints];
    let rest = loaded;
    if (opts.replaceId) {
      const first = rest[0];
      rest = rest.slice(1);
      prints = prints.map((p) => (p.id === opts.replaceId ? { ...p, photoId: first.id, crop: freshCrop(doc, first) } : p));
    }
    const fresh: PrintItem[] = rest.map((p) => ({ id: newId(), photoId: p.id, crop: freshCrop(doc, p), caption: "" }));
    const at = Math.min(opts.at ?? prints.length, prints.length);
    prints.splice(at, 0, ...fresh);
    return { ...doc, prints };
  });
  return { added: loaded.length, failed };
}

const photoOf = (doc: Doc, id: string) => {
  const p = doc.prints.find((x) => x.id === id);
  return p ? photoStore.get(p.photoId) : undefined;
};

export const actions = {
  setCrop(id: string, crop: Crop) {
    docStore.live((d) => updatePrint(d, id, { crop }));
  },
  rotate(id: string) {
    docStore.commit("Turned photo", (d) => {
      const p = d.prints.find((x) => x.id === id);
      const ph = photoOf(d, id);
      return p && ph ? updatePrint(d, id, { crop: rotateCrop(p.crop, win(d), ph) }) : d;
    });
  },
  toggleWhole(id: string) {
    docStore.commit("Changed framing", (d) => {
      const p = d.prints.find((x) => x.id === id);
      const ph = photoOf(d, id);
      return p && ph ? updatePrint(d, id, { crop: toggleWhole(p.crop, win(d), ph) }) : d;
    });
  },
  resetCrop(id: string) {
    docStore.commit("Reset framing", (d) => {
      const p = d.prints.find((x) => x.id === id);
      const ph = photoOf(d, id);
      return p && ph ? updatePrint(d, id, { crop: clampCrop({ ...DEFAULT_CROP, rotation: p.crop.rotation }, win(d), ph) }) : d;
    });
  },
  setCaption(id: string, caption: string) {
    docStore.commit("Edited caption", (d) => updatePrint(d, id, { caption }), `caption:${id}`);
  },
  remove(id: string) {
    docStore.commit("Removed print", (d) => ({ ...d, prints: d.prints.filter((p) => p.id !== id) }));
  },
  duplicate(id: string): string | undefined {
    const copyId = newId();
    let made = false;
    docStore.commit("Made a copy", (d) => {
      const i = d.prints.findIndex((p) => p.id === id);
      if (i < 0) return d;
      made = true;
      const prints = [...d.prints];
      prints.splice(i + 1, 0, { ...prints[i], id: copyId });
      return { ...d, prints };
    });
    return made ? copyId : undefined;
  },
  move(id: string, to: number) {
    docStore.commit("Moved print", (d) => {
      const from = d.prints.findIndex((p) => p.id === id);
      if (from < 0 || from === to) return d;
      const prints = [...d.prints];
      const [p] = prints.splice(from, 1);
      prints.splice(Math.max(0, Math.min(prints.length, to)), 0, p);
      return { ...d, prints };
    });
  },
  setFormat(format: FormatId) {
    docStore.commit("Changed size", (d) => {
      if (d.format === format) return d;
      const w = formatOf(format).window;
      // Keep each photo's framing, adjusted to the new window shape.
      const prints = d.prints.map((p) => {
        const ph = photoStore.get(p.photoId);
        return ph ? { ...p, crop: clampCrop(p.crop, w, ph) } : p;
      });
      return { ...d, format, prints };
    });
  },
  setFrame(frame: Frame) {
    docStore.commit("Changed frame", (d) => (d.frame === frame ? d : { ...d, frame }));
  },
  setCutLines(cutLines: boolean) {
    docStore.commit(cutLines ? "Showed cut lines" : "Hid cut lines", (d) => ({ ...d, cutLines }));
  },
  clearAll() {
    docStore.commit("Cleared all prints", (d) => ({ ...d, prints: [] }));
  },
};
