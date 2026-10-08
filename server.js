const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "25kb" }));
app.use(express.urlencoded({ extended: false, limit: "25kb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));

const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20,
  standardHeaders: "draft-7", legacyHeaders: false,
  message: { ok: false, message: "Too many enquiries. Please try again later." }
});
function clean(value, max = 500) {
  return String(value || "").trim().replace(/[<>]/g, "").slice(0, max);
}
function ensureLeadStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, "[]", "utf8");
}
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "maha-amrut-website" }));

app.post("/api/enquiry", enquiryLimiter, async (req, res) => {
  const body = req.body || {};
  if (body.website) return res.status(200).json({ ok: true, message: "Thank you." });
  const name = clean(body.name, 100), phone = clean(body.phone, 30), product = clean(body.product, 80);
  if (!name || !phone || !product) return res.status(400).json({ ok: false, message: "Please fill in your name, phone number and product." });
  if (!/^[+()\d\s-]{7,30}$/.test(phone)) return res.status(400).json({ ok: false, message: "Please enter a valid phone number." });

  const lead = {
    id: `MA-${Date.now()}`, receivedAt: new Date().toISOString(), name, phone,
    company: clean(body.company, 140), email: clean(body.email, 140), city: clean(body.city, 100),
    customerType: clean(body.customerType, 80), product, quantity: clean(body.quantity, 100),
    message: clean(body.message, 1200)
  };
  try {
    ensureLeadStore();
    const all = JSON.parse(fs.readFileSync(LEADS_FILE, "utf8"));
    all.push(lead);
    fs.writeFileSync(LEADS_FILE, JSON.stringify(all, null, 2), "utf8");
  } catch (err) {
    console.error("Lead storage failed:", err.message);
    return res.status(500).json({ ok: false, message: "We couldn't save your enquiry. Please contact us on WhatsApp." });
  }

  let emailSent = false;
  if (process.env.RESEND_API_KEY && process.env.ENQUIRY_TO) {
    try {
      const emailBody = [
        "New Maha Amrut website enquiry", "", `Lead ID: ${lead.id}`, `Name: ${lead.name}`,
        `Phone: ${lead.phone}`, `Company: ${lead.company || "-"}`, `Email: ${lead.email || "-"}`,
        `City: ${lead.city || "-"}`, `Customer type: ${lead.customerType || "-"}`,
        `Product: ${lead.product}`, `Quantity: ${lead.quantity || "-"}`,
        `Message: ${lead.message || "-"}`, `Received: ${lead.receivedAt}`
      ].join("\n");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.ENQUIRY_FROM || "Maha Amrut Website <onboarding@resend.dev>",
          to: [process.env.ENQUIRY_TO],
          subject: `New website enquiry — ${lead.product} — ${lead.name}`,
          text: emailBody, reply_to: lead.email || undefined
        })
      });
      emailSent = response.ok;
      if (!response.ok) console.error("Resend email failed:", response.status, await response.text());
    } catch (err) { console.error("Resend email failed:", err.message); }
  }
  res.status(201).json({
    ok: true, message: "Thanks! Your enquiry has been received. Our team will contact you soon.",
    emailNotification: emailSent ? "sent" : "not_configured_or_failed"
  });
});
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`Maha Amrut website running on port ${PORT}`));
