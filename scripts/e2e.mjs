#!/usr/bin/env node
// Drives the built app in headless Chromium the way a person would: add photos, frame one,
// write captions, save PDFs through the print panel. Also fails if the app tries to reach the network.
//
//   npm run build && node scripts/e2e.mjs [--photos DIR] [--out DIR] [--chromium PATH]
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const root = resolve(import.meta.dirname, "..");
const out = resolve(arg("out", join(root, "out")));
const photosDir = arg("photos");
const exe = arg("chromium", process.env.CHROMIUM ?? "/usr/bin/chromium");
mkdirSync(out, { recursive: true });

const app = join(root, "dist", "index.html");
if (!existsSync(app)) throw new Error("Build first: npm run build");

const browser = await chromium.launch({ executablePath: exe });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await context.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("request", (r) => {
  if (!/^(file|blob|data):/.test(r.url())) problems.push(`network request: ${r.url()}`);
});

// Let entrance animations finish so screenshots show the settled interface.
const shot = async (name) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(out, `${name}.png`) });
};
const step = (s) => console.log(`- ${s}`);

/** Saturated gradient photos with no white in them, so their edges can be measured on the PDF. */
async function syntheticPhotos(n) {
  const blank = await context.newPage();
  const data = await blank.evaluate((n) => {
    const res = [];
    for (let i = 0; i < n; i++) {
      const c = document.createElement("canvas");
      c.width = 2400;
      c.height = 1800;
      const g = c.getContext("2d");
      const grad = g.createLinearGradient(0, 0, 2400, 1800);
      grad.addColorStop(0, `hsl(${(i * 37) % 360} 70% 32%)`);
      grad.addColorStop(1, `hsl(${(i * 37 + 60) % 360} 70% 45%)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 2400, 1800);
      g.fillStyle = "rgba(0,0,0,0.25)";
      for (let x = 0; x < 2400; x += 200) g.fillRect(x, 0, 6, 1800);
      res.push(c.toDataURL("image/jpeg", 0.9).split(",")[1]);
    }
    return res;
  }, n);
  await blank.close();
  return data.map((b64, i) => ({ name: `test-${i + 1}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") }));
}

async function addPhotos(files) {
  await page.setInputFiles('input[type="file"]', files);
  await page.waitForFunction((n) => document.querySelectorAll(".sheet .card image").length >= n, Math.min(files.length, 11));
  await page.waitForTimeout(200);
}

async function chooseFormat(name) {
  await page.click(".picker-button");
  await page.click(`.picker-option:has-text("${name}")`);
}

async function savePdf(file, sheet) {
  await page.click('button:has-text("Print")');
  await page.waitForSelector(".panel");
  if (sheet !== undefined) await page.click(`.sheet-pick:has-text("Sheet ${sheet}")`);
  const [download] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Save PDF")')]);
  await download.saveAs(join(out, file));
  await page.waitForSelector(".saved");
  step(`saved ${file} (suggested name "${download.suggestedFilename()}")`);
}

async function closePanel() {
  await page.keyboard.press("Escape");
  await page.waitForSelector(".panel", { state: "detached" });
}

async function removeAll() {
  await page.click('[aria-label="More options"]');
  await page.click('button:has-text("Remove all prints")');
}

await page.goto(pathToFileURL(app).href);
await page.waitForSelector(".empty-call");
step("empty state");
await shot("01-empty");

// 1. Geometry check sheets with synthetic photos.
const synthetic = await syntheticPhotos(15);
for (const [name, file] of [
  ["Instax Mini", "measure-instax-mini.pdf"],
  ["Polaroid", "measure-polaroid.pdf"],
  ["Instax Wide", "measure-instax-wide.pdf"],
  ["Polaroid Go", "measure-polaroid-go.pdf"],
  ["Wallet", "measure-wallet.pdf"],
  ["4 × 6 photo", "measure-photo-4x6.pdf"],
  ["8 × 10 photo", "measure-photo-8x10.pdf"],
]) {
  await chooseFormat(name);
  if (!(await page.$(".sheet .card"))) await addPhotos(synthetic);
  await savePdf(file);
  await closePanel();
}
await removeAll();
await chooseFormat("Instax Mini");

// 2. A real-looking sheet: photos, a framed close-up, captions.
const real = photosDir
  ? readdirSync(photosDir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !f.startsWith("small"))
      .sort()
      .map((f) => join(photosDir, f))
  : synthetic.slice(0, 8);
await addPhotos(real);
step(`added ${real.length} photos`);
await shot("02-sheet");

const captions = ["Lake day ☼", "Sunday market", "the long way home", "Nana's garden", "first snow"];
const cards = await page.$$(".sheet .card");
for (let i = 0; i < captions.length; i++) {
  await cards[i].$eval(".hit-strip", (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await page.waitForSelector(".closeup .caption-input");
  await page.fill(".closeup .caption-input", captions[i]);
  if (i === 0) {
    // Frame the first photo by dragging and pinching it.
    const box = await page.$eval(".closeup .hit-photo", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 10, { steps: 8 });
    await page.mouse.up();
    await page.mouse.move(box.x, box.y);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -60);
    await page.keyboard.up("Control");
    await page.waitForTimeout(450);
    await page.mouse.move(box.x + 10, box.y + 5);
    await shot("03-closeup");
  }
  await page.click('.closeup button:has-text("Done")');
}
step("framed one photo and wrote captions");

// Undo and redo should round-trip the last caption.
await page.keyboard.press("Control+z");
const afterUndo = await page.$$eval(".sheet .card .caption", (t) => t.map((x) => x.textContent));
await page.keyboard.press("Control+Shift+z");
const afterRedo = await page.$$eval(".sheet .card .caption", (t) => t.map((x) => x.textContent));
if (afterUndo.includes("first snow") || !afterRedo.includes("first snow")) problems.push("undo/redo did not round-trip a caption");
else step("undo and redo work");

// Move the first print to the third spot by dragging its white border.
const order = () => page.$$eval(".sheet .card", (cs) => cs.map((c) => c.dataset.printId));
const before0 = await order();
const pointIn = (i, where) =>
  page.$$eval(
    ".sheet .card",
    (cs, [i, where]) => {
      const r = cs[i].querySelector(where === "border" ? ".frame" : ".hit-photo").getBoundingClientRect();
      return where === "border" ? { x: r.x + r.width / 2, y: r.y + 4 } : { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    },
    [i, where],
  );
const from = await pointIn(0, "border");
const to = await pointIn(2, "photo");
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(to.x, to.y, { steps: 12 });
await shot("04a-moving");
await page.mouse.up();
const after0 = await order();
if (after0[2] !== before0[0] || after0[0] !== before0[1]) problems.push("dragging a print's border did not move it");
else step("dragged a print to a new spot");
await page.keyboard.press("Control+z");
if ((await order())[0] !== before0[0]) problems.push("undo did not put the moved print back");

await page.click(".sheet .card:nth-of-type(3) .hit-photo");
await shot("04-selected");
await page.keyboard.press("Escape");

if (photosDir && existsSync(join(photosDir, "small-200.jpg"))) {
  await page.setInputFiles('input[type="file"]', [join(photosDir, "small-200.jpg")]);
  await page.waitForTimeout(500);
  const badges = await page.$$(".badge");
  if (!badges.length) problems.push("a tiny photo got no blurry warning");
  else step("tiny photo is flagged as blurry");
  if (!(await page.$(".attention"))) problems.push("no attention chip for a low-detail photo");
  else {
    await shot("04b-attention");
    await page.click(".attention");
    await page.waitForSelector(".closeup .film");
    await shot("04c-closeup-film");
    await page.click(".film-item:nth-child(2)");
    const shown = await page.$eval(".closeup-nav .tabular", (e) => e.textContent);
    if (!/^2 of/.test(shown.trim())) problems.push(`filmstrip did not jump to print 2 (showing ${shown})`);
    else step("attention chip opens the print; filmstrip jumps between prints");
    await page.click('.closeup button:has-text("Done")');
  }
}

await page.click('button:has-text("Print")');
await page.waitForSelector(".panel");
await shot("05-print-panel");
const [dl] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Save PDF")')]);
await dl.saveAs(join(out, "real-instax-mini.pdf"));
await page.waitForSelector(".saved");
await shot("06-print-saved");
await closePanel();
step("saved real-instax-mini.pdf");

// Reload: the session should come back from the browser's own storage.
const before = await page.$$eval(".sheet .card", (c) => c.length);
await page.reload();
await page.waitForSelector(".sheet");
await page.waitForFunction((n) => document.querySelectorAll(".sheet .card image").length === n, before, { timeout: 10_000 }).catch(() => {});
const after = await page.$$eval(".sheet .card", (c) => c.length);
if (after !== before) problems.push(`reload restored ${after} of ${before} prints`);
else step(`reload kept all ${after} prints`);

await chooseFormat("Polaroid");
await shot("07-polaroid");
await page.click(".picker-button");
await shot("08-picker");
await page.keyboard.press("Escape");
await chooseFormat("8 × 10 photo");
await shot("08b-8x10");
await page.dblclick(".sheet .card .hit-photo");
await page.waitForSelector(".closeup .frame-lip");
await shot("08c-8x10-closeup");
await page.click('.closeup button:has-text("Done")');

await page.emulateMedia({ colorScheme: "dark" });
await shot("09-dark");

await browser.close();
if (problems.length) {
  console.error("\nProblems:\n" + problems.map((p) => `  ${p}`).join("\n"));
  process.exit(1);
}
console.log(`\nAll good. Output in ${out}`);
