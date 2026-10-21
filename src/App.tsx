import { Copy, ImagePlus, Maximize2, Plus, Printer, Redo2, RotateCw, Scan, ShieldCheck, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CloseUp } from "./components/CloseUp";
import { FormatPicker } from "./components/FormatPicker";
import { MoreMenu } from "./components/MoreMenu";
import { PrintPanel } from "./components/PrintPanel";
import { Sheet } from "./components/Sheet";
import { minZoom } from "./lib/crop";
import { CAPTION_FONT } from "./lib/caption";
import { cropArea, formatOf, type Format } from "./lib/formats";
import { captionFontReady } from "./lib/fonts";
import { findIssues, worstIssue } from "./lib/issues";
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

/** Three sample prints fanned out, drawn in the shape of the chosen size. */
function StackArt({ format: f }: { format: Format }) {
  const h = 104;
  const w = (h * f.w) / f.h;
  const win = f.window;
  const photos = ["sunset", "sea", "forest"];
  return (
    <div className="stack-art" style={{ width: w * 2.1, height: h + 16 }} aria-hidden>
      {photos.map((name, i) => (
        <div key={name} className={`stack-card stack-${i}`} style={{ width: w, height: h }}>
          <div
            className={`stack-photo photo-${name}`}
            style={{
              left: `${(win.x / f.w) * 100}%`,
              top: `${(win.y / f.h) * 100}%`,
              width: `${(win.w / f.w) * 100}%`,
              height: `${(win.h / f.h) * 100}%`,
            }}
          />
          {f.kind === "instant" && i === 1 && (
            <span className="stack-caption" style={{ fontFamily: `"${CAPTION_FONT}", cursive`, top: `${((win.y + win.h) / f.h) * 100}%` }}>
              Sunday
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const history = useStore(docStore, docStore.get);
  const doc = history.doc;
  const photosVersion = useStore(photoStore, photoStore.version);
  const f = formatOf(doc.format);
  const per = layoutFor(f).slots.length;
  const sheetCount = sheetsOf(doc);

  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [closeUp, setCloseUp] = useState<{ id: string; focus?: "caption" } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [drag, setDrag] = useState<{ count: number; target: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<{ id: string; x: number; y: number; target: string | null } | null>(null);
  const grabRef = useRef<{ id: string; x: number; y: number; started: boolean } | null>(null);
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

  // Move a whole print: grab its white border (or hold Option) and drop it on another spot.
  const onGrab = useCallback((id: string, e: React.PointerEvent) => {
    e.preventDefault();
    grabRef.current = { id, x: e.clientX, y: e.clientY, started: false };
  }, []);
  useEffect(() => {
    const targetAt = (x: number, y: number, self: string) => {
      const el = document.elementFromPoint(x, y)?.closest("[data-print-id], [data-slot-index]") as SVGElement | null;
      if (!el) return null;
      if (el.dataset.slotIndex) return `slot-${el.dataset.slotIndex}`;
      return el.dataset.printId === self ? null : (el.dataset.printId ?? null);
    };
    const onMove = (e: PointerEvent) => {
      const g = grabRef.current;
      if (!g) return;
      if (!g.started && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5) return;
      g.started = true;
      setMoving({ id: g.id, x: e.clientX, y: e.clientY, target: targetAt(e.clientX, e.clientY, g.id) });
    };
    const onUp = (e: PointerEvent) => {
      const g = grabRef.current;
      grabRef.current = null;
      if (!g?.started) return;
      setMoving(null);
      // The pointer-up would otherwise land as a click on whatever is under it.
      const swallow = (ev: Event) => ev.stopPropagation();
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      const target = targetAt(e.clientX, e.clientY, g.id);
      if (!target) return;
      const prints = docStore.get().doc.prints;
      const to = target.startsWith("slot-") ? prints.length - 1 : prints.findIndex((p) => p.id === target);
      if (to >= 0) {
        actions.move(g.id, to);
        setSelected(g.id);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const worst = useMemo(() => (ready ? worstIssue(findIssues(doc)) : null), [doc, photosVersion, ready]);

  if (!ready) return <div className="app" />;

  const empty = doc.prints.length === 0;
  // Fit one whole sheet in view; more sheets sit beside it or scroll below.
  const PAD = 28;
  const LABEL = 30;
  const sheetW = Math.max(220, Math.min((stage.h - PAD * 2 - LABEL) * (PAGE.w / PAGE.h), stage.w - PAD * 2));
  const selPhoto = selectedPrint ? photoStore.get(selectedPrint.photoId) : undefined;
  const showingWhole = !!(selectedPrint && selPhoto && selectedPrint.crop.zoom <= minZoom(cropArea(f), selPhoto, selectedPrint.crop.rotation) + 1e-3);

  return (
    <div className={`app${drag ? " is-dragging" : ""}`}>
      <header className="bar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <span />
          </span>
          Print Sheets
        </div>
        <FormatPicker value={doc.format} onChange={(id) => actions.setFormat(id)} />
        <div className="bar-actions">
          {worst && (
            <button className="attention" onClick={() => openCloseUp(worst.id)} title={`${worst.text}. Show it up close.`}>
              <TriangleAlert size={15} /> <span className="attention-text">{worst.text}</span>
            </button>
          )}
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
                    <b>{sheetCount > 1 ? `Sheet ${i + 1}` : "Letter sheet"}</b>
                  </span>
                  <span className={`count-pill tabular${used === per ? " is-full" : ""}`} title={`${used} of ${per} spots filled`}>
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
                    dropId={moving ? moving.target : drag?.target}
                    photosVersion={photosVersion}
                    onSelect={setSelected}
                    onOpen={openCloseUp}
                    onAddAt={addAt}
                    onGrab={onGrab}
                  />
                  {empty && i === 0 && (
                    <div className="empty-call">
                      <StackArt format={f} />
                      <h1>Add photos to start</h1>
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
            <button onClick={() => openCloseUp(selectedPrint.id)} title="Frame and caption it up close (Return)">
              <Maximize2 size={16} /> Close up
            </button>
            <span className="dock-sep" />
            <button onClick={() => actions.rotate(selectedPrint.id)} title="Turn the photo a quarter turn (R)">
              <RotateCw size={16} /> Turn
            </button>
            <button onClick={() => actions.toggleWhole(selectedPrint.id)} title={showingWhole ? "Fill the frame" : "Fit the whole photo in the frame"}>
              <Scan size={16} /> {showingWhole ? "Fill" : "Whole photo"}
            </button>
            <span className="dock-sep" />
            <button onClick={() => setSelected(actions.duplicate(selectedPrint.id) ?? selectedPrint.id)} title="Print another copy (⌘D)">
              <Copy size={16} /> Copy
            </button>
            <button onClick={() => choose({ mode: "replace", id: selectedPrint.id })} title="Use a different photo, keeping the caption">
              <ImagePlus size={16} /> Replace
            </button>
            <span className="dock-sep" />
            <button className="danger" onClick={() => remove(selectedPrint.id)} title="Remove (Delete)">
              <Trash2 size={16} /> Remove
            </button>
          </div>
        ) : (
          busy && <p className="hint">Opening photos…</p>
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

      {moving && (
        <div className="move-ghost" style={{ left: moving.x, top: moving.y }} aria-hidden>
          {(() => {
            const p = doc.prints.find((x) => x.id === moving.id);
            const ph = p && photoStore.get(p.photoId);
            return ph ? <img src={ph.url} alt="" /> : null;
          })()}
        </div>
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
