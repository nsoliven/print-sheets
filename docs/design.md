# Design

The interface follows a short list of principles. This is how each one shows up.

**Show exactly what will print.** The sheet on screen is an SVG drawn in millimetres from the same layout, crop and caption functions the PDF uses. Cards that print sideways appear sideways. Cut lines, bleed and captions are where they will be on paper. Empty spots are the only thing drawn on screen that never prints.

**One obvious next step.** The primary button is *Add photos* until there is a photo, then *Print*. Selecting a print shows one small toolbar. The print panel reads top to bottom: sheet, paper, Save PDF, then the dialog settings, which get highlighted once the PDF is saved.

**Good defaults.** Instax Mini, white frame, cut lines on, glossy paper, all sheets. Photos fill the window centred. The last session comes back on reload.

**Touch things directly.** Drag the photo to frame it. Grab a print by its white border (or hold Option on a borderless print) and drop it on another spot to move it, which is how you choose what goes on each sheet. Pinch on a trackpad (Safari gesture events, or ctrl-wheel in Chrome) or with two fingers on a touch screen. Click the white strip to write on it. Drop a photo on a print to replace it. The close-up shows the part of the photo outside the window, faintly, while you frame it, and a filmstrip of every print (grouped by sheet) to jump between them.

**Plain words, early warnings.** "May look a little soft", "will look blurry", "caption too long to fit", shown on the card as a dot, as a chip in the toolbar while you work, in the close-up as a sentence, and in the print panel before saving. The chip and the panel's Show button open the print in question. Until a plain-paper test has been saved once, the print panel suggests one before using photo paper.

**Calm and clean.** The system font for the interface; Caveat only on the prints themselves. A warm neutral background so the white paper reads as paper. One accent color, used for selection and focus. Light and dark appearance follow the Mac.

**Fast and forgiving.** Every change is undoable (⌘Z, ⇧⌘Z, or the toolbar). A whole drag or pinch is one step; quick typing merges into one step. Removing a print shows a toast with Undo.

## Keyboard

| Key | Action |
|---|---|
| ⌘O | Add photos |
| ⌘P | Print |
| ⌘Z, ⇧⌘Z | Undo, redo |
| Arrows | Select the previous or next print |
| Return | Close-up of the selected print |
| R | Turn the photo a quarter turn |
| ⌘D | Copy the selected print |
| Delete | Remove the selected print |
| Esc | Deselect, or close the close-up or panel |

## Second pass

After the first working version, the app was compared against two other apps by the same author as a quality bar: a homelab dashboard and [Camera Toolkit](https://github.com/nsoliven/camera-toolkit), a native macOS photo app. What changed as a result, on 2026-10-20:

- Prints can be moved between spots and sheets by dragging, as Camera Toolkit sorts by drag and drop. Before, you could not choose which photo went on which sheet.
- The close-up gained a filmstrip, like Camera Toolkit's preview.
- Problems surface in the toolbar while you edit, like the dashboard's "Needs attention", not only at print time.
- Every control has a tooltip, with its shortcut where it has one.
- A first-run nudge to test on plain paper, in the spirit of Camera Toolkit's guided setup.
- Saving shows a progress bar; the app has a favicon.

## Design pass

On 2026-10-21 the interface was reviewed screen by screen against contrast, hierarchy, alignment, proximity, consistency, balance, white space and unity, with ideas taken from tools that do this well: photo editors frame on a dark backdrop, framing services show the frame before you commit, and print modules make the page feel like paper. What changed:

- **Close-up is a dark room.** The print is the brightest thing on screen. The rest of the photo shows faintly around the card while you frame, and always behind it, so the white border looks like paper. A rule-of-thirds grid appears while you drag. Zoom, Turn and Fill sit in one toolbar.
- **8 × 10 shows the frame.** A shaded edge and dashed line mark about where an 8 × 10 frame's lip covers the print (¼ in, the usual overlap). It is a guide on screen only.
- **Empty spots are outlines of the card**, window included, instead of dashed boxes. The next spot shows a plus.
- **First run tells the story**: a fan of sample prints in the chosen size, one sentence on what you'll get, the button, and three steps.
- **The print dialog is a checklist** to tick off while it's open, with Scale marked as the setting that matters most. Paper choices have a small swatch; "All sheets" is drawn as a stack.
- **One system.** One accent (blue) for selection and focus, warm neutrals everywhere else, the switch in ink rather than green. Paper sits on the desk with a contact shadow and a long soft one, under a faint pool of light.
- Motion is short and settles: sheets and new prints fade in, the sample prints fan out, the toolbar springs up. Reduced motion turns it all off.
