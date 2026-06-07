// Optimize the handful of oversized static assets in page/ IN PLACE.
// Re-encodes without changing dimensions: JPEG via mozjpeg, PNG via lossy
// palette quantization (sharp/libvips). Safe to re-run (idempotent-ish).
//
//   node optimize-assets.mjs
//
import sharp from "sharp";
import { stat, rename, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (rel) => path.join(root, "page", rel);

// Each target keeps its current dimensions; only the encoding is improved.
const TARGETS = [
  { file: P("images/preview.jpg"), kind: "jpeg" },
  { file: P("android-chrome-512x512.png"), kind: "png" },
  { file: P("android-chrome-192x192.png"), kind: "png" },
  { file: P("apple-touch-icon.png"), kind: "png" },
];

function kb(bytes) { return (bytes / 1024).toFixed(1) + " KB"; }

async function optimize({ file, kind }) {
  let before;
  try { before = (await stat(file)).size; }
  catch { console.log(`  skip (missing): ${path.basename(file)}`); return; }

  const tmp = file + ".tmp";
  let pipeline = sharp(file).rotate(); // respect EXIF orientation
  if (kind === "jpeg") {
    pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
  } else {
    // Lossy palette quantization — big wins on photographic PNG icons.
    pipeline = pipeline.png({ palette: true, quality: 80, effort: 10, compressionLevel: 9 });
  }
  await pipeline.toFile(tmp);

  const after = (await stat(tmp)).size;
  if (after < before) {
    await rename(tmp, file);
    const pct = (100 * (1 - after / before)).toFixed(0);
    console.log(`  ✓ ${path.basename(file).padEnd(28)} ${kb(before).padStart(10)} → ${kb(after).padStart(10)}  (-${pct}%)`);
  } else {
    await unlink(tmp);
    console.log(`  – ${path.basename(file).padEnd(28)} already optimal (${kb(before)})`);
  }
}

console.log("Optimizing static assets in page/ …");
let total = 0;
for (const t of TARGETS) {
  try { total += (await stat(t.file)).size; } catch {}
}
for (const t of TARGETS) await optimize(t);
let after = 0;
for (const t of TARGETS) { try { after += (await stat(t.file)).size; } catch {} }
console.log(`\nTotal: ${kb(total)} → ${kb(after)}  (saved ${kb(total - after)})`);
