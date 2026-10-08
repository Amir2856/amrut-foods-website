(() => {
  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".main-nav");
  if (menuButton && nav) {
    menuButton.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");
    }));
  }
  document.querySelectorAll(".enquire-product").forEach(button => button.addEventListener("click", () => {
    const select = document.querySelector('select[name="product"]');
    if (select) { select.value = button.dataset.product; document.querySelector("#contact")?.scrollIntoView({behavior:"smooth"}); setTimeout(() => select.focus({preventScroll:true}), 450); }
  }));
  const year = document.querySelector("#year"); if (year) year.textContent = new Date().getFullYear();
  const items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }), {threshold:.12});
    items.forEach(item => observer.observe(item));
  } else items.forEach(item => item.classList.add("is-visible"));
  const form = document.querySelector("#enquiry-form"), status = document.querySelector("#form-status");
  if (form && status) form.addEventListener("submit", async event => {
    event.preventDefault(); status.classList.remove("error"); status.textContent = "";
    const button = form.querySelector('button[type="submit"]'), label = button.querySelector(".submit-text"), old = label.textContent;
    button.disabled = true; label.textContent = "Sending enquiry…";
    try {
      const response = await fetch("/api/enquiry", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || "Could not send your enquiry. Please try again.");
      status.textContent = result.message || "Thank you! Your enquiry has been received."; form.reset();
    } catch (error) { status.classList.add("error"); status.textContent = error.message || "Something went wrong. Please WhatsApp us at +91 72100 97007."; }
    finally { button.disabled = false; label.textContent = old; }
  });
})();
