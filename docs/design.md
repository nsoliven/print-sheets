# Design

The interface follows the owner's principles. This is how each one shows up.

**Show exactly what will print.** The sheet on screen is an SVG drawn in millimetres from the same layout, crop and caption functions the PDF uses. Cards that print sideways appear sideways. Cut lines, bleed and captions are where they will be on paper. Empty spots are the only thing drawn on screen that never prints.

**One obvious next step.** The primary button is *Add photos* until there is a photo, then *Print*. Selecting a print shows one small toolbar. The print panel reads top to bottom: sheet, paper, Save PDF, then the dialog settings, which get highlighted once the PDF is saved.

**Good defaults.** Instax Mini, white frame, cut lines on, glossy paper, all sheets. Photos fill the window centred. The last session comes back on reload.

**Touch things directly.** Drag the photo to frame it. Pinch on a trackpad (Safari gesture events, or ctrl-wheel in Chrome) or with two fingers on a touch screen. Click the white strip to write on it. Drop a photo on a print to replace it. The close-up shows the part of the photo outside the window, faintly, while you frame it.

**Plain words, early warnings.** "May look a little soft", "will look blurry", "caption too long to fit", shown on the card as a dot, in the close-up as a sentence, and in the print panel before saving, with a Show button that opens the print in question.

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
