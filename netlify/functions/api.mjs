// Single serverless function that replaces the Flask backend (app.py).
// Routes are served under /api/* (see `config.path` at the bottom).
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

// ---------- Config (set these in Netlify > Site settings > Environment variables) ----------
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SECRET_KEY = process.env.SECRET_KEY || "change-this-secret-key";

const STATUSES = [
  "Order Received", "Confirmed", "Preparing", "Ready",
  "Out for Delivery", "Delivered", "Cancelled",
];

const SEED_PRODUCTS = [
  { id: 1, name: "Elegant Rose Bouquet", description: "Fresh rose bouquet for special occasions.", price: 499, category: "Bouquets", image: "elegant_rose_bouquet.jpg", available: true },
  { id: 2, name: "Premium Flower Bouquet", description: "Premium mixed flowers arranged beautifully.", price: 799, category: "Bouquets", image: "premium_flower_bouquet.jpg", available: true },
  { id: 3, name: "Mini Return Gift Pack", description: "Cute return gift pack for small events.", price: 149, category: "Return Gifts", image: "mini_return_gift_pack.jpg", available: true },
  { id: 4, name: "Premium Return Gift Box", description: "Elegant return gift box for weddings and functions.", price: 299, category: "Return Gifts", image: "premium_return_gift_box.jpg", available: true },
  { id: 5, name: "Custom Wedding Gift", description: "Customizable return gift for bulk wedding orders.", price: 399, category: "Custom Orders", image: "custom_wedding_gift.jpg", available: true },
];

// ---------- Helpers ----------
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

const sign = (payload) =>
  crypto.createHmac("sha256", SECRET_KEY).update(payload).digest("base64url");

function makeToken() {
  const payload = Buffer.from(JSON.stringify({ u: ADMIN_USER, exp: Date.now() + 12 * 3600 * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function isAdmin(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now();
  } catch {
    return false;
  }
}

async function getProducts(store) {
  let products = await store.get("all", { type: "json" });
  if (!products) {
    products = SEED_PRODUCTS;
    await store.setJSON("all", products);
  }
  return products;
}

// Order number like ORD-20261125-101530-AB12 (IST) – suffix avoids collisions
function newOrderNumber() {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString();
  const stamp = ist.slice(0, 19).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{6})$/, "$1-$2");
  return `ORD-${stamp}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

const clean = (v, max = 500) => String(v ?? "").trim().slice(0, max);

// ---------- Handler ----------
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const parts = path.split("/");
  const method = req.method;

  const productStore = getStore("products");
  const orderStore = getStore("orders");

  try {
    // ----- Public: products -----
    if (method === "GET" && path === "products") {
      const products = await getProducts(productStore);
      return json(products.filter((p) => p.available));
    }
    if (method === "GET" && parts[0] === "products" && parts[1]) {
      const products = await getProducts(productStore);
      const p = products.find((x) => x.id === Number(parts[1]));
      return p ? json(p) : json({ error: "Product not found" }, 404);
    }

    // ----- Public: place order -----
    if (method === "POST" && path === "orders") {
      const body = await req.json();
      const c = body.customer || {};
      const customer = {
        name: clean(c.name, 120), phone: clean(c.phone, 30), email: clean(c.email, 150),
        address: clean(c.address, 1000), city: clean(c.city, 100), pincode: clean(c.pincode, 20),
      };
      if (!customer.name || !customer.phone || !customer.address)
        return json({ error: "Name, phone and address are required." }, 400);

      const products = await getProducts(productStore);
      const items = [];
      let total = 0;
      for (const line of Array.isArray(body.items) ? body.items : []) {
        const p = products.find((x) => x.id === Number(line.id) && x.available);
        const qty = Math.min(1000, Math.max(1, parseInt(line.qty, 10) || 0));
        if (!p || !qty) continue;
        const subtotal = p.price * qty; // price always comes from the server, never the browser
        total += subtotal;
        items.push({ product_id: p.id, name: p.name, quantity: qty, price: p.price, subtotal });
      }
      if (!items.length) return json({ error: "Your cart is empty." }, 400);

      const now = new Date().toISOString();
      const order = {
        order_number: newOrderNumber(),
        customer, items, total_amount: total,
        delivery_date: clean(body.delivery_date, 30),
        special_instructions: clean(body.special_instructions, 1000),
        status: "Order Received",
        history: [{ status: "Order Received", updated_at: now }],
        created_at: now, updated_at: now,
      };
      await orderStore.setJSON(order.order_number, order);
      return json({ order_number: order.order_number, total: order.total_amount }, 201);
    }

    // ----- Public: track order -----
    if (method === "GET" && parts[0] === "orders" && parts[1]) {
      const order = await orderStore.get(parts[1].toUpperCase(), { type: "json" });
      if (!order) return json({ error: "Order not found" }, 404);
      return json({
        order_number: order.order_number, status: order.status,
        total: order.total_amount, updated_at: order.updated_at,
      });
    }

    // ----- Admin -----
    if (method === "POST" && path === "admin/login") {
      const { username, password } = await req.json();
      if (safeEqual(username ?? "", ADMIN_USER) && safeEqual(password ?? "", ADMIN_PASSWORD))
        return json({ token: makeToken() });
      return json({ error: "Invalid admin credentials." }, 401);
    }

    if (parts[0] === "admin") {
      if (!isAdmin(req)) return json({ error: "Unauthorized" }, 401);

      if (method === "GET" && path === "admin/data") {
        const { blobs } = await orderStore.list();
        const orders = (await Promise.all(blobs.map((b) => orderStore.get(b.key, { type: "json" }))))
          .filter(Boolean)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        const products = (await getProducts(productStore)).slice().sort((a, b) => b.id - a.id);
        return json({ orders, products, statuses: STATUSES });
      }

      if (method === "POST" && parts[1] === "orders" && parts[3] === "status") {
        const order = await orderStore.get(parts[2], { type: "json" });
        if (!order) return json({ error: "Order not found" }, 404);
        const { status } = await req.json();
        if (!STATUSES.includes(status)) return json({ error: "Invalid status" }, 400);
        const now = new Date().toISOString();
        order.status = status;
        order.updated_at = now;
        order.history.push({ status, updated_at: now });
        await orderStore.setJSON(order.order_number, order);
        return json({ ok: true });
      }

      if (method === "POST" && path === "admin/products") {
        const b = await req.json();
        const price = parseFloat(b.price);
        if (!clean(b.name) || !(price >= 0)) return json({ error: "Name and valid price required." }, 400);
        const products = await getProducts(productStore);
        products.push({
          id: products.reduce((m, p) => Math.max(m, p.id), 0) + 1,
          name: clean(b.name, 150), description: clean(b.description, 2000), price,
          category: clean(b.category, 80) || "Bouquets", image: clean(b.image, 300), available: true,
        });
        await productStore.setJSON("all", products);
        return json({ ok: true }, 201);
      }

      if (method === "DELETE" && parts[1] === "products" && parts[2]) {
        const products = await getProducts(productStore);
        await productStore.setJSON("all", products.filter((p) => p.id !== Number(parts[2])));
        return json({ ok: true });
      }
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: "Server error" }, 500);
  }
};

export const config = { path: "/api/*" };
