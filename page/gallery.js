// =====================================================================
// Swarley gallery
//
// Three sections, all populated at load time:
//   • "Our Favorite Photos"      — owner uploads (source=owner, kind=photo),
//                                   served full-res from R2 via the API, plus
//                                   any pipeline-generated photos in
//                                   window.SWARLEY_GALLERY (scripts/optimize-gallery.mjs).
//   • "From Everyone Who Loved Him" — public submissions (source=community, kind=photo).
//   • "Artwork"                  — every image tagged kind=artwork (owner + community).
//
// Owner vs community is set server-side: admin.html uploads land as
// source=owner; the public submit form lands as source=community. Tag
// photo/artwork from admin.html.
//
// Pipeline manifest fields: { base, ext='jpg', webp?, avif?, thumb?, w?, h?, alt, caption }
// where `base` is the path WITHOUT extension. `thumb:true` means a small
// `<base>-thumb.<ext>` exists for the grid; the lightbox always uses full size.
// =====================================================================

const apiBase = (window.SWARLEY && window.SWARLEY.API_BASE) || "/api";

// A single ordered list backing the lightbox. Built in display order:
// favorites (pipeline statics, then owner uploads), community, then artwork.
const lightboxItems = [];

document.addEventListener("DOMContentLoaded", () => {
  renderPipelinePhotos();
  setupLightbox();
  loadSubmissions();
});

function makeSource(srcset, type) {
  const s = document.createElement("source");
  s.srcset = srcset;
  s.type = type;
  return s;
}

// Append a figure to `grid`, register it as a lightbox item, and wire the click.
function appendFigure(grid, { picture, lightbox, caption }) {
  const figure = document.createElement("figure");
  figure.appendChild(picture);
  if (caption) {
    const cap = document.createElement("figcaption");
    cap.textContent = caption;
    figure.appendChild(cap);
  }
  const idx = lightboxItems.push(lightbox) - 1;
  figure.addEventListener("click", () => openLightbox(idx));
  grid.appendChild(figure);
}

// --- Pipeline-generated favorites (static AVIF/WebP/JPEG) -------------
// Optional owner-curated photos written into window.SWARLEY_GALLERY by
// scripts/optimize-gallery.mjs. The grid uses the small `-thumb` variant when
// `thumb` is set; the lightbox always opens the full-size image.
function renderPipelinePhotos() {
  const grid = document.getElementById("curatedGallery");
  const items = window.SWARLEY_GALLERY || [];
  if (!grid || items.length === 0) return;
  hideEmpty("curatedEmpty");
  items.forEach((item) => {
    const ext = item.ext || "jpg";
    const full = `${item.base}.${ext}`;            // lightbox source
    const gridStem = item.thumb ? `${item.base}-thumb` : item.base;

    const picture = document.createElement("picture");
    if (item.avif) picture.appendChild(makeSource(`${gridStem}.avif`, "image/avif"));
    if (item.webp) picture.appendChild(makeSource(`${gridStem}.webp`, "image/webp"));
    const img = document.createElement("img");
    img.src = `${gridStem}.${ext}`;
    img.alt = item.alt || "Swarley";
    img.loading = "lazy";
    img.decoding = "async";
    picture.appendChild(img);

    appendFigure(grid, {
      picture,
      caption: item.caption,
      lightbox: { src: full, alt: item.alt, caption: item.caption, w: item.w, h: item.h },
    });
  });
}

// --- Approved submissions (R2-backed, full resolution) ----------------
// Splits the single /api/submissions feed into the three on-page sections.
async function loadSubmissions() {
  const buckets = {
    favorites: document.getElementById("curatedGallery"),
    community: document.getElementById("communityGallery"),
    artwork: document.getElementById("artworkGallery"),
  };
  const origin = apiBase.replace(/\/api$/, "");
  let items = [];
  try {
    const res = await fetch(`${apiBase}/submissions`, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    items = await res.json();
    if (!Array.isArray(items)) items = [];
  } catch (err) {
    console.error("Failed to load submissions:", err);
    setEmpty("curatedEmpty", "Couldn't load photos right now.", true);
    setEmpty("communityEmpty", "Couldn't load shared photos right now.", true);
    setEmpty("artworkEmpty", "Couldn't load artwork right now.", true);
    return;
  }

  // API returns newest-first; reverse so the favorites grid reads oldest→newest
  // alongside any pipeline statics already rendered. (Community/artwork inherit
  // the same order — fine for a memorial gallery.)
  const photos = items.slice().reverse();

  // Render order = lightbox order: owner photos (continue favorites), then
  // community photos, then all artwork.
  const owner = photos.filter((s) => s.kind !== "artwork" && s.source === "owner");
  const community = photos.filter((s) => s.kind !== "artwork" && s.source !== "owner");
  const artwork = photos.filter((s) => s.kind === "artwork");

  owner.forEach((s) => renderSubmission(buckets.favorites, s, origin));
  community.forEach((s) => renderSubmission(buckets.community, s, origin));
  artwork.forEach((s) => renderSubmission(buckets.artwork, s, origin));

  // Empty-state messages per section.
  finishSection("curatedEmpty", buckets.favorites,
    "No favorite photos yet — add some from the admin page.");
  finishSection("communityEmpty", buckets.community,
    "No shared photos yet — be the first to add one of the best boy.");
  finishSection("artworkEmpty", buckets.artwork,
    "No artwork yet.");
}

function renderSubmission(grid, sub, origin) {
  if (!grid) return;
  const src = sub.imageUrl.startsWith("http") ? sub.imageUrl : `${origin}${sub.imageUrl}`;
  const altParts = [];
  if (sub.caption) altParts.push(sub.caption);
  if (sub.submitter) altParts.push(`shared by ${sub.submitter}`);
  const alt = altParts.length ? `Swarley — ${altParts.join(", ")}` : "Swarley, shared by a friend";
  const caption = [sub.caption, sub.submitter ? `— ${sub.submitter}` : ""].filter(Boolean).join(" ");

  const picture = document.createElement("picture");
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.loading = "lazy";
  picture.appendChild(img);

  appendFigure(grid, { picture, caption, lightbox: { src, alt, caption } });
}

function hideEmpty(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}
function setEmpty(id, text, show) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.display = show ? "" : "none";
}
// Hide the loading note if the grid has items; otherwise show the empty message.
function finishSection(emptyId, grid, emptyMsg) {
  if (grid && grid.querySelector("figure")) hideEmpty(emptyId);
  else setEmpty(emptyId, emptyMsg, true);
}

// --- Lightbox ---------------------------------------------------------
let lbIndex = 0;
function setupLightbox() {
  const lb = document.getElementById("lightbox");
  document.getElementById("lbClose").addEventListener("click", closeLightbox);
  document.getElementById("lbPrev").addEventListener("click", () => step(-1));
  document.getElementById("lbNext").addEventListener("click", () => step(1));
  lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });
}

function openLightbox(index) {
  lbIndex = index;
  renderLightbox();
  const lb = document.getElementById("lightbox");
  lb.classList.add("open");
  document.getElementById("lbClose").focus();
}

function closeLightbox() {
  document.getElementById("lightbox").classList.remove("open");
}

function step(delta) {
  if (lightboxItems.length === 0) return;
  lbIndex = (lbIndex + delta + lightboxItems.length) % lightboxItems.length;
  renderLightbox();
}

function renderLightbox() {
  const item = lightboxItems[lbIndex];
  if (!item) return;
  const img = document.getElementById("lbImg");
  // Set intrinsic size first (when known) to avoid layout jump as it loads.
  if (item.w && item.h) { img.width = item.w; img.height = item.h; }
  else { img.removeAttribute("width"); img.removeAttribute("height"); }
  img.src = item.src;
  img.alt = item.alt;
  document.getElementById("lbCaption").textContent = item.caption || item.alt || "";
}
