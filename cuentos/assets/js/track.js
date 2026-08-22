/*
 * Audience measurement, first party and cookieless.
 *
 * What it sends: that a page was seen, that the button was pressed, that the
 * form was started, that "pay" was pressed. What it never sends: anything
 * anybody typed, the story token, the full referrer, or any identifier that
 * survives the visit.
 *
 * The visit id lives in sessionStorage — it dies with the tab, it is random,
 * and it exists only so "visits" is not the same number as "page views". No
 * cookie, so no banner, which is the whole point.
 *
 * Everything here fails silently. A shop that breaks because its statistics
 * broke has its priorities backwards.
 */
(function () {
  var ENDPOINT = "/api/track";
  var KEY = "cuentos.visit";

  function visitId() {
    try {
      var v = sessionStorage.getItem(KEY);
      if (!v) {
        v = (Math.random().toString(36) + Date.now().toString(36)).slice(2, 18);
        sessionStorage.setItem(KEY, v);
      }
      return v;
    } catch (e) {
      return null; // private window: the visit is simply not stitched
    }
  }

  function device() {
    var w = Math.min(screen.width || 0, screen.height || 0);
    if (!w) return null;
    return w < 600 ? "movil" : w < 900 ? "tableta" : "escritorio";
  }

  function utm() {
    try {
      var q = new URLSearchParams(location.search);
      var out = {};
      ["source", "medium", "campaign"].forEach(function (k) {
        var v = q.get("utm_" + k);
        if (v) out[k] = v;
      });
      return out;
    } catch (e) {
      return {};
    }
  }

  var sent = {};

  function track(name, once) {
    try {
      if (once) {
        if (sent[name]) return;
        sent[name] = true;
      }
      var body = JSON.stringify({
        name: name,
        path: location.pathname,
        ref: document.referrer || "",
        utm: utm(),
        locale: document.documentElement.lang === "en" ? "en" : "es",
        device: device(),
        visit: visitId(),
      });
      // sendBeacon survives the page being left, which is exactly when the
      // interesting clicks happen.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      } else {
        fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {});
      }
    } catch (e) {
      /* never let measurement break a page */
    }
  }

  window.cuentosTrack = track;

  function start() {
    track("view", true);
    // The button that starts everything, wherever it is on the page.
    document.addEventListener(
      "click",
      function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[href*="/crear"], a[data-cta], button[data-cta]') : null;
        if (a) track("cta", true);
      },
      true
    );
    // The form being touched for the first time is the honest "started".
    var form = document.getElementById("f");
    if (form) {
      form.addEventListener("input", function () { track("form_start", true); }, { once: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
