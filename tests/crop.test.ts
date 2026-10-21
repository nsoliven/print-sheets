import { describe, expect, it } from "vitest";
import { clampCrop, DEFAULT_CROP, effectivePpi, minZoom, panBy, photoBox, rotateCrop, toggleWhole, zoomAt } from "../src/lib/crop";

const win = { w: 46, h: 62 };
const img = { w: 4032, h: 3024 };

function covers(crop: ReturnType<typeof clampCrop>) {
  const b = photoBox(win, img, crop);
  const [w, h] = crop.rotation % 180 ? [b.h, b.w] : [b.w, b.h];
  const left = b.centerX - w / 2;
  const top = b.centerY - h / 2;
  return left <= 1e-9 && top <= 1e-9 && left + w >= win.w - 1e-9 && top + h >= win.h - 1e-9;
}

describe("crop", () => {
  it("starts centred and covering the window", () => {
    const c = clampCrop(DEFAULT_CROP, win, img);
    expect(covers(c)).toBe(true);
    const b = photoBox(win, img, c);
    expect(b.h).toBeCloseTo(62, 9);
  });

  it("panning never uncovers the window", () => {
    let c = clampCrop(DEFAULT_CROP, win, img);
    c = panBy(c, win, img, 500, -500);
    expect(covers(c)).toBe(true);
    c = panBy(c, win, img, -900, 900);
    expect(covers(c)).toBe(true);
  });

  it("zooming keeps the point under the fingers still", () => {
    const c0 = clampCrop({ ...DEFAULT_CROP, zoom: 2 }, win, img);
    const c1 = zoomAt(c0, win, img, 1.5, 30, 20);
    const at = (c: typeof c0) => {
      const b = photoBox(win, img, c);
      return { u: (30 - b.x) / b.w, v: (20 - b.y) / b.h };
    };
    expect(at(c1).u).toBeCloseTo(at(c0).u, 9);
    expect(at(c1).v).toBeCloseTo(at(c0).v, 9);
  });

  it("whole photo fits inside, and toggles back", () => {
    const c = toggleWhole(clampCrop(DEFAULT_CROP, win, img), win, img);
    expect(c.zoom).toBeCloseTo(minZoom(win, img, 0), 9);
    const b = photoBox(win, img, c);
    expect(b.w).toBeLessThanOrEqual(win.w + 1e-9);
    expect(b.h).toBeLessThanOrEqual(win.h + 1e-9);
    expect(toggleWhole(c, win, img).zoom).toBe(1);
  });

  it("turning four times returns to the start", () => {
    let c = clampCrop({ ...DEFAULT_CROP, zoom: 1.5, cx: 0.4, cy: 0.6 }, win, img);
    const start = c;
    for (let i = 0; i < 4; i++) {
      c = rotateCrop(c, win, img);
      expect(covers(c)).toBe(true);
    }
    expect(c.rotation).toBe(0);
    expect(c.cx).toBeCloseTo(start.cx, 6);
    expect(c.cy).toBeCloseTo(start.cy, 6);
  });

  it("reports print resolution", () => {
    const c = clampCrop(DEFAULT_CROP, win, img);
    // A landscape photo in a tall window: its 3024 px height spans the 62 mm window height.
    expect(effectivePpi(win, img, c)).toBeCloseTo(3024 / (62 / 25.4), 6);
  });
});

describe("full-bleed framing", () => {
  it("frames borderless photos against the bleed, so they reach past every cut line", async () => {
    const { cropArea, formatOf, BLEED } = await import("../src/lib/formats");
    const f = formatOf("wallet");
    const area = cropArea(f);
    for (const photo of [{ w: 4032, h: 3024 }, { w: 3024, h: 4032 }]) {
      const b = photoBox(area, photo, clampCrop(DEFAULT_CROP, area, photo));
      // Photo box is in crop-area coordinates; convert to the card's frame.
      expect(area.x + b.x).toBeLessThanOrEqual(-BLEED + 1e-9);
      expect(area.y + b.y).toBeLessThanOrEqual(-BLEED + 1e-9);
      expect(area.x + b.x + b.w).toBeGreaterThanOrEqual(f.w + BLEED - 1e-9);
      expect(area.y + b.y + b.h).toBeGreaterThanOrEqual(f.h + BLEED - 1e-9);
    }
  });
});
