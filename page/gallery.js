// =====================================================================
// Swarley gallery
//
// CURATED PHOTOS: edit the GALLERY list below. To add a photo:
//   1. Drop the file into  page/images/gallery/   (or page/images/)
//   2. Add one entry here with `base` = path WITHOUT extension.
//      Set `webp: true` only if a matching .webp twin exists next to it.
//
// It is seeded with the original site photos so the gallery is never empty.
// Replace/extend these with the big collection from Google Photos.
// =====================================================================
const GALLERY = [
  { base: "images/swarley-1",  ext: "jpg", webp: true, alt: "Swarley being a gentleman in a suit", caption: "" },
  { base: "images/swarley-2",  ext: "jpg", webp: true, alt: "Swarley's side profile and smile", caption: "" },
  { base: "images/swarley-3",  ext: "jpg", webp: true, alt: "Swarley looking ghastly and cute", caption: "" },
  { base: "images/swarley-4",  ext: "jpg", webp: true, alt: "Swarley prancing through the grass", caption: "" },
  { base: "images/swarley-5",  ext: "jpg", webp: true, alt: "Swarley is a nugget", caption: "" },
  { base: "images/swarley-6",  ext: "jpg", webp: true, alt: "Swarley as a little pup in the car", caption: "" },
  { base: "images/swarley-7",  ext: "jpg", webp: true, alt: "Swarley looking like a disheveled old man", caption: "" },
  { base: "images/swarley-8",  ext: "jpg", webp: true, alt: "Swarley's little feet", caption: "" },
  { base: "images/swarley-9",  ext: "jpg", webp: true, alt: "Swarley looking like a rabid beast", caption: "" },
  { base: "images/swarley-10", ext: "jpg", webp: true, alt: "Swarley wondering if you got snacks", caption: "" },
  { base: "images/swarley-11", ext: "jpg", webp: true, alt: "Swarley looking dapper in a bandana", caption: "" },
  { base: "images/swarley-12", ext: "jpg", webp: true, alt: "Swarley trying his hardest to smile", caption: "" },
  { base: "images/swarley-13", ext: "jpg", webp: true, alt: "Swarley relaxing", caption: "" },
];

const apiBase = (window.SWARLEY && window.SWARLEY.API_BASE) || "/api";

// A single ordered list backing the lightbox (curated first, then community).
const lightboxItems = [];

document.addEventListener("DOMContentLoaded", () => {
  renderCurated();
  setupLightbox();
  loadCommunity();
});

// --- Curated grid -----------------------------------------------------
function renderCurated() {
  const grid = document.getElementById("curatedGallery");
  if (!grid) return;
  GALLERY.forEach((item) => {
    const full = `${item.base}.${item.ext}`;
    const idx = lightboxItems.push({ src: full, alt: item.alt, caption: item.caption }) - 1;

    const figure = document.createElement("figure");
    const picture = document.createElement("picture");
    if (item.webp) {
      const source = document.createElement("source");
      source.srcset = `${item.base}.webp`;
      source.type = "image/webp";
      picture.appendChild(source);
    }
    const img = document.createElement("img");
    img.src = full;
    img.alt = item.alt;
    img.loading = "lazy";
    picture.appendChild(img);
    figure.appendChild(picture);

    if (item.caption) {
      const cap = document.createElement("figcaption");
      cap.textContent = item.caption;
      figure.appendChild(cap);
    }
    figure.addEventListener("click", () => openLightbox(idx));
    grid.appendChild(figure);
  });
}

// --- Community (approved submissions) ---------------------------------
async function loadCommunity() {
  const grid = document.getElementById("communityGallery");
  const empty = document.getElementById("communityEmpty");
  if (!grid) return;
  try {
    const res = await fetch(`${apiBase}/submissions`, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      if (empty) empty.textContent = "No shared photos yet — be the first to add one of the best boy. 🐾";
      return;
    }
    if (empty) empty.style.display = "none";
    items.forEach((sub) => {
      const src = sub.imageUrl.startsWith("http") ? sub.imageUrl : `${apiBase.replace(/\/api$/, "")}${sub.imageUrl}`;
      const altParts = [];
      if (sub.caption) altParts.push(sub.caption);
      if (sub.submitter) altParts.push(`shared by ${sub.submitter}`);
      const alt = altParts.length ? `Swarley — ${altParts.join(", ")}` : "Swarley, shared by a friend";
      const caption = [sub.caption, sub.submitter ? `— ${sub.submitter}` : ""].filter(Boolean).join(" ");
      const idx = lightboxItems.push({ src, alt, caption }) - 1;

      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = src;
      img.alt = alt;
      img.loading = "lazy";
      figure.appendChild(img);
      if (caption) {
        const cap = document.createElement("figcaption");
        cap.textContent = caption;
        figure.appendChild(cap);
      }
      figure.addEventListener("click", () => openLightbox(idx));
      grid.appendChild(figure);
    });
  } catch (err) {
    console.error("Failed to load community submissions:", err);
    if (empty) empty.textContent = "Couldn't load shared photos right now.";
  }
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
  img.src = item.src;
  img.alt = item.alt;
  document.getElementById("lbCaption").textContent = item.caption || item.alt || "";
}
