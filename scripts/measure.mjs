#!/usr/bin/env node
// Measures the cards on an exported sheet, independently of the app's own layout code.
// Rasterises the PDF at 600 dpi with poppler, finds each photo window as a block of colour,
// then walks outwards to the grey cut lines to get the whole card. Full-bleed photos run past
// their card, so there the cut line is found inside the photo instead, and the bleed is checked.
//
//   node scripts/measure.mjs out/measure-instax-mini.pdf instax-mini
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FORMATS } from "../src/lib/formats.ts";

const [pdf, formatId] = process.argv.slice(2);
const f = FORMATS.find((x) => x.id === formatId);
if (!pdf || !f) {
  console.error(`usage: measure.mjs FILE.pdf FORMAT\nformats: ${FORMATS.map((x) => x.id).join(", ")}`);
  process.exit(2);
}

const DPI = 600;
const PX_PER_MM = DPI / 25.4;
const TOLERANCE_MM = 0.15;

const info = execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
const pageSize = info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/);
console.log(`Page: ${pageSize[1]} × ${pageSize[2]} pt (US Letter is 612 × 792)`);

const dir = mkdtempSync(join(tmpdir(), "measure-"));
execFileSync("pdftoppm", ["-gray", "-r", String(DPI), "-f", "1", "-l", "1", pdf, join(dir, "p")]);
const file = execFileSync("ls", [dir], { encoding: "utf8" }).trim().split("\n")[0];
const buf = readFileSync(join(dir, file));
rmSync(dir, { recursive: true });

// Parse a binary PGM (P5).
const header = buf.toString("latin1", 0, 64).split(/\s+/);
const W = +header[1];
const H = +header[2];
const offset = buf.indexOf(Buffer.from(header[3] + "\n", "latin1"), header[0].length) + header[3].length + 1;
const px = (x, y) => buf[offset + y * W + x];

const DARK = 170; // photo pixels; cut lines and the white frame are lighter than this
const seen = new Uint8Array(W * H);
const windows = [];
for (let y = 0; y < H; y += 4)
  for (let x = 0; x < W; x += 4) {
    if (seen[y * W + x] || px(x, y) > DARK) continue;
    // Flood fill on a coarse grid is plenty to find the block, then refine its edges exactly.
    const stack = [[x, y]];
    let x0 = x, x1 = x, y0 = y, y1 = y, n = 0;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const k = cy * W + cx;
      if (seen[k] || px(cx, cy) > DARK) continue;
      seen[k] = 1;
      n++;
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
      stack.push([cx + 4, cy], [cx - 4, cy], [cx, cy + 4], [cx, cy - 4]);
    }
    if (n > 2000) windows.push({ x0, x1, y0, y1 });
  }
// The coarse fill can reach part of a block a second time past a light cut line; keep the outer block.
const inside = (a, b) => a !== b && a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
windows.splice(0, windows.length, ...windows.filter((a) => !windows.some((b) => inside(a, b))));

// Exact edge: where brightness crosses from photo to paper, interpolated between pixel centres.
function edge(x, y, dx, dy, T = 200) {
  let prev = px(x, y);
  for (let i = 0; i < 60; i++) {
    const nx = x + dx;
    const ny = y + dy;
    const v = px(nx, ny);
    if (v > T) return (dx ? x : y) + 0.5 + (dx + dy) * ((T - prev) / (v - prev));
    prev = v;
    x = nx;
    y = ny;
  }
  return NaN;
}
// Centre of the next grey cut line outward from (x, y).
function line(x, y, dx, dy) {
  for (let i = 0; i < 40 * PX_PER_MM; i++) {
    x += dx; y += dy;
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    if (px(x, y) < 245) {
      let sum = 0, wsum = 0;
      for (let j = 0; j < 12; j++) {
        const w = 255 - px(x + dx * j, y + dy * j);
        if (w < 8 && j > 0) break;
        sum += w * j; wsum += w;
      }
      return (dx ? x : y) + (dx + dy) * (sum / wsum);
    }
  }
  return null;
}

// Full-bleed photos run past their cut lines into the gap, so neighbouring photos touch and one
// block of colour can hold several cards. Split it the way you would cut it: find a cut line that
// runs the whole length of the piece, cut there, and repeat until each piece is one card.
// A cut line drawn over a photo is a thin ridge, lighter than the photo on both sides of it.
const ridge = (x, y, dx, dy) => px(x, y) - Math.max(px(x - 6 * dx, y - 6 * dy), px(x + 6 * dx, y + 6 * dy)) > 20;

/** Centres of the cut lines that run across the whole piece, along x (vertical lines) or y. */
function fullLines(r, alongX) {
  const [a0, a1, b0, b1] = alongX ? [r.x0, r.x1, r.y0, r.y1] : [r.y0, r.y1, r.x0, r.x1];
  const lines = [];
  let cur = null;
  for (let a = a0 + 8; a <= a1 - 8; a++) {
    let hit = 0, n = 0;
    for (let b = b0 + 8; b <= b1 - 8; b += 5, n++) if (alongX ? ridge(a, b, 1, 0) : ridge(b, a, 0, 1)) hit++;
    const frac = hit / n;
    if (frac < 0.85) continue;
    if (cur && a - cur.last <= 2) Object.assign(cur, { s: cur.s + a * frac, w: cur.w + frac, last: a });
    else lines.push((cur = { s: a * frac, w: frac, last: a }));
  }
  return lines.map((l) => l.s / l.w + 0.5);
}

const GAP_MAX = 5 * PX_PER_MM; // lines closer than this are the two sides of one gap
const cards = [];
let whiteGaps = 0;
function split(r, depth = 0) {
  const xs = fullLines(r, true);
  const ys = fullLines(r, false);
  if (xs.length === 2 && ys.length === 2) return cards.push({ x0: xs[0], x1: xs[1], y0: ys[0], y1: ys[1] });
  const [ls, alongX] = xs.length > 2 ? [xs, true] : [ys, false];
  if (ls.length <= 2 || depth > 6) return cards.push(null);
  for (let i = 0; i + 1 < ls.length; i++) {
    const span = ls[i + 1] - ls[i];
    if (span <= GAP_MAX) {
      // The gap between two cards should be all photo, with no white sliver to show after cutting.
      const mid = Math.round((ls[i] + ls[i + 1]) / 2);
      const [b0, b1] = alongX ? [r.y0, r.y1] : [r.x0, r.x1];
      let white = 0, n = 0;
      for (let b = b0 + 40; b <= b1 - 40; b += 3, n++) if ((alongX ? px(mid, b) : px(b, mid)) > 235) white++;
      if (white / n > 0.05) whiteGaps++;
      continue;
    }
    const a0 = Math.floor(ls[i]) - 12;
    const a1 = Math.ceil(ls[i + 1]) + 12;
    split(alongX ? { ...r, x0: a0, x1: a1 } : { ...r, y0: a0, y1: a1 }, depth + 1);
  }
}

const mm = (p) => p / PX_PER_MM;
const MIN_BLEED_MM = 0.5;
let worst = 0;
let missing = 0;
let thinBleed = 0;
const rows = [];
const check = (cardW, cardH, photo) => {
  // Cards are never square, so the card's shape says which way it was turned on the sheet.
  const sideways = cardW > cardH !== f.w > f.h;
  const [ew, eh] = sideways ? [f.window.h, f.window.w] : [f.window.w, f.window.h];
  const [cw, ch] = sideways ? [f.h, f.w] : [f.w, f.h];
  const errs = [...(photo ? [photo[0] - ew, photo[1] - eh] : []), cardW - cw, cardH - ch].map(Math.abs);
  if (errs.some(Number.isNaN)) missing++;
  worst = Math.max(worst, ...errs.filter((e) => !Number.isNaN(e)));
  rows.push(
    `${sideways ? "sideways" : "upright "}  ` +
      (photo ? `photo ${photo[0].toFixed(2)} × ${photo[1].toFixed(2)} mm (want ${ew} × ${eh})   ` : "") +
      `card ${cardW.toFixed(2)} × ${cardH.toFixed(2)} mm (want ${cw} × ${ch})`,
  );
};

for (const w of windows.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
  const cx = Math.round((w.x0 + w.x1) / 2);
  const cy = Math.round((w.y0 + w.y1) / 2);
  const left = edge(w.x0 + 2, cy, -1, 0);
  const right = edge(w.x1 - 2, cy, 1, 0);
  const top = edge(cx, w.y0 + 2, 0, -1);
  const bottom = edge(cx, w.y1 - 2, 0, 1);
  if (f.kind === "photo") {
    const before = cards.length;
    split({ x0: Math.floor(left), x1: Math.ceil(right), y0: Math.floor(top), y1: Math.ceil(bottom) });
    const found = cards.slice(before);
    if (found.some((c) => !c)) missing++;
    const ok = found.filter(Boolean);
    for (const c of ok) check(mm(c.x1 - c.x0), mm(c.y1 - c.y0));
    // Around the outside of the block, the photo should still run past the outermost cut lines.
    if (ok.length) {
      const past = [Math.min(...ok.map((c) => c.x0)) - left, right - Math.max(...ok.map((c) => c.x1)), Math.min(...ok.map((c) => c.y0)) - top, bottom - Math.max(...ok.map((c) => c.y1))].map(mm);
      if (past.some((b) => !(b >= MIN_BLEED_MM))) thinBleed++;
      rows.push(`  photo runs past the outer cut lines by ${past.map((b) => b.toFixed(2)).join(" / ")} mm (left / right / top / bottom)`);
    }
    continue;
  }
  const lines = [line(Math.round(left) - 3, cy, -1, 0), line(Math.round(right) + 3, cy, 1, 0), line(cx, Math.round(top) - 3, 0, -1), line(cx, Math.round(bottom) + 3, 0, 1)];
  const cardW = lines[0] != null && lines[1] != null ? mm(lines[1] - lines[0]) : NaN;
  const cardH = lines[2] != null && lines[3] != null ? mm(lines[3] - lines[2]) : NaN;
  check(cardW, cardH, [mm(right - left), mm(bottom - top)]);
}

const count = f.kind === "photo" ? cards.filter(Boolean).length : windows.length;
console.log(`${f.name}: found ${count} cards`);
let k = 0;
rows.forEach((r) => console.log(r.startsWith("  ") ? `      ${r.trim()}` : `  ${String(++k).padStart(2)}. ${r}`));
if (missing) console.log(`${missing} card(s) had a cut line that could not be found.`);
if (thinBleed) console.log(`${thinBleed} block(s) of photo ran less than ${MIN_BLEED_MM} mm past a cut line.`);
if (whiteGaps) console.log(`${whiteGaps} gap(s) between cards show white paper.`);
const ok = count > 0 && worst <= TOLERANCE_MM && !missing && !thinBleed && !whiteGaps;
console.log(`Largest error: ${worst.toFixed(3)} mm (allowed ${TOLERANCE_MM}). ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
