// Private moderation UI. The admin pastes a token (stored only in this tab's
// sessionStorage); every request carries it as a Bearer header. Real security
// is the Worker's server-side token check — this page is just a convenience.

const apiBase = (window.SWARLEY && window.SWARLEY.API_BASE) || "/api";

document.addEventListener("DOMContentLoaded", () => {
  const tokenInput = document.getElementById("token");
  const loadBtn = document.getElementById("loadBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const statusEl = document.getElementById("status");
  const list = document.getElementById("pendingList");

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = "form-status" + (kind ? " " + kind : "");
  }
  function getToken() {
    return sessionStorage.getItem("swarley_admin_token") || "";
  }
  function authHeaders() {
    return { Authorization: `Bearer ${getToken()}` };
  }

  // Restore a token saved earlier this session.
  const saved = getToken();
  if (saved) { tokenInput.value = saved; logoutBtn.style.display = ""; loadPending(); }

  loadBtn.addEventListener("click", () => {
    const t = tokenInput.value.trim();
    if (!t) { setStatus("Enter your admin token.", "err"); return; }
    sessionStorage.setItem("swarley_admin_token", t);
    logoutBtn.style.display = "";
    loadPending();
  });

  logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem("swarley_admin_token");
    tokenInput.value = "";
    list.innerHTML = "";
    logoutBtn.style.display = "none";
    setStatus("Token forgotten.", "");
  });

  async function loadPending() {
    setStatus("Loading…", "");
    list.innerHTML = "";
    try {
      const res = await fetch(`${apiBase}/admin/submissions`, { headers: authHeaders() });
      if (res.status === 401) { setStatus("Invalid token.", "err"); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = await res.json();
      if (!items.length) { setStatus("No pending submissions 🎉", "ok"); return; }
      setStatus(`${items.length} pending`, "");
      for (const item of items) renderCard(item);
    } catch (err) {
      console.error(err);
      setStatus(`Failed to load: ${err.message}`, "err");
    }
  }

  async function renderCard(item) {
    const card = document.createElement("div");
    card.className = "admin-card";

    const img = document.createElement("img");
    img.alt = item.caption || "Pending submission";
    // Pending images require auth, so fetch as a blob (can't put a header on <img src>).
    fetchImageBlob(item.id).then((url) => { if (url) img.src = url; });

    const meta = document.createElement("div");
    meta.className = "meta";
    const when = item.created_at ? new Date(item.created_at).toLocaleString() : "";
    meta.innerHTML =
      `<strong>${escapeHtml(item.submitter || "Anonymous")}</strong><br>` +
      `${escapeHtml(item.caption || "(no caption)")}<br>` +
      `<small>${escapeHtml(item.filename || "")} · ${formatSize(item.size)} · ${escapeHtml(when)}</small>`;

    const actions = document.createElement("div");
    actions.className = "actions";
    const approve = document.createElement("button");
    approve.className = "approve";
    approve.textContent = "Approve";
    approve.addEventListener("click", () => moderate(item.id, "approve", card));
    const reject = document.createElement("button");
    reject.className = "reject";
    reject.textContent = "Reject";
    reject.addEventListener("click", () => moderate(item.id, "reject", card));
    actions.append(approve, reject);

    card.append(img, meta, actions);
    list.appendChild(card);
  }

  async function fetchImageBlob(id) {
    try {
      const res = await fetch(`${apiBase}/submissions/${id}/image`, { headers: authHeaders() });
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    } catch { return null; }
  }

  async function moderate(id, action, card) {
    card.style.opacity = "0.5";
    try {
      const res = await fetch(`${apiBase}/admin/submissions/${id}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      card.remove();
      const remaining = list.querySelectorAll(".admin-card").length;
      setStatus(remaining ? `${remaining} pending` : "No pending submissions 🎉", remaining ? "" : "ok");
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
