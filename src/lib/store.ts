import { useSyncExternalStore } from "react";
import type { Crop } from "./crop";
import type { FormatId } from "./formats";

export type Frame = "white" | "cream" | "black";

export interface PrintItem {
  id: string;
  photoId: string;
  crop: Crop;
  caption: string;
}

/** Everything that undo and redo cover. */
export interface Doc {
  format: FormatId;
  prints: PrintItem[];
  frame: Frame;
  cutLines: boolean;
}

export const EMPTY_DOC: Doc = { format: "instax-mini", prints: [], frame: "white", cutLines: true };

const LIMIT = 200;
const COALESCE_MS = 1200;

export interface HistoryState {
  doc: Doc;
  past: Doc[];
  future: Doc[];
  /** A short description of what the last undoable change was, for the undo toast. */
  label: string;
}

/**
 * A tiny undoable store. Edits either commit right away, or run as a gesture:
 * `begin`, any number of `live` updates while dragging, then `end` records one undo step.
 */
export function createDocStore(initial: Doc) {
  let state: HistoryState = { doc: initial, past: [], future: [], label: "" };
  let gestureBase: Doc | null = null;
  let lastKey = "";
  let lastAt = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const push = (before: Doc, after: Doc, label: string) => {
    state = { doc: after, past: [...state.past.slice(-LIMIT + 1), before], future: [], label };
  };

  return {
    get: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** Make an undoable change. Changes with the same `key` close together merge into one step. */
    commit(label: string, update: (d: Doc) => Doc, key?: string) {
      const next = update(state.doc);
      if (next === state.doc) return;
      const now = Date.now();
      if (key && key === lastKey && now - lastAt < COALESCE_MS && state.future.length === 0) {
        state = { ...state, doc: next };
      } else {
        push(state.doc, next, label);
      }
      lastKey = key ?? "";
      lastAt = now;
      emit();
    },
    begin() {
      gestureBase ??= state.doc;
    },
    live(update: (d: Doc) => Doc) {
      const next = update(state.doc);
      if (next === state.doc) return;
      state = { ...state, doc: next };
      emit();
    },
    end(label: string) {
      const base = gestureBase;
      gestureBase = null;
      lastKey = "";
      if (base && base !== state.doc) {
        push(base, state.doc, label);
        emit();
      }
    },
    undo() {
      const before = state.past.at(-1);
      if (!before) return false;
      state = { doc: before, past: state.past.slice(0, -1), future: [state.doc, ...state.future], label: "" };
      lastKey = "";
      emit();
      return true;
    },
    redo() {
      const next = state.future[0];
      if (!next) return false;
      state = { doc: next, past: [...state.past, state.doc], future: state.future.slice(1), label: "" };
      lastKey = "";
      emit();
      return true;
    },
    /** Replace the document without an undo step, e.g. when restoring a saved session. */
    reset(doc: Doc) {
      state = { doc, past: [], future: [], label: "" };
      emit();
    },
  };
}

export type DocStore = ReturnType<typeof createDocStore>;

export function useStore<T>(store: { subscribe: (l: () => void) => () => void }, read: () => T): T {
  return useSyncExternalStore(store.subscribe, read, read);
}

export function updatePrint(doc: Doc, id: string, patch: Partial<PrintItem>): Doc {
  return { ...doc, prints: doc.prints.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}
