// Photo/art submission form. Validates client-side, previews, and POSTs a
// multipart form (image + optional name/caption + Turnstile token) to the
// Worker. Nothing appears publicly until an admin approves it.

const apiBase = (window.SWARLEY && window.SWARLEY.API_BASE) || "/api";

// Keep these in sync with the Worker's validation.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB

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

    const data = new FormData();
    data.append("file", file);
    data.append("name", document.getElementById("submitter").value || "");
    data.append("caption", document.getElementById("caption").value || "");
    data.append("cf-turnstile-response", token);

    submitBtn.disabled = true;
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
