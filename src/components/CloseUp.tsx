import { ChevronLeft, ChevronRight, RotateCw, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { layoutFor } from "../lib/layout";
import { CAPTION_FONT, CAPTION_MAX, fitCaption } from "../lib/caption";
import { effectivePpi, MAX_ZOOM, minZoom, sharpness, zoomAt } from "../lib/crop";
import { captionStrip, cropArea, type Format } from "../lib/formats";
import { measureCaption } from "../lib/fonts";
import { photoStore } from "../lib/photos";
import { actions, docStore } from "../lib/session";
import type { Doc } from "../lib/store";
import { Card } from "./Card";

interface Props {
  doc: Doc;
  format: Format;
  id: string;
  focus?: "caption";
  onClose: () => void;
  onGo: (id: string) => void;
}

const NO_BLEED = { top: 0, right: 0, bottom: 0, left: 0 };

export function CloseUp({ doc, format: f, id, focus, onClose, onGo }: Props) {
  const index = doc.prints.findIndex((p) => p.id === id);
  const print = doc.prints[index];
  const photo = print ? photoStore.get(print.photoId) : undefined;
  const strip = captionStrip(f);
  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [px, setPx] = useState(0);
  const [editing, setEditing] = useState(false);

  // Leave room around the card so the hidden part of the photo can show while framing.
  const pad = Math.max(f.w, f.h) * 0.22;
  const vbW = f.w + pad * 2;
  const vbH = f.h + pad * 2;

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setPx(Math.max(1, Math.min(r.width / vbW, r.height / vbH)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vbW, vbH]);

  const filmRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    filmRef.current?.querySelector(".film-item.is-current")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [id]);

  useEffect(() => {
    if (focus === "caption") setTimeout(() => inputRef.current?.focus(), 30);
  }, [focus, id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) {
        if (e.key === "Escape" || e.key === "Enter") inputRef.current?.blur();
        return;
      }
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && doc.prints[index + 1]) onGo(doc.prints[index + 1].id);
      else if (e.key === "ArrowLeft" && index > 0) onGo(doc.prints[index - 1].id);
      else if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) actions.rotate(id);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [doc.prints, index, id, onClose, onGo]);

  if (!print) return null;
  const perSheet = layoutFor(f).slots.length;

  const win = cropArea(f);
  const min = photo ? minZoom(win, photo, print.crop.rotation) : 1;
  const ppi = photo ? effectivePpi(win, photo, print.crop) : 999;
  const quality = sharpness(ppi);
  const whole = print.crop.zoom <= min + 1e-3;
  const caption = print.caption.slice(0, CAPTION_MAX);
  const fit = strip ? fitCaption(caption || "W", strip, measureCaption) : null;
  const tooLong = strip && caption ? !fitCaption(caption, strip, measureCaption).fits : false;

  // Slider runs on a log scale so each step feels the same size.
  const toSlider = (z: number) => Math.log(z / min) / Math.log(MAX_ZOOM / min);
  const fromSlider = (t: number) => min * Math.pow(MAX_ZOOM / min, t);
  const setZoom = (z: number) => {
    if (!photo) return;
    docStore.begin();
    actions.setCrop(print.id, zoomAt(print.crop, win, photo, z / print.crop.zoom, win.w / 2, win.h / 2));
  };
  const nudgeZoom = (factor: number) => {
    setZoom(print.crop.zoom * factor);
    docStore.end("Zoomed photo");
  };

  const w = vbW * px;
  const h = vbH * px;

  return (
    <div className="closeup" role="dialog" aria-modal="true" aria-label="Close up">
      <div className="closeup-bar">
        <div className="closeup-nav">
          <button className="icon-btn" aria-label="Previous print" title="Previous (←)" disabled={index === 0} onClick={() => onGo(doc.prints[index - 1].id)}>
            <ChevronLeft size={18} />
          </button>
          <span className="muted tabular">
            {index + 1} of {doc.prints.length}
          </span>
          <button
            className="icon-btn"
            aria-label="Next print"
            title="Next (→)"
            disabled={index >= doc.prints.length - 1}
            onClick={() => onGo(doc.prints[index + 1].id)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <p className="closeup-title">
          <b>{print.caption.trim() || `Print ${index + 1}`}</b> · {f.name}, sheet {Math.floor(index / perSheet) + 1}
        </p>
        <button className="btn btn-primary" onClick={onClose} title="Back to the sheet (Esc)">
          Done
        </button>
      </div>

      <div className="closeup-stage" ref={stageRef}>
        <div className="closeup-card" style={{ width: w, height: h }}>
          <svg viewBox={`${-pad} ${-pad} ${vbW} ${vbH}`} width={w} height={h} className="closeup-svg">
            <defs>
              <filter id="lift" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1.2" stdDeviation="2.4" floodOpacity="0.55" />
              </filter>
            </defs>
            <rect width={f.w} height={f.h} fill="#fff" filter="url(#lift)" />
            <Card
              format={f}
              frame={doc.frame}
              matrix={[1, 0, 0, 1, 0, 0]}
              bleed={NO_BLEED}
              print={print}
              photo={photo}
              cutLines={false}
              closeUp
              hideCaption={editing && !caption}
              onOpen={() => inputRef.current?.focus()}
            />
            {f.kind === "photo" && <rect className="card-edge" width={f.w} height={f.h} />}
            {f.lip && (
              <g className="frame-lip" pointerEvents="none">
                <path
                  fillRule="evenodd"
                  d={`M0 0H${f.w}V${f.h}H0Z M${f.lip} ${f.lip}V${f.h - f.lip}H${f.w - f.lip}V${f.lip}Z`}
                />
                <rect x={f.lip} y={f.lip} width={f.w - 2 * f.lip} height={f.h - 2 * f.lip} />
              </g>
            )}
          </svg>
          {strip && fit && (
            <input
              ref={inputRef}
              className={`caption-input${caption ? " has-text" : ""}`}
              value={print.caption}
              maxLength={CAPTION_MAX}
              placeholder="Write a caption"
              aria-label="Caption"
              spellCheck={false}
              onFocus={() => setEditing(true)}
              onBlur={() => setEditing(false)}
              onChange={(e) => actions.setCaption(print.id, e.target.value)}
              style={{
                left: (pad + strip.x) * px,
                top: (pad + strip.y) * px,
                width: strip.w * px,
                height: strip.h * px,
                fontFamily: `"${CAPTION_FONT}", cursive`,
                fontSize: fit.size * px,
              }}
            />
          )}
        </div>
      </div>

      <div className="closeup-tools">
        <div className="tool-pill" role="toolbar" aria-label="Framing">
          <div className="zoom">
            <button className="icon-btn" aria-label="Zoom out" title="Zoom out" onClick={() => nudgeZoom(1 / 1.15)}>
              <ZoomOut size={17} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              aria-label="Zoom"
              value={toSlider(print.crop.zoom)}
              style={{ "--p": Math.max(0, Math.min(1, toSlider(print.crop.zoom))) } as React.CSSProperties}
              onChange={(e) => setZoom(fromSlider(+e.target.value))}
              onPointerUp={() => docStore.end("Zoomed photo")}
              onKeyUp={() => docStore.end("Zoomed photo")}
            />
            <button className="icon-btn" aria-label="Zoom in" title="Zoom in" onClick={() => nudgeZoom(1.15)}>
              <ZoomIn size={17} />
            </button>
          </div>
          <span className="tool-sep" />
          <button className="btn btn-quiet" onClick={() => actions.rotate(print.id)} title="Turn a quarter turn (R)">
            <RotateCw size={16} /> Turn
          </button>
          <button className="btn btn-quiet" onClick={() => actions.toggleWhole(print.id)} title={whole ? "Fill the frame" : "Fit the whole photo in the frame"}>
            <Scan size={16} /> {whole ? "Fill the frame" : "Show whole photo"}
          </button>
        </div>
        <p className={`closeup-note${quality !== "sharp" || tooLong ? " is-warning" : ""}`} aria-live="polite">
          {quality === "blurry"
            ? "This photo is too small for this size and will look blurry. Zoom out, or use a bigger copy of the photo."
            : quality === "soft"
              ? "This photo may look a little soft at this zoom. Zooming out makes it sharper."
              : tooLong
                ? "This caption is too long to fit. Try a shorter one."
                : f.lip
                  ? "The shaded edge is about where an 8 × 10 frame covers the print. Keep faces inside the dashed line."
                  : (
                      <>
                        Drag to move the photo, pinch or scroll to zoom, <kbd>R</kbd> to turn.
                      </>
                    )}
        </p>
      </div>

      {doc.prints.length > 1 && (
        <div className="film" ref={filmRef} role="listbox" aria-label="All prints">
          {doc.prints.map((p, i) => {
            const th = 46;
            const sheetBreak = i > 0 && i % perSheet === 0;
            return (
              <button
                key={p.id}
                role="option"
                aria-selected={p.id === id}
                aria-label={`Print ${i + 1}${p.caption ? `: ${p.caption}` : ""}`}
                className={`film-item${p.id === id ? " is-current" : ""}${sheetBreak ? " sheet-break" : ""}`}
                onClick={() => onGo(p.id)}
              >
                <svg viewBox={`0 0 ${f.w} ${f.h}`} height={th} width={(th * f.w) / f.h}>
                  <Card
                    format={f}
                    frame={doc.frame}
                    matrix={[1, 0, 0, 1, 0, 0]}
                    bleed={NO_BLEED}
                    print={p}
                    photo={photoStore.get(p.photoId)}
                    cutLines={false}
                    still
                  />
                </svg>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
