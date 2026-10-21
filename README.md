# Print Sheets

Print your photos as instant-film-style prints, or plain photo prints up to 8 × 10, at home. Pick a size, drop in photos, frame each one by dragging and pinching, write a caption on the white strip, and save a PDF that prints every card at its true size on US Letter paper.

Tested with:

| | |
|---|---|
| Printer | Epson EcoTank ET-2850, Epson's own macOS driver |
| Photo paper | Canon GP-701 glossy, 8.5 × 11 in |
| Plain paper | Hammermill Premium Color 28 lb, for test prints |
| Frames | BESCRCL 8 × 10 black picture frames (no mat) |

Any printer that prints US Letter at 100% scale should work; the printing guide uses the Epson driver's wording.

## Use it

Download **Print-Sheets.html** from the [latest release](https://github.com/nsoliven/print-sheets/releases/latest) and double-click it. It opens in your browser and works offline. Safari is best on a Mac because it can open iPhone HEIC photos; Chrome works too.

1. **Add photos.** Drop them anywhere on the window, or press Add photos.
2. **Frame them.** Drag a photo to move it, pinch or ⌘-scroll to zoom. Double-click for a close-up with a zoom slider, and the hidden part of the photo shown around the card while you frame it.
3. **Write captions.** Click the white strip under a photo and type.
4. **Print.** Press Print, pick the sheet and paper, and save the PDF. Open it in Preview and match the settings the panel lists. The one that matters most: **Scale 100%**.

Everything is undoable (⌘Z, ⇧⌘Z). Your work is kept in the browser, so closing the window loses nothing.

## Sizes

| Size | Card | Photo | Per sheet |
|---|---|---|---|
| Instax Mini | 54 × 86 mm | 46 × 62 mm | 11 |
| Instax Square | 72 × 86 mm | 62 × 62 mm | 6 |
| Instax Wide | 108 × 86 mm | 99 × 62 mm | 5 |
| Polaroid | 88 × 107 mm | 79 × 79 mm | 5 |
| Polaroid Go | 53.9 × 66.6 mm | 46 × 47 mm | 15 |
| Wallet | 2½ × 3½ in | full card | 9 |
| 4 × 6 photo | 4 × 6 in | full card | 3 |
| 8 × 10 photo | 8 × 10 in | full card | 1 |

Some cards are turned sideways on the sheet when that fits more; they are upright once cut. See [docs/sizes-and-layout.md](docs/sizes-and-layout.md).

## Privacy

Photos never leave the computer. The built app is one HTML file with a Content Security Policy that blocks every network request, and it has no server. Photos and the current session are stored in the browser's own storage on this Mac.

## Develop

```bash
bun install
bun run dev        # http://127.0.0.1:47315
bun run test       # unit tests
bun run build      # dist/index.html, the whole app in one file
bun run e2e        # drives the built app in Chromium and saves PDFs to out/
bun run measure out/measure-instax-mini.pdf instax-mini
```

More in [docs/](docs/README.md).
