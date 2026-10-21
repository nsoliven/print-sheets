import { memo } from "react";
import type { Format } from "../lib/formats";
import { PAGE, layoutFor, slotMatrix } from "../lib/layout";
import { photoStore } from "../lib/photos";
import type { Doc } from "../lib/store";
import { Card } from "./Card";

interface Props {
  doc: Doc;
  format: Format;
  index: number;
  /** Width on screen, in CSS pixels. */
  width: number;
  interactive?: boolean;
  selectedId?: string | null;
  dropId?: string | null;
  photosVersion?: number;
  onSelect?: (id: string) => void;
  onOpen?: (id: string, focus?: "caption") => void;
  onAddAt?: (index: number) => void;
  onGrab?: (id: string, e: React.PointerEvent) => void;
}

function SheetView({ doc, format, index, width, interactive, selectedId, dropId, onSelect, onOpen, onAddAt, onGrab }: Props) {
  const { slots } = layoutFor(format);
  const start = index * slots.length;
  const prints = doc.prints.slice(start, start + slots.length);
  const firstEmpty = prints.length;

  return (
    <svg
      className={`sheet${interactive ? " is-interactive" : ""}`}
      viewBox={`0 0 ${PAGE.w} ${PAGE.h}`}
      width={width}
      height={(width * PAGE.h) / PAGE.w}
      role="img"
      aria-label={`Sheet ${index + 1}`}
    >
      <rect width={PAGE.w} height={PAGE.h} fill="#fff" />
      {slots.map((slot, i) => {
        const p = prints[i];
        if (p) {
          return (
            <Card
              key={p.id}
              format={format}
              frame={doc.frame}
              matrix={slotMatrix(slot)}
              bleed={slot.bleed}
              print={p}
              photo={photoStore.get(p.photoId)}
              cutLines={doc.cutLines}
              selected={interactive && selectedId === p.id}
              dropTarget={dropId === p.id}
              onSelect={interactive ? onSelect : undefined}
              onOpen={interactive ? onOpen : undefined}
              onGrab={interactive ? onGrab : undefined}
            />
          );
        }
        if (!interactive) return null;
        // Empty spots are only drawn on screen, never printed. Each is a faint outline of the card itself,
        // window and caption strip included, so you can see what the sheet will hold.
        const m = slotMatrix(slot);
        const next = i === firstEmpty;
        const w = format.window;
        const r = Math.min(format.w, format.h) * 0.075;
        return (
          <g
            key={`empty-${i}`}
            className={`empty${next ? " is-next" : ""}${dropId === `slot-${start + i}` ? " is-drop" : ""}`}
            data-slot-index={start + i}
            transform={`matrix(${m.join(" ")})`}
            onClick={() => onAddAt?.(start + firstEmpty)}
          >
            <title>{next ? "Add photos" : "Add photos to fill this spot"}</title>
            <rect className="empty-card" x={0.6} y={0.6} width={format.w - 1.2} height={format.h - 1.2} rx={0.8} />
            {format.kind === "instant" && <rect className="empty-window" x={w.x} y={w.y} width={w.w} height={w.h} rx={0.4} />}
            <g transform={`translate(${w.x + w.w / 2} ${w.y + w.h / 2})`} className="empty-plus">
              <circle r={r} />
              <path d={`M${-r * 0.42} 0H${r * 0.42}M0 ${-r * 0.42}V${r * 0.42}`} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export const Sheet = memo(SheetView);
