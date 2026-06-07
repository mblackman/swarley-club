// Guestbook: submit a memory (Turnstile-protected, held for moderation) and
// render the approved memories below.

const apiBase = (window.SWARLEY && window.SWARLEY.API_BASE) || "/api";
const MAX_MESSAGE = 2000; // keep in sync with the Worker

// Turnstile loads with render=explicit&onload=onTurnstileLoad (see memories.html),
// so we render it ourselves using the hostname-selected site key from config.js.
window.onTurnstileLoad = () => {
  if (!window.turnstile) return;
  window.turnstile.render(".cf-turnstile", {
    sitekey: (window.SWARLEY && window.SWARLEY.TURNSTILE_SITEKEY) || "1x00000000000000000000AA",
  });
};

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("memoryForm");
  const statusEl = document.getElementById("status");
  const submitBtn = document.getElementById("memoryBtn");

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = "form-status" + (kind ? " " + kind : "");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = document.getElementById("message").value.trim();
    if (!message) { setStatus("Please write a memory first.", "err"); return; }
    if (message.length > MAX_MESSAGE) {
      setStatus(`Please keep it under ${MAX_MESSAGE} characters.`, "err");
      return;
    }

    const tokenField = form.querySelector('[name="cf-turnstile-response"]');
    const token = tokenField ? tokenField.value : "";
    if (!token) { setStatus("Please complete the verification check.", "err"); return; }

    submitBtn.disabled = true;
    setStatus("Sending…", "");
    try {
      const res = await fetch(`${apiBase}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: document.getElementById("author").value || "",
          message,
          "cf-turnstile-response": token,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setStatus("Thank you 💛 Your memory is waiting for approval and will appear below soon.", "ok");
      form.reset();
      if (window.turnstile) window.turnstile.reset();
    } catch (err) {
      console.error("Memory submission failed:", err);
      setStatus(`Sorry, something went wrong: ${err.message}. Please try again.`, "err");
      if (window.turnstile) window.turnstile.reset();
    } finally {
      submitBtn.disabled = false;
    }
  });

  loadMemories();
});

async function loadMemories() {
  const list = document.getElementById("memoriesList");
  const empty = document.getElementById("memoriesEmpty");
  if (!list) return;
  try {
    const res = await fetch(`${apiBase}/memories`, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      if (empty) empty.textContent = "No memories yet — be the first to share one. 💛";
      return;
    }
    if (empty) empty.style.display = "none";
    items.forEach((m) => {
      const card = document.createElement("blockquote");
      card.className = "memory-card";

      const msg = document.createElement("p");
      msg.className = "memory-message";
      msg.textContent = m.message;

      const cite = document.createElement("cite");
      cite.className = "memory-author";
      const when = m.created_at ? new Date(m.created_at).toLocaleDateString() : "";
      cite.textContent = `— ${m.author || "Anonymous"}${when ? " · " + when : ""}`;

      card.append(msg, cite);
      list.appendChild(card);
    });
  } catch (err) {
    console.error("Failed to load memories:", err);
    if (empty) empty.textContent = "Couldn't load memories right now.";
  }
}
