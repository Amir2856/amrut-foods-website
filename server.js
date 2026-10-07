
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, "data");
const FILE = path.join(DATA, "leads.json");

// Render proxy configuration — must be before rate limiter
app.set("trust proxy", 1);

fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, "[]");

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  })
);

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.post("/api/enquiry", async (req, res) => {
  const b = req.body || {};

  if (b.website) return res.json({ ok: true });

  if (!b.name || !b.phone || !b.product) {
    return res.status(400).json({
      ok: false,
      message: "Name, phone and product are required.",
    });
  }

  const clean = (v, n = 500) => String(v || "").trim().slice(0, n);

  const lead = {
    date: new Date().toISOString(),
    name: clean(b.name, 120),
    company: clean(b.company, 160),
    phone: clean(b.phone, 40),
    email: clean(b.email, 160),
    city: clean(b.city, 120),
    product: clean(b.product, 100),
    quantity: clean(b.quantity, 100),
    message: clean(b.message, 1000),
  };

  // Save the enquiry first
  try {
    const all = JSON.parse(fs.readFileSync(FILE, "utf8"));
    all.push(lead);
    fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
  } catch (err) {
    console.error("Lead save failed:", err.message);
    return res.status(500).json({
      ok: false,
      message: "Could not save enquiry. Please contact us by WhatsApp or phone.",
    });
  }

  // Email configuration
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Amrut Foods Website" <${process.env.ENQUIRY_FROM || process.env.SMTP_USER}>`,
      to: process.env.ENQUIRY_TO,
      subject: `New Website Enquiry — ${lead.product}`,
      text: [
        "New enquiry received from amrutfoodz.com",
        "",
        `Name: ${lead.name}`,
        `Company: ${lead.company}`,
        `Phone: ${lead.phone}`,
        `Email: ${lead.email}`,
        `City: ${lead.city}`,
        `Product: ${lead.product}`,
        `Quantity: ${lead.quantity}`,
        `Message: ${lead.message}`,
        `Received: ${lead.date}`,
      ].join("\n"),
    });

    console.log("Enquiry email sent:", lead.date);

    return res.status(201).json({
      ok: true,
      message: "Enquiry received. We will contact you soon.",
    });
  } catch (err) {
    console.error("Enquiry email failed:", err.message);

    // Enquiry is saved even if email fails
    return res.status(201).json({
      ok: true,
      message: "Enquiry received. We will contact you soon.",
    });
  }
});

app.get("*", (_, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

app.listen(PORT, () => console.log("Website running on " + PORT));
