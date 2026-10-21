import { Ellipsis, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Format } from "../lib/formats";
import { FRAME_COLORS } from "../lib/pdf";
import { actions } from "../lib/session";
import type { Doc, Frame } from "../lib/store";

const FRAMES: { id: Frame; name: string }[] = [
  { id: "white", name: "White" },
  { id: "cream", name: "Cream" },
  { id: "black", name: "Black" },
];

export function MoreMenu({ doc, format }: { doc: Doc; format: Format }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div className="more" ref={ref}>
      <button className="icon-btn" aria-label="More options" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Ellipsis size={19} />
      </button>
      {open && (
        <div className="popover more-pop" role="menu">
          {format.kind === "instant" && (
            <div className="more-row">
              <span>Frame</span>
              <div className="swatches">
                {FRAMES.map((fr) => (
                  <button
                    key={fr.id}
                    className={`swatch${doc.frame === fr.id ? " is-on" : ""}`}
                    style={{ background: FRAME_COLORS[fr.id] }}
                    aria-label={`${fr.name} frame`}
                    title={fr.name}
                    onClick={() => actions.setFrame(fr.id)}
                  />
                ))}
              </div>
            </div>
          )}
          <label className="more-row">
            <span>Cut lines</span>
            <input type="checkbox" className="switch" checked={doc.cutLines} onChange={(e) => actions.setCutLines(e.target.checked)} />
          </label>
          <div className="more-sep" />
          <button
            className="more-item danger"
            disabled={!doc.prints.length}
            onClick={() => {
              actions.clearAll();
              setOpen(false);
            }}
          >
            Remove all prints
          </button>
          <div className="more-sep" />
          <p className="more-note">
            <ShieldCheck size={15} /> Your photos never leave this computer. This app can't connect to the internet at all.
          </p>
        </div>
      )}
    </div>
  );
}
