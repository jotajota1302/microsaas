/*
 * Landing behaviour. No framework, no build.
 *
 * The form is filled FROM the generated catalogue (options.js), never by hand:
 * a hand-written <option> is how a value the validator rejects reaches a paying
 * customer. Same rule as cuentos.
 */
(function () {
  "use strict";

  var O = window.COMIC_OPTIONS || {};
  var lang = document.documentElement.lang === "en" ? "en" : "es";

  // --- fill every <select data-options="..."> --------------------------------
  Array.prototype.forEach.call(document.querySelectorAll("[data-options]"), function (sel) {
    var list = O[sel.dataset.options] || [];
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    if (sel.name === "sidekickRelation") {
      sel.appendChild(new Option(lang === "en" ? "— nobody —" : "— nadie —", ""));
    }
    var hints = {};
    list.forEach(function (item) {
      var text = lang === "en" && item.en ? item.en : item.label;
      sel.appendChild(new Option(text, item.id));
      if (item.hint) hints[item.id] = item.hint;
    });

    /*
     * The hint goes UNDER the select, not inside the option text. A <select>
     * is as wide as its longest option, so "Manga en blanco y negro · El manga
     * de verdad: tinta, tramas y líneas de velocidad, sin color." made the
     * control a whole sentence wide and pushed the form off the screen.
     */
    if (Object.keys(hints).length) {
      var live = document.createElement("p");
      live.className = "live";
      sel.parentNode.appendChild(live);
      var update = function () { live.textContent = hints[sel.value] || ""; };
      sel.addEventListener("change", update);
      update();
    }
  });

  // --- UTM: whatever brought them here travels with the order ---------------
  function utm() {
    var q = new URLSearchParams(location.search);
    var out = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content"].forEach(function (k) {
      if (q.get(k)) out[k] = q.get(k);
    });
    return out;
  }

  // --- submit ---------------------------------------------------------------
  var form = document.getElementById("orderForm");
  var msg = document.getElementById("formMsg");
  if (!form) return;

  /*
   * Turnstile, fetched rather than baked in: the site key changes per
   * deployment and this page has no build step.
   *
   * If the key is not configured the widget never appears and the server does
   * not enforce it — a missing captcha must never stop the site selling. And
   * the widget goes in only AFTER the config answers, so a slow or failed
   * request leaves a working form rather than a spinner.
   */
  var turnstileReady = false;
  fetch("/api/config", { cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      if (!cfg || !cfg.turnstileSiteKey) return;
      var slot = document.createElement("div");
      slot.className = "cf-turnstile";
      slot.setAttribute("data-sitekey", cfg.turnstileSiteKey);
      slot.setAttribute("data-theme", "auto");
      slot.style.margin = "0 0 14px";
      var foot = form.querySelector(".form-foot");
      (foot || form).insertBefore(slot, (foot || form).firstChild);

      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.defer = true;
      s.onload = function () { turnstileReady = true; };
      document.head.appendChild(s);
    })
    .catch(function () { /* sin config, el formulario funciona igual */ });

  var TEXT = {
    es: {
      name: "Escribe su nombre (solo el nombre).",
      email: "Necesitamos un correo válido para mandarte la vista previa.",
      sending: "Preparando su historia…",
      ok: "Hecho. Te llevamos a su historia…",
      robot: "Marca la casilla de «no soy un robot» antes de seguir.",
      err: "No hemos podido guardarlo. Vuelve a intentarlo en un momento.",
    },
    en: {
      name: "Write their first name (first name only).",
      email: "We need a valid email to send you the preview.",
      sending: "Putting their story together…",
      ok: "Done. Taking you to their story…",
      robot: "Tick the «I am not a robot» box before continuing.",
      err: "We could not save that. Please try again in a moment.",
    },
  }[lang];

  function say(text, isError) {
    msg.textContent = text;
    msg.className = "formmsg" + (isError ? " err" : "");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form).entries());

    // Client-side checks are courtesy only: the server validates again, and the
    // catalogue is what actually decides which values are legal.
    if (!data.name || data.name.trim().length < 2 || /\d/.test(data.name)) {
      return say(TEXT.name, true);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || "")) {
      return say(TEXT.email, true);
    }

    var body = {
      name: data.name.trim(),
      ageBand: data.ageBand,
      gender: data.gender,
      hairShape: data.hairShape,
      hairColour: data.hairColour,
      eyes: data.eyes,
      skin: data.skin,
      build: data.build,
      mark: data.mark,
      trait: data.trait,
      trope: data.trope,
      tone: data.tone,
      style: data.style,
      email: data.email.trim(),
      lang: lang,
      utm: utm(),
    };
    if (data.sidekickName && data.sidekickRelation) {
      body.sidekick = { name: data.sidekickName.trim(), relation: data.sidekickRelation };
    }
    // Turnstile drops its token into a hidden field inside the form. Sent when
    // it is there; the server decides whether it was required.
    if (data["cf-turnstile-response"]) body.turnstile = data["cf-turnstile-response"];
    if (turnstileReady && !body.turnstile) return say(TEXT.robot, true);

    say(TEXT.sending);
    var btn = form.querySelector("button[type=submit]");
    btn.disabled = true;

    fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        return r.json().then(function (json) {
          if (r.ok) return json;
          // The server writes a better message than we can guess: the daily
          // ceiling, the per-visitor one, a value the catalogue rejected. The
          // generic "try again" hid all three.
          var e = new Error(json.error || TEXT.err);
          e.friendly = Boolean(json.error);
          throw e;
        });
      })
      .then(function (out) {
        /*
         * Straight to their preview. The first version said "check your email"
         * and reset the form, which threw away the URL the API had just
         * returned — and the viewer is the ONLY page with a buy button on it.
         * The email still goes out; it is the way back, not the way in.
         */
        say(TEXT.ok);
        if (out && out.url) location.href = out.url;
        else form.reset();
      })
      .catch(function (e) {
        say(e && e.friendly ? e.message : TEXT.err, true);
        btn.disabled = false;
      });
  });
})();
