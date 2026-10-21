# Sizes and layout

## Sizes

Every size is measured on the card held upright. The photo window sits centred left to right; the wide strip below it is for the caption.

| Size | Card (mm) | Photo (mm) | Top border (mm) | Per sheet |
|---|---|---|---|---|
| Instax Mini | 54 × 86 | 46 × 62 | 7 | 11 |
| Instax Square | 72 × 86 | 62 × 62 | 7 | 6 |
| Instax Wide | 108 × 86 | 99 × 62 | 7 | 5 |
| Polaroid (600, i-Type, SX-70) | 88 × 107 | 79 × 79 | 6 | 5 |
| Polaroid Go | 53.9 × 66.6 | 46 × 47 | 5 | 15 |
| Wallet | 63.5 × 88.9 | full card | | 9 |
| 4 × 6 photo | 101.6 × 152.4 | full card | | 3 |
| 8 × 10 photo | 203.2 × 254 | full card | | 1 |

Card and photo sizes are Fujifilm's and Polaroid's published film sizes. Border placement follows measured film; Fujifilm's own spec rounds the Mini and Wide to 85 mm tall.

## Packing a sheet

`src/lib/layout.ts` packs US Letter (215.9 × 279.4 mm) with at least 3.5 mm of margin: the ET-2850 can't print within 3 mm of the edge, plus half a millimetre for paper skew.

It tries plain grids in both directions, and also splits the page into a block of upright cards plus a block of sideways ones (two levels deep). Every split is a straight cut across the whole piece, so the sheet can always be cut with a paper trimmer or straight scissor cuts and never needs a cut that stops partway.

That is how an Instax Mini sheet fits 11 instead of the usual 9 or 10: a column of 5 sideways cards beside a 2 × 3 block of upright ones. To cut it: one long cut between the two blocks, then straight across each block.

Ties prefer fewer blocks, then more upright cards. The whole layout is centred on the page.

## Cut lines and bleed

Instant-film cards share their edges with no gap, so one cut separates two cards and a slightly-off cut only nibbles white frame. Cut lines are 0.3 pt light grey on each card edge; turn them off in the ⋯ menu.

Full-bleed sizes (Wallet, 4 × 6, 8 × 10) have a 2 mm gap, and each photo runs 1 mm past its cut line into it, so a slightly-off cut still lands on the photo instead of white paper. Bleed stops at the printable edge of the page.
