import { describe, expect, it } from "vitest";
import { FORMATS, formatOf } from "../src/lib/formats";
import { MIN_MARGIN, PAGE, layoutFor } from "../src/lib/layout";

const EXPECTED: Record<string, number> = {
  "instax-mini": 11,
  "instax-square": 6,
  "instax-wide": 5,
  polaroid: 5,
  "polaroid-go": 15,
  wallet: 9,
  "photo-4x6": 3,
  "photo-8x10": 1,
};

describe("sheet layout", () => {
  for (const f of FORMATS) {
    const { slots, gap } = layoutFor(f);

    it(`${f.name}: fits ${EXPECTED[f.id]} per sheet`, () => {
      expect(slots.length).toBe(EXPECTED[f.id]);
    });

    it(`${f.name}: every card stays inside the printable area at its true size`, () => {
      for (const s of slots) {
        expect(s.x).toBeGreaterThanOrEqual(MIN_MARGIN - 1e-9);
        expect(s.y).toBeGreaterThanOrEqual(MIN_MARGIN - 1e-9);
        expect(s.x + s.w).toBeLessThanOrEqual(PAGE.w - MIN_MARGIN + 1e-9);
        expect(s.y + s.h).toBeLessThanOrEqual(PAGE.h - MIN_MARGIN + 1e-9);
        const [w, h] = s.rotated ? [s.h, s.w] : [s.w, s.h];
        expect(w).toBeCloseTo(f.w, 9);
        expect(h).toBeCloseTo(f.h, 9);
      }
    });

    it(`${f.name}: cards never overlap and keep the expected gap`, () => {
      for (let i = 0; i < slots.length; i++)
        for (let j = i + 1; j < slots.length; j++) {
          const a = slots[i];
          const b = slots[j];
          const sepX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
          const sepY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
          expect(Math.max(sepX, sepY)).toBeGreaterThanOrEqual(gap - 1e-9);
        }
    });

    it(`${f.name}: the layout is centred on the page`, () => {
      const minX = Math.min(...slots.map((s) => s.x));
      const maxX = Math.max(...slots.map((s) => s.x + s.w));
      const minY = Math.min(...slots.map((s) => s.y));
      const maxY = Math.max(...slots.map((s) => s.y + s.h));
      expect(minX).toBeCloseTo(PAGE.w - maxX, 9);
      expect(minY).toBeCloseTo(PAGE.h - maxY, 9);
    });
  }

  it("full-bleed photos bleed only into space that is cut away", () => {
    for (const s of layoutFor(formatOf("wallet")).slots) {
      for (const v of Object.values(s.bleed)) expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
    for (const s of layoutFor(formatOf("instax-mini")).slots) expect(Object.values(s.bleed)).toEqual([0, 0, 0, 0]);
  });
});
