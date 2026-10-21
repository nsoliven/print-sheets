# Print Sheets Agent Guidelines

## Scope

A local, single-file web app that lays out photos as instant-film-style prints on US Letter paper and exports print-ready PDFs at true size. The reference setup is an Epson ET-2850 (Epson driver) on macOS, Canon GP-701 glossy and Hammermill 28 lb plain paper, and BESCRCL 8 × 10 frames.

## Repository Map

- `src/lib/`: the model, with no React. Sizes (`formats.ts`), sheet packing (`layout.ts`), crop math (`crop.ts`), captions, undo history (`store.ts`), edits (`session.ts`), photo import, browser storage, PDF export (`pdf.ts`), paper and printer guidance (`paper.ts`).
- `src/components/`: the interface. The sheet and cards are SVG in millimetre units, so the screen preview and the PDF share one geometry.
- `src/assets/fonts/`: Caveat Medium (OFL), instanced from the variable font and subset to Latin.
- `tests/`: Vitest unit tests for layout, crop and history.
- `scripts/e2e.mjs`: drives the built app in headless Chromium and saves real PDFs. `scripts/measure.mjs`: rasterises a PDF at 600 dpi and measures every card independently of the app's layout code.
- `docs/`: design notes, printing guidance, sizes, architecture.

## Hard Rules

- Photos must never leave the computer. No network requests, analytics, CDNs, or remote fonts. The production build carries a CSP that blocks all network access; keep it, and keep every asset inlined.
- Print geometry is the product. Any change to `formats.ts`, `layout.ts`, `crop.ts` or `pdf.ts` must pass `bun run test`, then `bun run build && bun run e2e`, then `bun run measure` on each `out/measure-*.pdf` with every card within 0.15 mm.
- The screen must show exactly what prints. Sheet and close-up rendering and the PDF use the same layout, crop and caption-fit functions; don't fork them.
- Captions use Caveat. The interface uses the system font only.
- Printer instructions must match the real Epson macOS driver wording (see `docs/printing.md`). Verify against Epson's ET-2850 documentation before changing them.

## Working Rules

- Plain words in the interface, no jargon. Warn before something prints badly (blurry photo, caption too long) instead of after.
- Every document change goes through `docStore` so undo and redo keep working. Drags and pinches are one undo step (`begin`, `live`, `end`).
- Keep rarely used options in the ⋯ menu. The primary button is always the one next step.
- Dev and preview servers bind to `127.0.0.1` only.
- Do not commit `dist/`, `out/`, or personal photos. Test photos live outside the repo.
- This repository is public. Keep personal details out of code, docs, commits and PRs: no home paths, hostnames, private repos or personal notes. Name hardware and paper only as a tested setup.

## Verification

```bash
bun run typecheck
bun run test
bun run build
bun run e2e -- --photos /path/to/sample/photos
for f in instax-mini polaroid instax-wide polaroid-go wallet photo-4x6 photo-8x10; do bun run measure out/measure-$f.pdf $f; done
git diff --check
```

Look at the screenshots in `out/` before calling interface work done.
