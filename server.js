"use strict";
const crypto = require("crypto");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const CANONICAL_HOST = "www.amrutfoodz.com";
const WHATSAPP_FALLBACK = "Please WhatsApp us on +91 72100 97007.";

const { DATABASE_URL, RESEND_API_KEY, ENQUIRY_TO, ENQUIRY_FROM } = process.env;

// ---------- Database (persistent Postgres; no local-file fallback) ----------
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000
    })
  : null;
if (pool) pool.on("error", (err) => console.error("[db] idle client error:", err.message));

async function initDb() {
  if (!pool) {
    console.error("[config] DATABASE_URL is NOT set. Enquiries cannot be stored; the form will return 503 until it is configured.");
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS enquiries (
      id BIGSERIAL PRIMARY KEY,
      ref TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      company TEXT,
      email TEXT,
      city TEXT,
      business_type TEXT,
      product TEXT NOT NULL,
      quantity TEXT,
      message TEXT,
      email_status TEXT NOT NULL DEFAULT 'pending'
    )`);
  console.log("[db] connected; enquiries table ready.");
}

if (RESEND_API_KEY && ENQUIRY_TO && ENQUIRY_FROM) console.log("[config] Email notifications enabled via Resend.");
else console.warn("[config] Email notifications DISABLED (need RESEND_API_KEY, ENQUIRY_TO and ENQUIRY_FROM). Enquiries are still saved to the database.");

// ---------- App & security ----------
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'"], // TEMPORARY until Stage 2 (old index.html may use inline code)
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        // TEMPORARY: unsplash is only here until the stock photos in the old index.html are replaced (Stage 2). Then remove it.
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"]
      }
    }
  })
);

// Apex -> www (canonical host)
app.use((req, res, next) => {
  if (req.hostname === "amrutfoodz.com") return res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
  next();
});
// Clean URLs: /products.html -> /products, /index.html -> /
app.use((req, res, next) => {
  if ((req.method === "GET" || req.method === "HEAD") && /\.html$/i.test(req.path)) {
    const clean = req.path.replace(/\/index\.html$/i, "/").replace(/\.html$/i, "");
    const qs = req.originalUrl.slice(req.path.length);
    return res.redirect(301, (clean || "/") + qs);
  }
  next();
});

app.use(express.json({ limit: "25kb" }));
app.use(express.urlencoded({ extended: false, limit: "25kb" }));

app.use(
  express.static(PUBLIC_DIR, {
    extensions: ["html"],
    maxAge: "1h",
    setHeaders(res, filePath) {
      if (/\.(html|xml|txt)$/i.test(filePath)) res.setHeader("Cache-Control", "no-cache");
      else if (filePath.includes(`${path.sep}images${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=604800");
    }
  })
);

// ---------- Validation helpers ----------
const BUSINESS_TYPES = ["Retailer / Supermarket", "Distributor", "Wholesaler", "Farsan / Namkeen Manufacturer", "Hotel / Caterer / Food Service", "Other Business"];
const PRODUCTS = ["Chana Besan", "Vatana Flour", "Both Products", "Other / Future Requirement"];

const single = (v, max) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const multi = (v, max) =>
  typeof v === "string"
    ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F<>]/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max)
    : "";

function validate(body) {
  const d = {
    name: single(body.name, 100),
    company: single(body.company, 140),
    phone: single(body.phone, 30),
    email: single(body.email, 140),
    city: single(body.city, 100),
    businessType: single(body.customerType || body.businessType, 80),
    product: single(body.product, 80),
    quantity: single(body.quantity, 100),
    message: multi(body.message, 1200)
  };
  const errors = {};
  if (d.name.length < 2) errors.name = "Please enter your name.";
  if (!/^[+()\d\s-]{7,30}$/.test(d.phone) || d.phone.replace(/\D/g, "").length < 7) errors.phone = "Please enter a valid phone number.";
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errors.email = "Please enter a valid email address.";
  if (!PRODUCTS.includes(d.product)) errors.product = "Please choose a product.";
  if (d.businessType && !BUSINESS_TYPES.includes(d.businessType)) errors.customerType = "Please choose a listed business type.";
  return { data: d, errors };
}

// ---------- Email (Resend HTTPS API) ----------
// Returns "accepted_by_resend" only when Resend's API returns 2xx.
async function sendNotification(lead) {
  if (!RESEND_API_KEY || !ENQUIRY_TO || !ENQUIRY_FROM) return "not_configured";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const text = [
    "New Maha Amrut website enquiry", "",
    `Reference: ${lead.ref}`, `Name: ${lead.name}`, `Phone: ${lead.phone}`,
    `Company: ${lead.company || "-"}`, `Email: ${lead.email || "-"}`, `City: ${lead.city || "-"}`,
    `Business type: ${lead.businessType || "-"}`, `Product: ${lead.product}`, `Quantity: ${lead.quantity || "-"}`,
    "", "Message:", lead.message || "-"
  ].join("\n");
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: ENQUIRY_FROM,
        to: ENQUIRY_TO.split(",").map((s) => s.trim()).filter(Boolean),
        subject: `New enquiry ${lead.ref} - ${lead.product} - ${lead.name}`,
        text,
        reply_to: lead.email || undefined
      })
    });
    if (r.ok) return "accepted_by_resend";
    console.error(`[email] Resend rejected ${lead.ref}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
    return "failed";
  } catch (err) {
    console.error(`[email] Resend request failed for ${lead.ref}:`, err.name === "AbortError" ? "timeout" : err.message);
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Routes ----------
app.get("/api/health", async (_req, res) => {
  let db = "not_configured";
  if (pool) {
    try { await pool.query("SELECT 1"); db = "connected"; } catch { db = "error"; }
  }
  res.json({ ok: true, service: "maha-amrut-website", db, email: RESEND_API_KEY && ENQUIRY_TO && ENQUIRY_FROM ? "configured" : "not_configured" });
});

const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, message: `Too many enquiries from this connection. Please try again later. ${WHATSAPP_FALLBACK}` }
});

app.post("/api/enquiry", enquiryLimiter, async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  // Honeypot: bots fill the hidden "website" field. Pretend success, store nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") return res.status(200).json({ ok: true, message: "Thank you." });

  const { data, errors } = validate(body);
  if (Object.keys(errors).length) return res.status(400).json({ ok: false, message: "Please correct the highlighted fields.", errors });

  if (!pool) {
    console.error("[enquiry] Rejected: DATABASE_URL not configured.");
    return res.status(503).json({ ok: false, message: `Our enquiry system is temporarily unavailable. ${WHATSAPP_FALLBACK}` });
  }

  const lead = { ref: `MA-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`, ...data };
  try {
    await pool.query(
      `INSERT INTO enquiries (ref,name,phone,company,email,city,business_type,product,quantity,message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [lead.ref, lead.name, lead.phone, lead.company || null, lead.email || null, lead.city || null,
       lead.businessType || null, lead.product, lead.quantity || null, lead.message || null]
    );
  } catch (err) {
    console.error("[enquiry] DB insert failed:", err.message);
    return res.status(500).json({ ok: false, message: `We couldn't save your enquiry. ${WHATSAPP_FALLBACK}` });
  }

  const emailStatus = await sendNotification(lead);
  console.log(`[enquiry] ${lead.ref} saved; email=${emailStatus}`);
  pool.query("UPDATE enquiries SET email_status=$1 WHERE ref=$2", [emailStatus, lead.ref]).catch((e) => console.error("[db] email_status update failed:", e.message));

  // The visitor is only told the enquiry was received and saved. We never claim an email was delivered.
  res.status(201).json({ ok: true, ref: lead.ref, message: `Thank you. Your enquiry (ref ${lead.ref}) has been received. Our team will contact you.` });
});

// ---------- 404 & errors ----------
app.use("/api", (_req, res) => res.status(404).json({ ok: false, message: "Not found." }));
app.use((_req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, "404.html"), (err) => {
    if (err && !res.headersSent) res.type("text/plain").send("Page not found");
  });
});
app.use((err, _req, res, _next) => {
  if (err && (err.type === "entity.parse.failed" || err.status === 400 || err.status === 413)) return res.status(err.status || 400).json({ ok: false, message: "Invalid request." });
  console.error("[server] Unhandled error:", err);
  if (!res.headersSent) res.status(500).json({ ok: false, message: "Something went wrong." });
});

// ---------- Start ----------
const server = app.listen(PORT, () => console.log(`[server] Maha Amrut website listening on port ${PORT}`));
initDb().catch((err) => console.error("[db] init failed:", err.message));
process.on("SIGTERM", () => {
  server.close(() => (pool ? pool.end() : null));
});
