import { memo, useEffect, useRef, useState } from "react";
import { CAPTION_FONT, CAPTION_MAX, fitCaption, inkFor } from "../lib/caption";
import { effectivePpi, panBy, photoBox, sharpness, zoomAt, type Crop } from "../lib/crop";
import { captionStrip, cropArea, type Format } from "../lib/formats";
import { measureCaption } from "../lib/fonts";
import type { Sides } from "../lib/layout";
import { FRAME_COLORS } from "../lib/pdf";
import type { Photo } from "../lib/photos";
import { actions, docStore } from "../lib/session";
import type { Frame, PrintItem } from "../lib/store";

export type Matrix = [number, number, number, number, number, number];

interface Props {
  format: Format;
  frame: Frame;
  matrix: Matrix;
  bleed: Sides;
  print: PrintItem;
  photo?: Photo;
  cutLines: boolean;
  selected?: boolean;
  dropTarget?: boolean;
  /** Close-up view: plain scrolling pans the photo and the hidden part of the photo shows around the card. */
  closeUp?: boolean;
  /** A small picture of the print with no interaction, e.g. in the filmstrip. */
  still?: boolean;
  /** Hide the drawn caption, e.g. while it is being typed over. */
  hideCaption?: boolean;
  onSelect?: (id: string) => void;
  onOpen?: (id: string, focus?: "caption") => void;
  /** Start moving the whole print (grabbed by its border, or with Option held). */
  onGrab?: (id: string, e: React.PointerEvent) => void;
}

const currentCrop = (id: string): Crop | undefined => docStore.get().doc.prints.find((p) => p.id === id)?.crop;

function CardView({
  format: f,
  frame,
  matrix,
  bleed,
  print,
  photo,
  cutLines,
  selected,
  dropTarget,
  closeUp,
  still,
  hideCaption,
  onSelect,
  onOpen,
  onGrab,
}: Props) {
  const groupRef = useRef<SVGGElement>(null);
  const hitRef = useRef<SVGRectElement>(null);
  const [active, setActive] = useState(false);
  const [hover, setHover] = useState(false);
  const win = f.window;
  const area = cropArea(f);
  const strip = captionStrip(f);
  const fill = f.kind === "instant" ? FRAME_COLORS[frame] : "#ffffff";
  const box = photo ? photoBox(area, photo, print.crop) : null;
  const clipId = `clip-${print.id}${closeUp ? "-cu" : still ? "-th" : ""}`;
  const quality = photo ? sharpness(effectivePpi(area, photo, print.crop)) : "sharp";

  // Screen <-> card coordinates, read fresh each time because the sheet can scroll or resize.
  const toLocal = (x: number, y: number) => {
    const m = groupRef.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(x, y).matrixTransform(m);
    return { x: p.x - area.x, y: p.y - area.y };
  };
  const vecToLocal = (dx: number, dy: number) => {
    const m = groupRef.current!.getScreenCTM()!.inverse();
    return { x: m.a * dx + m.c * dy, y: m.b * dx + m.d * dy };
  };

  // Trackpad pinch (Chrome sends ctrl+wheel, Safari sends gesture events) and, in close-up, two-finger scroll.
  useEffect(() => {
    const el = hitRef.current;
    if (!el || !photo || still) return;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const settle = (label: string) => {
      clearTimeout(idle);
      idle = setTimeout(() => {
        docStore.end(label);
        setActive(false);
      }, 350);
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !closeUp) return;
      e.preventDefault();
      const crop = currentCrop(print.id);
      if (!crop) return;
      docStore.begin();
      setActive(true);
      if (e.ctrlKey) {
        const p = toLocal(e.clientX, e.clientY);
        actions.setCrop(print.id, zoomAt(crop, area, photo, Math.exp(-e.deltaY * 0.01), p.x, p.y));
        settle("Zoomed photo");
      } else {
        const d = vecToLocal(-e.deltaX, -e.deltaY);
        actions.setCrop(print.id, panBy(crop, area, photo, d.x, d.y));
        settle("Moved photo");
      }
    };
    let gesture: { crop: Crop; x: number; y: number } | null = null;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      const crop = currentCrop(print.id);
      const ge = e as unknown as { clientX: number; clientY: number };
      if (!crop) return;
      docStore.begin();
      setActive(true);
      gesture = { crop, ...toLocal(ge.clientX, ge.clientY) };
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      if (!gesture) return;
      const scale = (e as unknown as { scale: number }).scale;
      actions.setCrop(print.id, zoomAt(gesture.crop, area, photo, scale, gesture.x, gesture.y));
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      gesture = null;
      docStore.end("Zoomed photo");
      setActive(false);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    el.addEventListener("gestureend", onGestureEnd);
    return () => {
      clearTimeout(idle);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [print.id, photo, area, closeUp, still]);

  // Dragging pans; two fingers pinch. A press that barely moves is a click.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ crop: Crop; x: number; y: number; moved: boolean; pinch?: { dist: number; mx: number; my: number } } | null>(
    null,
  );

  const restart = () => {
    const crop = currentCrop(print.id);
    if (!crop) return;
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      const mid = toLocal((a.x + b.x) / 2, (a.y + b.y) / 2);
      drag.current = { crop, x: 0, y: 0, moved: true, pinch: { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: mid.x, my: mid.y } };
    } else if (pts.length === 1) {
      drag.current = { crop, x: pts[0].x, y: pts[0].y, moved: drag.current?.moved ?? false };
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (e.altKey && onGrab) return onGrab(print.id, e);
    if (!photo) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) drag.current = null;
    docStore.begin();
    restart();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !photo || !drag.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (d.pinch) {
      const [a, b] = [...pointers.current.values()];
      const factor = Math.hypot(a.x - b.x, a.y - b.y) / d.pinch.dist;
      actions.setCrop(print.id, zoomAt(d.crop, area, photo, factor, d.pinch.mx, d.pinch.my));
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    if (!d.moved) {
      d.moved = true;
      setActive(true);
      onSelect?.(print.id);
    }
    const v = vecToLocal(dx, dy);
    actions.setCrop(print.id, panBy(d.crop, area, photo, v.x, v.y));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size > 0) return restart();
    const moved = drag.current?.moved;
    drag.current = null;
    docStore.end("Moved photo");
    setActive(false);
    if (!moved) onSelect?.(print.id);
  };

  const caption = print.caption.slice(0, CAPTION_MAX);
  const fit = strip ? fitCaption(caption || "Write a caption", strip, measureCaption) : null;
  const showHint = !caption && strip && (closeUp || selected || hover) && !hideCaption;
  const ink = inkFor(frame);

  return (
    <g
      ref={groupRef}
      transform={`matrix(${matrix.join(" ")})`}
      className={`card${selected ? " is-selected" : ""}${active ? " is-active" : ""}`}
      data-print-id={print.id}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onDoubleClick={() => onOpen?.(print.id)}
    >
      <rect
        className={onGrab ? "frame" : undefined}
        width={f.w}
        height={f.h}
        fill={fill}
        onPointerDown={onGrab ? (e) => e.button === 0 && onGrab(print.id, e) : undefined}
        onClick={() => onSelect?.(print.id)}
      />
      <clipPath id={`${clipId}-card`}>
        <rect width={f.w} height={f.h} />
      </clipPath>
      <clipPath id={clipId}>
        <rect
          x={win.x - bleed.left}
          y={win.y - bleed.top}
          width={win.w + bleed.left + bleed.right}
          height={win.h + bleed.top + bleed.bottom}
        />
      </clipPath>
      {closeUp && photo && box && (
        <image
          className="ghost"
          href={photo.url}
          x={area.x + box.x}
          y={area.y + box.y}
          width={box.w}
          height={box.h}
          preserveAspectRatio="none"
          transform={`rotate(${box.rotation} ${area.x + box.centerX} ${area.y + box.centerY})`}
          opacity={active ? 0.32 : hover ? 0.2 : 0}
        />
      )}
      <g clipPath={`url(#${clipId})`}>
        {(!photo || print.crop.zoom < 1) && (
          <rect
            x={win.x - bleed.left}
            y={win.y - bleed.top}
            width={win.w + bleed.left + bleed.right}
            height={win.h + bleed.top + bleed.bottom}
            fill={photo ? fill : "#e9e7e3"}
            className={photo ? undefined : "loading"}
          />
        )}
        {photo && box && (
          <image
            href={photo.url}
            x={area.x + box.x}
            y={area.y + box.y}
            width={box.w}
            height={box.h}
            preserveAspectRatio="none"
            transform={`rotate(${box.rotation} ${area.x + box.centerX} ${area.y + box.centerY})`}
          />
        )}
      </g>
      {strip && fit && (caption || showHint) && !hideCaption && (
        <text
          clipPath={`url(#${clipId}-card)`}
          x={fit.centerX}
          y={fit.baseline}
          fontSize={fit.size}
          fontFamily={`"${CAPTION_FONT}", "Bradley Hand", cursive`}
          textAnchor="middle"
          fill={caption ? ink : frame === "black" ? "#77736c" : "#bdb7ad"}
          className="caption"
        >
          {caption || "Write a caption"}
        </text>
      )}
      {strip && onOpen && !still && (
        <rect
          className="hit-strip"
          x={0}
          y={strip.y}
          width={f.w}
          height={strip.h}
          fill="transparent"
          onPointerDown={onGrab ? (e) => e.button === 0 && onGrab(print.id, e) : undefined}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(print.id);
            onOpen(print.id, "caption");
          }}
        />
      )}
      {!still && (
      <rect
        ref={hitRef}
        className="hit-photo"
        x={win.x}
        y={win.y}
        width={win.w}
        height={win.h}
        fill="transparent"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      )}
      {cutLines && (
        <rect
          className="cut"
          width={f.w}
          height={f.h}
          fill="none"
          stroke={frame === "black" && f.kind === "instant" ? "#777" : "#c4c4c4"}
          strokeWidth={0.12}
        />
      )}
      {quality !== "sharp" && !active && !still && (
        <g className={`badge badge-${quality}`} transform={`translate(${win.x + win.w - 3.2} ${win.y + 3.2})`}>
          <title>{quality === "blurry" ? "This photo will look blurry at this size" : "This photo may look a little soft"}</title>
          <circle r={closeUp ? 1.6 : 2.4} />
        </g>
      )}
      {(selected || dropTarget) && !closeUp && (
        <rect className={dropTarget ? "ring ring-drop" : "ring"} width={f.w} height={f.h} fill="none" vectorEffect="non-scaling-stroke" />
      )}
    </g>
  );
}

export const Card = memo(CardView);
