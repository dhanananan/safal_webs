/* ------------------------------------------------------------------
   Configuration
   Point this at your form handler / autoresponder / CRM webhook.
   It receives a JSON POST: { name, email, consent }.
   While it is empty, the form validates and shows the success state
   but does NOT send the details anywhere.
------------------------------------------------------------------- */
const WEBINAR_ENDPOINT = "";

/* ------------------------------------------------------------------ */

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* Footer year */
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  /* Scroll reveal */
  const revealEls = $$(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`;
      io.observe(el);
    });
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  /* Hero sign-up form */
  const form = $("#signup-form");
  const formWrap = $("#signup-form-wrap");
  const done = $("#signup-done");

  // Any "#join" link (header / bottom CTA) scrolls to the form and focuses the first field.
  $$('a[href="#join"]').forEach((link) =>
    link.addEventListener("click", () => {
      setTimeout(() => {
        if (!formWrap.hidden) $("input[name=name]", form).focus({ preventScroll: true });
      }, 500);
    })
  );

  const setError = (name, message) => {
    const input = $(`[name=${name}]`, form);
    const out = $(`.error[data-for=${name}]`, form);
    if (out) out.textContent = message;
    if (input) {
      if (message) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
  };

  const validate = () => {
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const consent = data.get("consent") === "on";
    let ok = true;

    setError("name", name ? "" : (ok = false, "Please enter your name."));
    setError("email", /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? "" : (ok = false, "Please enter a valid email address."));
    setError("consent", consent ? "" : (ok = false, "Please tick the consent box to continue."));

    return ok ? { name, email, consent } : null;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = validate();
    if (!payload) {
      const firstBad = $("[aria-invalid=true]", form) || $("input[name=consent]", form);
      firstBad && firstBad.focus();
      return;
    }

    const submit = $("button[type=submit]", form);
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = "Sending…";

    try {
      if (WEBINAR_ENDPOINT) {
        const res = await fetch(WEBINAR_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      } else {
        console.warn("WEBINAR_ENDPOINT is not set — sign-up was not sent anywhere.");
      }
      $("#done-name").textContent = payload.name.split(" ")[0];
      formWrap.hidden = true;
      done.hidden = false;
    } catch (err) {
      console.error(err);
      setError("email", "Something went wrong. Please try again.");
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  });

  /* Cookie notice */
  const cookie = $("#cookie");
  const KEY = "cookie-consent";
  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const write = () => { try { localStorage.setItem(KEY, "agreed"); } catch { /* storage unavailable */ } };

  if (cookie && !read()) {
    setTimeout(() => (cookie.hidden = false), 900);
    $("#cookie-agree").addEventListener("click", () => {
      write();
      cookie.hidden = true;
    });
  }
})();
