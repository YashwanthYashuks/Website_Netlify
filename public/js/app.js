// Shared code: business info, cart (localStorage), API helper, header/footer.
const CONFIG = {
  businessName: "YT_Boquets_ReturnGifts",
  whatsapp: "918951104898", // no +, spaces or hyphens
  location: "SJR Layout Phase 2, Kodigehalli Main Rd, Ayyappa Nagar, Krishnarajapuram, Bengaluru, Karnataka - 560048",
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "₹" + Number(n).toFixed(2);
const $ = (sel) => document.querySelector(sel);

// ---- Cart: { "productId": qty } ----
const Cart = {
  get() { try { return JSON.parse(localStorage.getItem("cart") || "{}"); } catch { return {}; } },
  set(c) { localStorage.setItem("cart", JSON.stringify(c)); updateCartCount(); },
  add(id, qty = 1) { const c = this.get(); c[id] = (parseInt(c[id], 10) || 0) + Math.max(1, qty); this.set(c); },
  clear() { this.set({}); },
  count() { return Object.values(this.get()).reduce((a, b) => a + (parseInt(b, 10) || 0), 0); },
};

async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch("/api/" + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: res.status });
  return data;
}

const imgUrl = (p) => (!p.image ? "" : /^https?:\/\//.test(p.image) ? p.image : "/images/" + p.image);
function photoHtml(p, fallback = "🌷") {
  const u = imgUrl(p);
  return u ? `<img src="${esc(u)}" alt="${esc(p.name)}" onerror="this.replaceWith(document.createTextNode('${fallback}'))">` : fallback;
}

function flash(msg) {
  let el = $(".flash");
  if (!el) { el = document.createElement("div"); el.className = "flash"; $("main").before(el); }
  el.textContent = msg;
  setTimeout(() => el.remove(), 2500);
}

function updateCartCount() {
  const el = $("#cart-count");
  if (el) el.textContent = Cart.count() ? ` (${Cart.count()})` : "";
}

document.addEventListener("DOMContentLoaded", () => {
  document.body.insertAdjacentHTML("afterbegin", `
<header>
  <a class="brand" href="/">🌸 ${esc(CONFIG.businessName)}</a>
  <nav>
    <a href="/">Home</a>
    <a href="/cart.html">Cart 🛒<span id="cart-count" class="cart-count"></span></a>
    <a href="/track.html">Track Order</a>
    <a class="whatsapp" href="https://wa.me/${CONFIG.whatsapp}" target="_blank" rel="noopener">WhatsApp</a>
  </nav>
</header>`);
  document.body.insertAdjacentHTML("beforeend", `
<footer>
  <strong>${esc(CONFIG.businessName)}</strong><br>
  ${esc(CONFIG.location)} · <a href="https://wa.me/${CONFIG.whatsapp}" target="_blank" rel="noopener">WhatsApp: +91 8951104898</a>
</footer>`);
  updateCartCount();
});
