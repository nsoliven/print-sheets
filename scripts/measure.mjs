#!/usr/bin/env node
// Measures the cards on an exported sheet, independently of the app's own layout code.
// Rasterises the PDF at 600 dpi with poppler, finds each photo window as a block of colour,
// then walks outwards to the grey cut lines to get the whole card.
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

const mm = (p) => p / PX_PER_MM;
let worst = 0;
const rows = [];
for (const w of windows.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
  const cx = Math.round((w.x0 + w.x1) / 2);
  const cy = Math.round((w.y0 + w.y1) / 2);
  const left = edge(w.x0 + 2, cy, -1, 0);
  const right = edge(w.x1 - 2, cy, 1, 0);
  const top = edge(cx, w.y0 + 2, 0, -1);
  const bottom = edge(cx, w.y1 - 2, 0, 1);
  const winW = mm(right - left);
  const winH = mm(bottom - top);
  const lines = [line(Math.round(left) - 3, cy, -1, 0), line(Math.round(right) + 3, cy, 1, 0), line(cx, Math.round(top) - 3, 0, -1), line(cx, Math.round(bottom) + 3, 0, 1)];
  const cardW = lines[0] != null && lines[1] != null ? mm(lines[1] - lines[0]) : NaN;
  const cardH = lines[2] != null && lines[3] != null ? mm(lines[3] - lines[2]) : NaN;
  // Cards are never square, so the card's shape says which way it was turned on the sheet.
  const sideways = cardW > cardH !== f.w > f.h;
  const [ew, eh] = sideways ? [f.window.h, f.window.w] : [f.window.w, f.window.h];
  const [cw, ch] = sideways ? [f.h, f.w] : [f.w, f.h];
  const errs = [winW - ew, winH - eh, cardW - cw, cardH - ch].filter((e) => !Number.isNaN(e)).map(Math.abs);
  worst = Math.max(worst, ...errs);
  rows.push(
    `${sideways ? "sideways" : "upright "}  photo ${winW.toFixed(2)} × ${winH.toFixed(2)} mm (want ${ew} × ${eh})   card ${cardW.toFixed(2)} × ${cardH.toFixed(2)} mm (want ${cw} × ${ch})`,
  );
}

console.log(`${f.name}: found ${windows.length} cards`);
rows.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. ${r}`));
const ok = windows.length > 0 && worst <= TOLERANCE_MM;
console.log(`Largest error: ${worst.toFixed(3)} mm (allowed ${TOLERANCE_MM}). ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
