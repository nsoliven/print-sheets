import { Copy, ImagePlus, Maximize2, Plus, Printer, Redo2, RotateCw, Scan, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CloseUp } from "./components/CloseUp";
import { FormatPicker } from "./components/FormatPicker";
import { MoreMenu } from "./components/MoreMenu";
import { PrintPanel } from "./components/PrintPanel";
import { Sheet } from "./components/Sheet";
import { minZoom } from "./lib/crop";
import { formatOf } from "./lib/formats";
import { captionFontReady } from "./lib/fonts";
import { PAGE, layoutFor } from "./lib/layout";
import { sheetsOf } from "./lib/pdf";
import { loadSession, markSaved, saveSession } from "./lib/persist";
import { photoStore, restorePhoto } from "./lib/photos";
import { actions, addFiles, docStore } from "./lib/session";
import { useStore } from "./lib/store";

interface Toast {
  id: number;
  text: string;
  undo?: boolean;
}

type Pick = { mode: "append" } | { mode: "replace"; id: string } | { mode: "at"; at: number };

const isTyping = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement && el.type !== "range" && el.type !== "checkbox";
};

export function App() {
  const history = useStore(docStore, docStore.get);
  const doc = history.doc;
  const photosVersion = useStore(photoStore, photoStore.version);
  const f = formatOf(doc.format);
  const per = layoutFor(f).slots.length;
  const sideways = layoutFor(f).slots.some((s) => s.rotated);
  const sheetCount = sheetsOf(doc);

  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [closeUp, setCloseUp] = useState<{ id: string; focus?: "caption" } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [drag, setDrag] = useState<{ count: number; target: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<Pick>({ mode: "append" });
  const stageRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState({ w: 800, h: 600 });

  // Restore the last session, then start saving changes.
  useEffect(() => {
    (async () => {
      const [saved] = await Promise.all([loadSession(), captionFontReady]);
      if (saved) {
        saved.photos.forEach(restorePhoto);
        markSaved(saved.photos.map((p) => p.id));
        docStore.reset({ ...saved.doc, prints: saved.doc.prints.filter((p) => photoStore.get(p.photoId)) });
      }
      setReady(true);
    })();
  }, []);
  useEffect(() => {
    if (ready) saveSession(doc, photoStore.get);
  }, [doc, ready]);

  // Forget a selection whose print was removed (by undo, say).
  const selectedPrint = selected ? doc.prints.find((p) => p.id === selected) : undefined;
  useEffect(() => {
    if (selected && !selectedPrint) setSelected(null);
    if (closeUp && !doc.prints.some((p) => p.id === closeUp.id)) setCloseUp(null);
  }, [selected, selectedPrint, closeUp, doc.prints]);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStage({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  const showToast = useCallback((text: string, undo = false) => {
    setToast({ id: Date.now(), text, undo });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const undo = useCallback(() => {
    const label = docStore.get().past.length ? docStore.get().label : "";
    if (docStore.undo()) showToast(label ? `Undid: ${label.toLowerCase()}` : "Undone");
  }, [showToast]);
  const redo = useCallback(() => {
    if (docStore.redo()) showToast("Redone");
  }, [showToast]);

  const choose = useCallback((pick: Pick) => {
    pickRef.current = pick;
    fileRef.current?.click();
  }, []);

  const ingest = useCallback(
    async (files: File[], pick: Pick) => {
      if (!files.length) return;
      setBusy(true);
      const before = docStore.get().doc.prints.length;
      const res = await addFiles(files, {
        replaceId: pick.mode === "replace" ? pick.id : undefined,
        at: pick.mode === "at" ? pick.at : undefined,
      });
      setBusy(false);
      if (res.failed.length) {
        const names = res.failed.slice(0, 2).join(", ") + (res.failed.length > 2 ? ` and ${res.failed.length - 2} more` : "");
        const heic = res.failed.some((n) => /\.hei[cf]$/i.test(n));
        showToast(
          heic
            ? `Couldn't open ${names}. This browser can't read HEIC photos; open the app in Safari, or export them as JPEG.`
            : `Couldn't open ${names}. Try a JPEG or PNG.`,
        );
      }
      if (pick.mode === "replace") setSelected(pick.id);
      else if (res.added && before === 0) setSelected(null);
    },
    [showToast],
  );

  const remove = useCallback(
    (id: string) => {
      const i = docStore.get().doc.prints.findIndex((p) => p.id === id);
      actions.remove(id);
      const next = docStore.get().doc.prints[Math.min(i, docStore.get().doc.prints.length - 1)];
      setSelected(next?.id ?? null);
      showToast("Removed the print", true);
    },
    [showToast],
  );

  const openCloseUp = useCallback((id: string, focus?: "caption") => {
    setSelected(id);
    setCloseUp({ id, focus });
  }, []);
  const goTo = useCallback((id: string) => {
    setSelected(id);
    setCloseUp({ id });
  }, []);
  const closeCloseUp = useCallback(() => setCloseUp(null), []);
  const addAt = useCallback((at: number) => choose({ mode: "at", at }), [choose]);

  // Keyboard: the usual Mac shortcuts, plus arrows to move between prints.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && key === "p") {
        e.preventDefault();
        if (docStore.get().doc.prints.length) setPrinting(true);
        return;
      }
      if (mod && key === "o") {
        e.preventDefault();
        choose({ mode: "append" });
        return;
      }
      if (closeUp || printing || isTyping()) return;
      const prints = docStore.get().doc.prints;
      const i = prints.findIndex((p) => p.id === selected);
      if (e.key === "Escape") setSelected(null);
      else if ((e.key === "Backspace" || e.key === "Delete") && selected) remove(selected);
      else if (e.key === "Enter" && selected) openCloseUp(selected);
      else if (mod && key === "d" && selected) setSelected(actions.duplicate(selected) ?? selected);
      else if (key === "r" && !mod && selected) actions.rotate(selected);
      else if ((e.key === "ArrowRight" || e.key === "ArrowDown") && prints.length) setSelected(prints[Math.min(prints.length - 1, i + 1)].id);
      else if ((e.key === "ArrowLeft" || e.key === "ArrowUp") && prints.length) setSelected(prints[Math.max(0, i < 0 ? 0 : i - 1)].id);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, choose, closeUp, printing, selected, remove, openCloseUp]);

  // Drop photos anywhere. One photo dropped on a print replaces it.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");
    const targetAt = (e: DragEvent) =>
      (document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-print-id]") as SVGElement | null)?.dataset.printId ?? null;
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const count = [...(e.dataTransfer?.items ?? [])].filter((i) => i.kind === "file").length;
      const target = count <= 1 ? targetAt(e) : null;
      setDrag((d) => (d && d.count === count && d.target === target ? d : { count, target }));
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDrag(null);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDrag(null);
      const files = [...(e.dataTransfer?.files ?? [])];
      const target = files.length === 1 ? targetAt(e) : null;
      ingest(files, target ? { mode: "replace", id: target } : { mode: "append" });
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [ingest]);

  if (!ready) return <div className="app" />;

  const empty = doc.prints.length === 0;
  // Fit one whole sheet in view; more sheets sit beside it or scroll below.
  const PAD = 28;
  const LABEL = 30;
  const sheetW = Math.max(220, Math.min((stage.h - PAD * 2 - LABEL) * (PAGE.w / PAGE.h), stage.w - PAD * 2));
  const selPhoto = selectedPrint ? photoStore.get(selectedPrint.photoId) : undefined;
  const showingWhole = !!(selectedPrint && selPhoto && selectedPrint.crop.zoom <= minZoom(f.window, selPhoto, selectedPrint.crop.rotation) + 1e-3);

  return (
    <div className="app">
      <header className="bar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <span />
          </span>
          Print Sheets
        </div>
        <FormatPicker value={doc.format} onChange={(id) => actions.setFormat(id)} />
        <div className="bar-actions">
          <button className="icon-btn" aria-label="Undo" title="Undo (⌘Z)" disabled={!history.past.length} onClick={undo}>
            <Undo2 size={18} />
          </button>
          <button className="icon-btn" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!history.future.length} onClick={redo}>
            <Redo2 size={18} />
          </button>
          <MoreMenu doc={doc} format={f} />
          {empty ? (
            <button className="btn btn-primary" onClick={() => choose({ mode: "append" })}>
              <Plus size={17} /> Add photos
            </button>
          ) : (
            <>
              <button className="btn btn-quiet" onClick={() => choose({ mode: "append" })} title="Add photos (⌘O)">
                <Plus size={17} /> Add
              </button>
              <button className="btn btn-primary" onClick={() => setPrinting(true)} title="Print (⌘P)">
                <Printer size={17} /> Print
              </button>
            </>
          )}
        </div>
      </header>

      <main
        className="stage"
        ref={stageRef}
        onPointerDown={(e) => {
          if (!(e.target as Element).closest(".card, .dock")) setSelected(null);
        }}
      >
        <div className="sheets" style={{ padding: PAD }}>
          {Array.from({ length: sheetCount }, (_, i) => {
            const used = Math.min(per, Math.max(0, doc.prints.length - i * per));
            return (
              <figure className="sheet-wrap" key={i} style={{ width: sheetW }}>
                <figcaption className="sheet-label">
                  <span>
                    {sheetCount > 1 ? `Sheet ${i + 1}` : "Letter sheet"}
                    {i === 0 && sideways && <span className="muted"> · some prints turned sideways to fit more</span>}
                  </span>
                  <span className="muted tabular">
                    {used} of {per}
                  </span>
                </figcaption>
                <div className="paper">
                  <Sheet
                    doc={doc}
                    format={f}
                    index={i}
                    width={sheetW}
                    interactive
                    selectedId={selected}
                    dropId={drag?.target}
                    photosVersion={photosVersion}
                    onSelect={setSelected}
                    onOpen={openCloseUp}
                    onAddAt={addAt}
                  />
                  {empty && i === 0 && (
                    <div className="empty-call">
                      <h1>Add photos to start</h1>
                      <p className="muted">Drop them anywhere, or choose them from your Mac.</p>
                      <button className="btn btn-primary btn-large" onClick={() => choose({ mode: "append" })}>
                        <ImagePlus size={18} /> Choose photos
                      </button>
                      <p className="privacy">
                        <ShieldCheck size={14} /> Photos stay on this computer
                      </p>
                    </div>
                  )}
                </div>
              </figure>
            );
          })}
        </div>
      </main>

      <footer className="foot">
        {selectedPrint && !closeUp ? (
          <div className="dock" role="toolbar" aria-label="Selected print">
            <button onClick={() => openCloseUp(selectedPrint.id)}>
              <Maximize2 size={16} /> Close up
            </button>
            <button onClick={() => actions.rotate(selectedPrint.id)}>
              <RotateCw size={16} /> Turn
            </button>
            <button onClick={() => actions.toggleWhole(selectedPrint.id)}>
              <Scan size={16} /> {showingWhole ? "Fill" : "Whole photo"}
            </button>
            <button onClick={() => setSelected(actions.duplicate(selectedPrint.id) ?? selectedPrint.id)}>
              <Copy size={16} /> Copy
            </button>
            <button onClick={() => choose({ mode: "replace", id: selectedPrint.id })}>
              <ImagePlus size={16} /> Replace
            </button>
            <button className="danger" onClick={() => remove(selectedPrint.id)}>
              <Trash2 size={16} /> Remove
            </button>
          </div>
        ) : (
          !empty && (
            <p className="hint">
              {busy
                ? "Opening photos…"
                : f.kind === "instant"
                  ? "Drag a photo to frame it, pinch to zoom. Click the white strip to write a caption."
                  : "Drag a photo to frame it, pinch to zoom. Double-click for a close up."}
            </p>
          )
        )}
      </footer>

      {drag && (
        <div className="drop-hint" aria-hidden>
          {drag.target ? "Drop to replace this photo" : drag.count > 1 ? `Drop to add ${drag.count} photos` : "Drop to add photos"}
        </div>
      )}

      {closeUp && <CloseUp doc={doc} format={f} id={closeUp.id} focus={closeUp.focus} onClose={closeCloseUp} onGo={goTo} />}

      {printing && (
        <PrintPanel
          doc={doc}
          format={f}
          onClose={() => setPrinting(false)}
          onShow={(id) => {
            setPrinting(false);
            openCloseUp(id);
          }}
        />
      )}

      {toast && (
        <div className="toast" key={toast.id} role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              onClick={() => {
                docStore.undo();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          ingest(files, pickRef.current);
        }}
      />
    </div>
  );
}
