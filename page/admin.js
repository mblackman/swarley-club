// Private moderation UI. The admin pastes a token (stored only in this tab's
// sessionStorage); every request carries it as a Bearer header. Real security
// is the Worker's server-side token check — this page is just a convenience.
// Moderates both photo submissions and guestbook memories.

const apiBase = (window.SWARLEY && window.SWARLEY.API_BASE) || "/api";

document.addEventListener("DOMContentLoaded", () => {
  const tokenInput = document.getElementById("token");
  const loadBtn = document.getElementById("loadBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const statusEl = document.getElementById("status");
  const photosList = document.getElementById("pendingList");
  const photosNote = document.getElementById("photosNote");
  const memoriesList = document.getElementById("pendingMemories");
  const memoriesNote = document.getElementById("memoriesNote");

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = "form-status" + (kind ? " " + kind : "");
  }
  function getToken() { return sessionStorage.getItem("swarley_admin_token") || ""; }
  function authHeaders() { return { Authorization: `Bearer ${getToken()}` }; }

  // Restore a token saved earlier this session.
  if (getToken()) { tokenInput.value = getToken(); logoutBtn.style.display = ""; loadAll(); }

  loadBtn.addEventListener("click", () => {
    const t = tokenInput.value.trim();
    if (!t) { setStatus("Enter your admin token.", "err"); return; }
    sessionStorage.setItem("swarley_admin_token", t);
    logoutBtn.style.display = "";
    loadAll();
  });

  logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem("swarley_admin_token");
    tokenInput.value = "";
    photosList.innerHTML = "";
    memoriesList.innerHTML = "";
    photosNote.textContent = "";
    memoriesNote.textContent = "";
    logoutBtn.style.display = "none";
    setStatus("Token forgotten.", "");
  });

  async function loadAll() {
    setStatus("Loading…", "");
    photosList.innerHTML = "";
    memoriesList.innerHTML = "";
    const results = await Promise.allSettled([loadPhotos(), loadMemories()]);
    const failed = results.find((r) => r.status === "rejected");
    setStatus(failed ? `Some lists failed to load (${failed.reason}).` : "Loaded.", failed ? "err" : "");
  }

  // --- Photos -----------------------------------------------------------
  async function loadPhotos() {
    const res = await fetch(`${apiBase}/admin/submissions`, { headers: authHeaders() });
    if (res.status === 401) { setStatus("Invalid token.", "err"); throw new Error("401"); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    photosNote.textContent = items.length ? "" : "No pending photos 🎉";
    items.forEach(renderPhotoCard);
  }

  function renderPhotoCard(item) {
    const card = document.createElement("div");
    card.className = "admin-card";

    const img = document.createElement("img");
    img.alt = item.caption || "Pending submission";
    fetchImageBlob(item.id).then((url) => { if (url) img.src = url; });

    const meta = document.createElement("div");
    meta.className = "meta";
    const when = item.created_at ? new Date(item.created_at).toLocaleString() : "";
    meta.innerHTML =
      `<strong>${escapeHtml(item.submitter || "Anonymous")}</strong><br>` +
      `${escapeHtml(item.caption || "(no caption)")}<br>` +
      `<small>${escapeHtml(item.filename || "")} · ${formatSize(item.size)} · ${escapeHtml(when)}</small>`;

    card.append(img, meta, actionButtons((action) => moderate("submissions", item.id, action, card, photosNote, "No pending photos 🎉")));
    photosList.appendChild(card);
  }

  async function fetchImageBlob(id) {
    try {
      const res = await fetch(`${apiBase}/submissions/${id}/image`, { headers: authHeaders() });
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    } catch { return null; }
  }

  // --- Memories ---------------------------------------------------------
  async function loadMemories() {
    const res = await fetch(`${apiBase}/admin/memories`, { headers: authHeaders() });
    if (res.status === 401) { setStatus("Invalid token.", "err"); throw new Error("401"); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    memoriesNote.textContent = items.length ? "" : "No pending memories 🎉";
    items.forEach(renderMemoryCard);
  }

  function renderMemoryCard(item) {
    const card = document.createElement("div");
    card.className = "admin-card";

    const meta = document.createElement("div");
    meta.className = "meta";
    const when = item.created_at ? new Date(item.created_at).toLocaleString() : "";
    meta.innerHTML =
      `<strong>${escapeHtml(item.author || "Anonymous")}</strong> <small>${escapeHtml(when)}</small><br>` +
      `<span style="white-space:pre-wrap;">${escapeHtml(item.message || "")}</span>`;

    card.append(meta, actionButtons((action) => moderate("memories", item.id, action, card, memoriesNote, "No pending memories 🎉")));
    memoriesList.appendChild(card);
  }

  // --- Shared -----------------------------------------------------------
  function actionButtons(onAction) {
    const actions = document.createElement("div");
    actions.className = "actions";
    const approve = document.createElement("button");
    approve.className = "approve";
    approve.textContent = "Approve";
    approve.addEventListener("click", () => onAction("approve"));
    const reject = document.createElement("button");
    reject.className = "reject";
    reject.textContent = "Reject";
    reject.addEventListener("click", () => onAction("reject"));
    actions.append(approve, reject);
    return actions;
  }

  async function moderate(kind, id, action, card, note, emptyMsg) {
    card.style.opacity = "0.5";
    try {
      const res = await fetch(`${apiBase}/admin/${kind}/${id}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sibling = card.parentElement;
      card.remove();
      if (sibling && sibling.querySelectorAll(".admin-card").length === 0) note.textContent = emptyMsg;
    } catch (err) {
      console.error(err);
      card.style.opacity = "1";
      setStatus(`Action failed: ${err.message}`, "err");
    }
  }

  function formatSize(bytes) {
    if (!bytes) return "";
    const kb = bytes / 1024;
    return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
});
