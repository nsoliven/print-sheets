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
}

function SheetView({ doc, format, index, width, interactive, selectedId, dropId, onSelect, onOpen, onAddAt }: Props) {
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
            />
          );
        }
        if (!interactive) return null;
        // Empty spots are only drawn on screen, never printed.
        const m = slotMatrix(slot);
        const next = i === firstEmpty;
        return (
          <g
            key={`empty-${i}`}
            className={`empty${next ? " is-next" : ""}`}
            transform={`matrix(${m.join(" ")})`}
            onClick={() => onAddAt?.(start + firstEmpty)}
          >
            <rect x={1.2} y={1.2} width={format.w - 2.4} height={format.h - 2.4} rx={1.2} vectorEffect="non-scaling-stroke" />
            <g transform={`translate(${format.w / 2} ${format.h / 2})`} className="empty-plus">
              <path d="M-3 0H3M0 -3V3" vectorEffect="non-scaling-stroke" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export const Sheet = memo(SheetView);
