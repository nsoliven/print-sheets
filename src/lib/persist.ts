// Keeps the current session in this browser's own storage, so closing the tab loses nothing.
// Nothing here talks to the network.
import type { Photo } from "./photos";
import type { Doc } from "./store";

const DB = "print-sheets";
const VERSION = 1;

type StoredPhoto = Omit<Photo, "url">;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("photos", { keyPath: "id" });
      req.result.createObjectStore("meta");
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

let dbp: Promise<IDBDatabase> | null = null;
const db = () => (dbp ??= open());

function done(tx: IDBTransaction) {
  return new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = tx.onabort = () => rej(tx.error);
  });
}

function request<T>(r: IDBRequest<T>) {
  return new Promise<T>((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function loadSession(): Promise<{ doc: Doc; photos: StoredPhoto[] } | null> {
  try {
    const d = await db();
    const tx = d.transaction(["meta", "photos"], "readonly");
    const doc = (await request(tx.objectStore("meta").get("doc"))) as Doc | undefined;
    if (!doc) return null;
    const photos = (await request(tx.objectStore("photos").getAll())) as StoredPhoto[];
    return { doc, photos };
  } catch {
    return null;
  }
}

const saved = new Set<string>();
let queued: { doc: Doc; photos: (id: string) => Photo | undefined } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Save soon. Rapid edits collapse into one write. */
export function saveSession(doc: Doc, photos: (id: string) => Photo | undefined) {
  queued = { doc, photos };
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

export function markSaved(ids: string[]) {
  ids.forEach((id) => saved.add(id));
}

async function flush() {
  const q = queued;
  queued = null;
  if (!q) return;
  try {
    const d = await db();
    const tx = d.transaction(["meta", "photos"], "readwrite");
    const store = tx.objectStore("photos");
    const used = new Set(q.doc.prints.map((p) => p.photoId));
    for (const id of used) {
      if (saved.has(id)) continue;
      const p = q.photos(id);
      if (!p) continue;
      const { url: _url, ...rec } = p;
      store.put(rec);
      saved.add(id);
    }
    for (const id of [...saved]) {
      if (!used.has(id)) {
        store.delete(id);
        saved.delete(id);
      }
    }
    tx.objectStore("meta").put(q.doc, "doc");
    await done(tx);
  } catch {
    // Private windows or a full disk can refuse storage. The app still works; it just won't remember.
  }
}

const PREFIX = "print-sheets.";
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v == null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* not fatal */
    }
  },
};
