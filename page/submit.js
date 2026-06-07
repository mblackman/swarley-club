// Photo/art submission form. Validates client-side, previews, and POSTs a
// multipart form (image + optional name/caption + Turnstile token) to the
// Worker. Nothing appears publicly until an admin approves it.

const apiBase = (window.SWARLEY && window.SWARLEY.API_BASE) || "/api";

// Keep these in sync with the Worker's validation.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const MAX_EDGE = 1600;            // downscale the long edge before upload

// Resize + re-encode to WebP in the browser so we store small files (kind to
// the storage budget and fast to load). Falls back to the original on any error
// or for GIFs (to preserve animation).
async function processImage(file) {
  if (!file || file.type === "image/gif" || typeof createImageBitmap !== "function") {
    return { blob: file, name: file.name || "photo", type: file.type };
  }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();

    let type = "image/webp";
    let blob = await canvasToBlob(canvas, type, 0.82);
    if (!blob || blob.type !== "image/webp") {
      // Browser can't encode WebP — fall back to JPEG.
      type = "image/jpeg";
      blob = await canvasToBlob(canvas, type, 0.85);
    }
    if (!blob) return { blob: file, name: file.name || "photo", type: file.type };
    // If nothing was gained (already small), keep the original.
    if (scale === 1 && blob.size >= file.size) {
      return { blob: file, name: file.name || "photo", type: file.type };
    }
    const base = (file.name || "photo").replace(/\.[^.]+$/, "");
    const ext = type === "image/webp" ? "webp" : "jpg";
    return { blob, name: `${base}.${ext}`, type };
  } catch (err) {
    console.warn("Client image processing failed; sending original:", err);
    return { blob: file, name: file.name || "photo", type: file.type };
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("submitForm");
  const fileInput = document.getElementById("photo");
  const preview = document.getElementById("preview");
  const statusEl = document.getElementById("status");
  const submitBtn = document.getElementById("submitBtn");

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = "form-status" + (kind ? " " + kind : "");
  }

  // Live preview + client-side validation.
  fileInput.addEventListener("change", () => {
    setStatus("", "");
    const file = fileInput.files[0];
    if (!file) { preview.style.display = "none"; return; }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus("Please choose a JPG, PNG, WEBP, or GIF image.", "err");
      fileInput.value = "";
      preview.style.display = "none";
      return;
    }
    if (file.size > MAX_SIZE) {
      setStatus("That image is larger than 8 MB. Please choose a smaller one.", "err");
      fileInput.value = "";
      preview.style.display = "none";
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = fileInput.files[0];
    if (!file) { setStatus("Please choose a photo first.", "err"); return; }

    // Turnstile injects a hidden input named cf-turnstile-response.
    const tokenField = form.querySelector('[name="cf-turnstile-response"]');
    const token = tokenField ? tokenField.value : "";
    if (!token) { setStatus("Please complete the verification check.", "err"); return; }

    submitBtn.disabled = true;
    setStatus("Optimizing photo…", "");
    const processed = await processImage(file);

    const data = new FormData();
    data.append("file", processed.blob, processed.name);
    data.append("name", document.getElementById("submitter").value || "");
    data.append("caption", document.getElementById("caption").value || "");
    data.append("cf-turnstile-response", token);

    setStatus("Uploading…", "");
    try {
      const res = await fetch(`${apiBase}/submissions`, { method: "POST", body: data });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setStatus("Thank you 💛 Your photo is waiting for approval and will appear in the gallery soon.", "ok");
      form.reset();
      preview.style.display = "none";
      if (window.turnstile) window.turnstile.reset();
    } catch (err) {
      console.error("Submission failed:", err);
      setStatus(`Sorry, something went wrong: ${err.message}. Please try again.`, "err");
      if (window.turnstile) window.turnstile.reset();
    } finally {
      submitBtn.disabled = false;
    }
  });
});
