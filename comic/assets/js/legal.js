/*
 * Fills the operator's identity into the legal pages from /api/config.
 *
 * These pages used to carry {{NOMBRE}}, {{NIF}}, {{DOMICILIO}} and {{EMAIL}}
 * as literal text. Two things were wrong with that: the data is the operator's
 * real personal and tax information and this repository is public, and a
 * template marker that reaches a customer is worse than an honest blank —
 * it reads as an abandoned site, which is the opposite of what a legal notice
 * is for.
 *
 * If the values are not configured the page says so plainly instead of showing
 * braces. That is not a fix, and the admin panel flags it as a blocker: you
 * cannot legally sell in Spain without this on the site (LSSI art. 10).
 */
(function () {
  "use strict";

  var slots = document.querySelectorAll("[data-legal]");
  if (!slots.length) return;

  var MISSING = {
    name: "[pendiente de completar: titular]",
    nif: "[pendiente: NIF]",
    address: "[pendiente: domicilio]",
    email: "[pendiente: correo de contacto]",
  };

  function fill(op, ret) {
    Array.prototype.forEach.call(slots, function (el) {
      var key = el.dataset.legal;

      if (key === "keepUnpaid" || key === "keepPaid") {
        var days = ret && ret[key === "keepUnpaid" ? "KEEP_UNPAID_DAYS" : "KEEP_PAID_DAYS"];
        if (days) el.textContent = days === 365 ? "12 meses" : days + " días";
        return;
      }

      var value = op && op[key];
      if (key === "email" && value) {
        // A mailto, because a legal notice has to be contactable in one click.
        var a = document.createElement("a");
        a.href = "mailto:" + value;
        a.textContent = value;
        while (el.firstChild) el.removeChild(el.firstChild);
        el.appendChild(a);
        return;
      }
      el.textContent = value || MISSING[key] || "";
      if (!value) el.style.opacity = ".6";
    });
  }

  fetch("/api/config", { cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (cfg) { fill(cfg && cfg.operator, cfg && cfg.retention); })
    .catch(function () { fill(null, null); });
})();
