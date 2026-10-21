# Architecture

React, TypeScript and Vite, built into one self-contained HTML file with `vite-plugin-singlefile`. `pdf-lib` writes the PDF. There is no server.

## Model

- **Document** (`store.ts`): size, the ordered list of prints, frame color, cut lines. Undo history holds whole document snapshots; they are small because photos are referenced by id.
- **Print**: a photo id, a crop and a caption. Prints fill sheet spots in order, so the list is the layout.
- **Crop** (`crop.ts`): a quarter-turn rotation, a zoom where 1 just covers the window, and the point of the photo at the window's centre. Clamping keeps the photo covering the window unless you ask for the whole photo.
- **Photos** (`photos.ts`): the original file, kept for export, plus a 2048 px preview for the screen. Browsers apply EXIF orientation when decoding.

## Rendering

The sheet is an SVG with a `viewBox` in millimetres. Each card is drawn upright in its own frame and placed with a matrix from `slotMatrix()`, which is also how the PDF maps card coordinates to the page. Pointer deltas are converted to card millimetres with the inverse screen matrix, so dragging works the same on sideways cards.

## Export

`pdf.ts` builds one Letter page per chosen sheet:

- Each photo window (plus bleed) is drawn to a canvas at 360 ppi from the original file, shrinking in halving steps for quality, turned to match its spot, and embedded as a JPEG.
- Captions are drawn by the browser on a transparent canvas at 1200 ppi and embedded as PNG. That keeps Caveat's handwriting alternates, matches the screen exactly, and still prints symbols or emoji the font lacks.
- Frame colors other than white are filled rectangles; white is the paper.
- Cut lines are 0.3 pt rectangles drawn last.
- The document asks viewers not to scale it when printing.

## Storage

The document and photos are kept in IndexedDB (`persist.ts`), written 400 ms after the last change. Photos no longer used are deleted. Preferences such as the chosen paper are in localStorage.

## Verification

- `tests/`: packing counts, margins, overlap and centring for every size; crop clamping, pinch anchoring, turning and whole-photo; undo grouping.
- `scripts/e2e.mjs`: opens `dist/index.html` from disk in headless Chromium, adds photos, frames one by drag and pinch, writes captions, checks undo and redo, the blurry warning and reload restore, saves PDFs through the print panel, and fails on any network request or console error. Screenshots go to `out/`.
- `scripts/measure.mjs`: rasterises a PDF with poppler at 600 dpi, finds each photo window as a block of color, walks outward to the grey cut lines, and reports every card and photo size in millimetres. Full-bleed photos touch their neighbours through the bleed, so for those it splits each block of photo along cut lines that run its whole length, the way you would cut it, and also checks that the photo runs past the outside lines and that no gap between cards shows white. It does not use the app's layout code, so it checks the geometry independently.
