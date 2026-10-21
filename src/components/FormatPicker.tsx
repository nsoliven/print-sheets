import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FORMATS, type Format, type FormatId } from "../lib/formats";
import { layoutFor } from "../lib/layout";

/** A tiny drawing of the card. Every size uses the same scale, so they compare truthfully. */
export function Silhouette({ f, scale = 0.36 }: { f: Format; scale?: number }) {
  return (
    <svg width={f.w * scale} height={f.h * scale} viewBox={`0 0 ${f.w} ${f.h}`} className="silhouette" aria-hidden>
      <rect width={f.w} height={f.h} rx={1.5} className="sil-card" />
      <rect x={f.window.x} y={f.window.y} width={f.window.w} height={f.window.h} className="sil-window" />
    </svg>
  );
}

interface Props {
  value: FormatId;
  onChange: (id: FormatId) => void;
}

export function FormatPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = FORMATS.find((f) => f.id === value)!;

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  const groups: [string, Format[]][] = [
    ["Instant film", FORMATS.filter((f) => f.kind === "instant")],
    ["Photo prints", FORMATS.filter((f) => f.kind === "photo")],
  ];

  return (
    <div className="picker" ref={ref}>
      <button className="picker-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="picker-name">{current.name}</span>
        <span className="muted">{layoutFor(current).slots.length} per sheet</span>
        <ChevronDown size={15} className="muted" />
      </button>
      {open && (
        <div className="popover picker-pop" role="listbox" aria-label="Print size">
          {groups.map(([title, list]) => (
            <div key={title} className="picker-group">
              <div className="eyebrow">{title}</div>
              {list.map((f) => (
                <button
                  key={f.id}
                  role="option"
                  aria-selected={f.id === value}
                  className={`picker-option${f.id === value ? " is-current" : ""}`}
                  onClick={() => {
                    onChange(f.id);
                    setOpen(false);
                  }}
                >
                  <span className="picker-sil">
                    <Silhouette f={f} />
                  </span>
                  <span className="picker-text">
                    <span className="picker-title">
                      {f.name} <span className="muted picker-size">{f.label}</span>
                    </span>
                    <span className="muted">{f.blurb}</span>
                  </span>
                  <span className="picker-count">
                    {layoutFor(f).slots.length}
                    <span className="muted"> / sheet</span>
                  </span>
                  <span className="picker-check">{f.id === value && <Check size={16} />}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
