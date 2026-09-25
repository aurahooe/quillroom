const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
let mode = "signin";
let session = null;
const $ = (id) => document.getElementById(id);
function escapeHtml(s) {
  return String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric" });
  } catch { return ""; }
}
function nextHourMs() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours() + 1, 0, 0, 0) - n;
}
function renderTick() {
  const ms = nextHourMs();
  const m = Math.max(0, Math.floor(ms / 60000));
  const s = Math.max(0, Math.floor((ms % 60000) / 1000));
  $("tick").textContent = `Next turn in ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
async function loadHour() {
  const { data } = await sb.from("quill_hours").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return;
  $("hourKicker").textContent = data.kicker || "This hour";
  $("hourTitle").textContent = data.title;
  $("hourMeta").textContent = fmtWhen(data.created_at);
  $("hourBody").innerHTML = escapeHtml(data.body).split(/\n\n+/).map((p) => `<p>${p.replaceAll("\n", "<br>")}</p>`).join("");
}
async function loadPublic() {
  const { data } = await sb.from("quill_slips").select("id,title,body,created_at,author_id,quill_profiles(display_name)").eq("is_public", true).order("created_at", { ascending: false }).limit(24);
  const root = $("publicSlips");
  if (!data || !data.length) {
    root.innerHTML = `<p class="empty">The table is cleared. Leave a slip if you like.</p>`;
    return;
  }
  root.innerHTML = data.map((s, i) => {
    const name = s.quill_profiles?.display_name || "Someone";
    const tilt = ((i % 5) - 2) * 0.35;
    return `<article class="card" style="--tilt:${tilt}deg;--d:${i * 0.05}s"><h3>${escapeHtml(s.title)}</h3><div class="who">${escapeHtml(name)} · ${fmtWhen(s.created_at)}</div><p>${escapeHtml(s.body)}</p></article>`;
  }).join("");
}
function renderAuth() {
  const slot = $("authSlot");
  if (!session) {
    slot.innerHTML = `<button class="ghost" type="button" data-open="gate">Sign the book</button>`;
    $("studioBody").innerHTML = `<p class="empty">Sign the book to keep drafts and publish slips.</p>`;
    return;
  }
  const name = session.user.user_metadata?.display_name || session.user.email;
  slot.innerHTML = `<span class="who">${escapeHtml(name)}</span> <button class="ghost" id="outBtn" type="button">Leave</button>`;
  $("outBtn")?.addEventListener("click", async () => { await sb.auth.signOut(); });
  renderStudio();
}
function renderStudio() {
  $("studioBody").innerHTML = `<form class="composer" id="slipForm"><label>Title <input name="title" required maxlength="120" placeholder="A short heading" /></label><label>The slip <textarea name="body" required maxlength="4000" placeholder="What you want on the table — or only for yourself."></textarea></label><label class="check"><input type="checkbox" name="pub" /> Mark public</label><p class="form-err" id="slipErr" hidden></p><div class="row"><button class="solid" type="submit">Keep this</button></div></form><div class="mine" id="mineList"><p class="empty">No slips yet.</p></div>`;
  $("slipForm").addEventListener("submit", onSaveSlip);
  loadMine();
}
async function loadMine() {
  if (!session) return;
  const { data } = await sb.from("quill_slips").select("*").eq("author_id", session.user.id).order("created_at", { ascending: false });
  const box = $("mineList");
  if (!box) return;
  if (!data?.length) { box.innerHTML = `<p class="empty">No slips yet.</p>`; return; }
  box.innerHTML = data.map((s) => `<div class="mine-item"><div><strong>${escapeHtml(s.title)}</strong><div class="who">${s.is_public ? "Public" : "Private"} · ${fmtWhen(s.created_at)}</div></div><div class="row"><button class="ghost" data-toggle="${s.id}" data-pub="${s.is_public}">${s.is_public ? "Make private" : "Make public"}</button><button class="ghost" data-del="${s.id}">Remove</button></div></div>`).join("");
  box.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", async () => {
    await sb.from("quill_slips").update({ is_public: b.dataset.pub !== "true" }).eq("id", b.dataset.toggle);
    await loadMine(); await loadPublic();
  }));
  box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    await sb.from("quill_slips").delete().eq("id", b.dataset.del);
    await loadMine(); await loadPublic();
  }));
}
async function onSaveSlip(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const err = $("slipErr");
  const { error } = await sb.from("quill_slips").insert({
    author_id: session.user.id,
    title: String(fd.get("title")).trim(),
    body: String(fd.get("body")).trim(),
    is_public: fd.get("pub") === "on",
  });
  if (error) { err.hidden = false; err.textContent = error.message; return; }
  e.target.reset();
  await loadMine(); await loadPublic();
}
function setGate(signUp) {
  mode = signUp ? "signup" : "signin";
  $("gateTitle").textContent = signUp ? "Take a desk" : "Sign in";
  $("authSubmit").textContent = signUp ? "Open the book" : "Enter";
  $("authToggle").textContent = signUp ? "Already signed?" : "Need a desk?";
  document.querySelector(".name-row").classList.toggle("hidden", !signUp);
}
$("authToggle").addEventListener("click", () => setGate(mode !== "signup"));
document.addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]");
  if (open) $("gate").showModal();
});
$("authForm").addEventListener("submit", async (e) => {
  if (e.submitter && e.submitter.value === "cancel") return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const email = String(fd.get("email"));
  const password = String(fd.get("password"));
  const display = String(fd.get("display") || "").trim();
  const err = $("authErr");
  err.hidden = true;
  let res;
  if (mode === "signup") {
    res = await sb.auth.signUp({ email, password, options: { data: { display_name: display || email.split("@")[0] } } });
  } else {
    res = await sb.auth.signInWithPassword({ email, password });
  }
  if (res.error) { err.hidden = false; err.textContent = res.error.message; return; }
  if (mode === "signup" && !res.data.session) {
    err.hidden = false;
    err.textContent = "Check your email if confirmation is on, then sign in.";
    setGate(false);
    return;
  }
  $("gate").close();
});
sb.auth.onAuthStateChange((_e, s) => { session = s; renderAuth(); });
async function boot() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  renderAuth();
  await loadHour();
  await loadPublic();
  renderTick();
  setInterval(renderTick, 1000);
  sb.channel("quill")
    .on("postgres_changes", { event: "*", schema: "public", table: "quill_hours" }, loadHour)
    .on("postgres_changes", { event: "*", schema: "public", table: "quill_slips" }, loadPublic)
    .subscribe();
}
boot();
