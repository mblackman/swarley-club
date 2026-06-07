// Gallery image pipeline: turn full-resolution originals into web-optimized,
// responsively-sized, multi-format images for the memorial gallery — and wire
// them into the site automatically.
//
// For every source image it emits, into page/images/gallery/:
//   <slug>.avif / .webp / .jpg          full size  (long edge <= 1600px) — for the lightbox
//   <slug>-thumb.avif / .webp / .jpg    thumbnail  (long edge <=  600px) — for the grid
// Metadata is stripped and EXIF orientation baked in.
//
// It then writes page/images/gallery/manifest.js, which sets
//   window.SWARLEY_GALLERY = [ ...entries... ]
// The gallery page and the homepage load that file, so new photos go live with
// NO copy-paste and NO code edits — just drop a file and re-run.
//
// Re-runs are cheap and safe:
//   • Already-processed, unchanged sources are SKIPPED (source mtime check).
//   • alt/caption text lives in scripts/captions.json and is PRESERVED across
//     runs. Edit that file to label photos; re-running never clobbers it.
//
// Usage:
//   1. Put originals (any size, jpg/png/heic/webp) in  scripts/source-photos/
//   2. npm run gallery          (from scripts/)
//   3. (optional) edit scripts/captions.json to add alt/caption, re-run.
//
// Optional args:  node optimize-gallery.mjs [sourceDir] [outDir]
//   --force   reprocess every source even if outputs are current
import sharp from "sharp";
import { readdir, mkdir, stat, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const FORCE = process.argv.includes("--force");
const SRC = path.resolve(args[0] || path.join(here, "source-photos"));
const OUT = path.resolve(args[1] || path.join(root, "page", "images", "gallery"));
const OUT_REL = path.relative(path.join(root, "page"), OUT).replaceAll(path.sep, "/");
const CAPTIONS_FILE = path.join(here, "captions.json");
const MANIFEST_FILE = path.join(OUT, "manifest.js");

const FULL_EDGE = 1600;
const THUMB_EDGE = 600;
const EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic", ".heif", ".avif", ".gif"]);
const VARIANTS = ["", "-thumb"];
const FORMATS = [".avif", ".webp", ".jpg"];

function slugify(name) {
  return name.toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "photo";
}
const kb = (b) => (b / 1024).toFixed(0) + " KB";

async function mtime(p) { try { return (await stat(p)).mtimeMs; } catch { return -Infinity; } }
async function exists(p) { try { await stat(p); return true; } catch { return false; } }

// Up to date when every output variant exists and is newer than the source.
async function isCurrent(base, srcPath) {
  const srcM = await mtime(srcPath);
  for (const v of VARIANTS) for (const f of FORMATS) {
    const out = path.join(OUT, base + v + f);
    if (!(await exists(out)) || (await mtime(out)) < srcM) return false;
  }
  return true;
}

async function emit(input, base, edge, suffix) {
  const img = sharp(input).rotate().resize({
    width: edge, height: edge, fit: "inside", withoutEnlargement: true,
  });
  const stem = path.join(OUT, base + suffix);
  await Promise.all([
    img.clone().avif({ quality: 50, effort: 4 }).toFile(stem + ".avif"),
    img.clone().webp({ quality: 78 }).toFile(stem + ".webp"),
    img.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(stem + ".jpg"),
  ]);
}

async function outputBytes(base) {
  let total = 0;
  for (const v of VARIANTS) for (const f of FORMATS) {
    try { total += (await stat(path.join(OUT, base + v + f))).size; } catch {}
  }
  return total;
}

// Full-size dimensions for the manifest (read from output when skipping).
async function fullDims(base) {
  const m = await sharp(path.join(OUT, base + ".jpg")).metadata();
  return { w: m.width, h: m.height };
}

async function readJson(p, fallback) {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return fallback; }
}

console.log(`Source : ${SRC}`);
console.log(`Output : ${OUT}\n`);

let files;
try {
  files = (await readdir(SRC)).filter((f) => EXTS.has(path.extname(f).toLowerCase())).sort();
} catch {
  console.error(`No source directory at ${SRC}\nCreate it and add your photos, then re-run.`);
  process.exit(1);
}
if (!files.length) { console.error("No images found in the source directory."); process.exit(1); }

await mkdir(OUT, { recursive: true });
const captions = await readJson(CAPTIONS_FILE, {}); // slug -> { alt, caption }

const entries = [];
let srcTotal = 0, outTotal = 0, processed = 0, skipped = 0;
for (const f of files) {
  const input = path.join(SRC, f);
  const base = slugify(f);
  try {
    const current = !FORCE && (await isCurrent(base, input));
    if (current) {
      skipped++;
    } else {
      await emit(input, base, FULL_EDGE, "");
      await emit(input, base, THUMB_EDGE, "-thumb");
      processed++;
    }
    const { w, h } = await fullDims(base);
    const out = await outputBytes(base);
    const src = (await stat(input)).size;
    srcTotal += src; outTotal += out;

    // Ensure a captions entry exists; never overwrite existing text.
    if (!captions[base]) captions[base] = { alt: "Swarley", caption: "" };
    const { alt, caption } = captions[base];
    entries.push({ base: `${OUT_REL}/${base}`, w, h, alt, caption });

    const tag = current ? "•" : "✓";
    console.log(`  ${tag} ${f.padEnd(34)} ${kb(src).padStart(9)} → ${kb(out).padStart(9)}  (${w}×${h})${current ? "  skip" : ""}`);
  } catch (e) {
    console.log(`  ✗ ${f} — ${e.message}`);
  }
}

// Persist captions (sorted) so the file stays tidy and diffs are stable.
const sortedCaptions = Object.fromEntries(Object.keys(captions).sort().map((k) => [k, captions[k]]));
await writeFile(CAPTIONS_FILE, JSON.stringify(sortedCaptions, null, 2) + "\n");

// Write the generated manifest the site loads at runtime.
entries.sort((a, b) => a.base.localeCompare(b.base));
const body = entries.map((e) =>
  `  { base: ${JSON.stringify(e.base)}, ext: "jpg", webp: true, avif: true, thumb: true, ` +
  `w: ${e.w}, h: ${e.h}, alt: ${JSON.stringify(e.alt)}, caption: ${JSON.stringify(e.caption)} },`
).join("\n");
const manifest =
  `// AUTO-GENERATED by scripts/optimize-gallery.mjs — do not edit by hand.\n` +
  `// Edit captions in scripts/captions.json and re-run \`npm run gallery\`.\n` +
  `window.SWARLEY_GALLERY = [\n${body}\n];\n`;
await writeFile(MANIFEST_FILE, manifest);

console.log(`\n${entries.length} photos (${processed} processed, ${skipped} skipped) · originals ${kb(srcTotal)} → web ${kb(outTotal)}`);
console.log(`Wrote ${path.relative(root, MANIFEST_FILE)} and updated ${path.relative(root, CAPTIONS_FILE)}.`);
console.log(`Live on next deploy — no code edits needed. Add alt/caption text in captions.json.\n`);
