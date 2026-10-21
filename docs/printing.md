# Printing

Last verified: 2026-10-20 against Epson's ET-2850 documentation.

## Tested setup

| | |
|---|---|
| Printer | Epson EcoTank ET-2850, queue **EPSON ET-2850 (Epson driver)** on the Mac. The AirPrint queue (no "Epson driver" in the name) gives worse color. |
| Photo paper | Canon Glossy Photo Paper "Everyday Use" GP-701, 8.5 × 11 in |
| Plain paper | Hammermill Premium Color 28 lb, for test prints |
| Frames | BESCRCL 8 × 10 picture frames, black, sold as a 5 pack; they take an 8 × 10 print with no mat |

The ET-2850 feeds from the rear: load paper **printable (shiny) side up**, short edge first. When the printer asks, choose Letter and the matching paper type.

## Dialog settings

Open the saved PDF in Preview and press ⌘P.

| Setting | Glossy photo paper | Plain paper (test) |
|---|---|---|
| Printer | EPSON ET-2850 (Epson driver) | same |
| Paper Size | US Letter | same |
| Scale | **100%** | **100%** |
| Print Settings, Media Type | Photo Paper Glossy | Plain Paper / Bright White Paper |
| Print Settings, Print Quality | High Quality | Normal |
| Color Matching | EPSON Color Controls | same |
| Color Options, Mode | EPSON Standard (sRGB) | same |

"Scale to Fit" shrinks the page into the printer's margins, so every card comes out about 3% small. The PDF also asks viewers not to scale (`PrintScaling None`), but Preview's dialog setting wins, so check it.

The Canon paper is not an Epson paper; "Photo Paper Glossy" is the closest Epson media type. If prints look too dark or bleed, try "Premium Photo Paper Glossy". Glossy prints need about 10 minutes to dry before cutting.

## Checking the size

The first time, print on plain paper and measure one card with a ruler. An Instax Mini card is 54 × 86 mm (2⅛ × 3⅜ in). The print panel shows the expected size for the chosen format.

Before every release, the exported PDFs are measured automatically (see [architecture.md](architecture.md#verification)). On 2026-10-20 every card on the Instax Mini, Polaroid, Instax Wide and Polaroid Go sheets measured within 0.09 mm of its true size. On 2026-10-21 the Wallet, 4 × 6 and 8 × 10 cards measured exactly their true size at 600 dpi, with the photo running at least 1 mm past every outside cut line and no white paper in the gaps between cards.

## Framing an 8 × 10

The 8 × 10 size prints one photo per Letter sheet with cut lines at exactly 8 × 10 in; the photo runs 1 mm past them so a slightly-off cut never shows white. Trim on the lines and the print drops into an 8 × 10 frame with no mat. A frame's lip covers a little of each edge, so keep faces and text a few millimetres in from the cut lines. For a frame hung sideways, turn the photo in the close-up (R) so it fills the card lying down.

## Resolution

Photos are sent at 360 pixels per inch, the resolution Epson drivers work at. Captions are drawn at 1200 ppi. A photo warns as **may look a little soft** below 180 ppi at its printed size, and **will look blurry** below 110 ppi.
