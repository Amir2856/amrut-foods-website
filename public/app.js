(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const btn = $(".menu-toggle"), nav = $(".main-nav");
  if (btn && nav) {
    const set = (open) => { nav.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open)); btn.setAttribute("aria-label", open ? "Close navigation" : "Open navigation"); };
    btn.addEventListener("click", () => set(!nav.classList.contains("open")));
    $$("a", nav).forEach((a) => a.addEventListener("click", () => set(false)));
  }

  const y = $("#year"); if (y) y.textContent = new Date().getFullYear();

  // Besan pack-size switcher
  const img = $("#besan-img"), note = $("#pack-note");
  $$(".tab").forEach((t) => t.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.remove("on")); t.classList.add("on");
    if (img) { img.src = `/images/${t.dataset.pack}.webp`; img.alt = t.dataset.alt; }
    if (note) note.textContent = t.dataset.note;
  }));

  const form = $("#enquiry-form"), status = $("#form-status");
  $$(".enquire-product").forEach((b) => b.addEventListener("click", () => {
    const sel = $('select[name="product"]'); if (!sel) return;
    sel.value = b.dataset.product; $("#contact")?.scrollIntoView({ behavior: "smooth" }); setTimeout(() => sel.focus({ preventScroll: true }), 500);
  }));

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } }), { threshold: 0.1 });
    $$(".reveal").forEach((el) => io.observe(el));
  } else $$(".reveal").forEach((el) => el.classList.add("is-visible"));

  if (!form || !status) return;
  const WA = "https://wa.me/917210097007";
  const showErr = (errs) => {
    $$(".err", form).forEach((s) => (s.textContent = ""));
    $$("[aria-invalid]", form).forEach((i) => i.removeAttribute("aria-invalid"));
    let first = null;
    Object.entries(errs).forEach(([k, m]) => {
      const f = form.elements[k], s = $(`.err[data-for="${k}"]`, form);
      if (s) s.textContent = m; if (f) { f.setAttribute("aria-invalid", "true"); first = first || f; }
    });
    if (first) first.focus();
  };
  const check = (d) => {
    const e = {};
    if ((d.name || "").trim().length < 2) e.name = "Please enter your name.";
    if (!/^[+()\d\s-]{7,30}$/.test((d.phone || "").trim()) || (d.phone || "").replace(/\D/g, "").length < 7) e.phone = "Please enter a valid phone number.";
    if (!d.product) e.product = "Please choose a product.";
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) e.email = "Please enter a valid email address.";
    return e;
  };

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault(); status.className = "status"; status.textContent = "";
    const data = Object.fromEntries(new FormData(form).entries());
    const errs = check(data); showErr(errs);
    if (Object.keys(errs).length) { status.classList.add("error"); status.textContent = "Please correct the highlighted fields."; return; }
    const b = $('button[type="submit"]', form), label = $(".submit-text", b), old = label.textContent;
    b.disabled = true; label.textContent = "Sending...";
    try {
      const r = await fetch("/api/enquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { if (j.errors) showErr(j.errors); throw new Error(j.message || "Could not send your enquiry."); }
      status.classList.add("ok"); status.textContent = j.message || "Thank you. Your enquiry has been received."; form.reset();
    } catch (err) {
      status.classList.add("error"); status.textContent = `${err.message} `;
      const a = document.createElement("a"); a.href = `${WA}?text=${encodeURIComponent("Hello Maha Amrut, I would like to enquire about your products.")}`; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Contact us on WhatsApp";
      status.appendChild(a);
    } finally { b.disabled = false; label.textContent = old; }
  });
})();
