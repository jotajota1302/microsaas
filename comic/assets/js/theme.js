/*
 * Día y noche.
 *
 * Loaded SYNCHRONOUSLY from <head>, before anything paints. A theme script at
 * the end of the body means the page renders in the wrong colours and then
 * snaps — the flash everybody has seen on a badly wired dark mode.
 *
 * Policy, in order of precedence:
 *   1. what this visitor chose here before (localStorage)
 *   2. what their system asks for (prefers-color-scheme, handled in CSS)
 *   3. night, which is the brand direction
 *
 * Only step 1 lives in JS: with no stored choice the attribute is left OFF and
 * the stylesheet decides, so a visitor who has never touched the switch follows
 * their machine and the page still works with JavaScript disabled.
 */
(function () {
  "use strict";

  var KEY = "myownmanga-theme";
  var root = document.documentElement;

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : null;
    } catch (e) {
      // Private mode, blocked storage: not an error, just no memory.
      return null;
    }
  }

  var choice = stored();
  if (choice) root.setAttribute("data-theme", choice);

  /** What is actually on screen right now, chosen or inherited from the system. */
  function current() {
    return root.getAttribute("data-theme") ||
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  }

  var NS = "http://www.w3.org/2000/svg";
  var SUN = [
    ["circle", { cx: 12, cy: 12, r: 4 }],
    ["path", { d: "M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" }],
  ];
  var MOON = [["path", { d: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" }]];

  /* Built with DOM nodes, not innerHTML. The markup here is a constant, but an
     icon builder is exactly the helper somebody later feeds a variable into. */
  function icon(mode) {
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "17");
    svg.setAttribute("height", "17");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    (mode === "dark" ? SUN : MOON).forEach(function (part) {
      var el = document.createElementNS(NS, part[0]);
      Object.keys(part[1]).forEach(function (k) { el.setAttribute(k, part[1][k]); });
      svg.appendChild(el);
    });
    return svg;
  }

  function paint(btn) {
    var now = current();
    var next = now === "dark" ? "light" : "dark";
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    btn.appendChild(icon(now)); // shows where the switch takes you, not where you are
    var label = next === "light" ? "Cambiar a modo día" : "Cambiar a modo noche";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
  }

  /*
   * The button is injected rather than written into six HTML files: one place
   * to change it, and every page that loads this script gets it — landing,
   * English landing, the preview viewer and the legal pages.
   */
  function mount() {
    var nav = document.querySelector(".top nav") || document.querySelector(".top .wrap");
    if (!nav) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    paint(btn);

    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* sin memoria, pero cambia igual */ }
      paint(btn);
    });

    // A page with no nav (the legal ones) gets the button pushed to the right.
    if (!document.querySelector(".top nav")) btn.style.marginLeft = "auto";
    nav.appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  // Somebody flipping their OS theme while the page is open, and who has never
  // used our switch, should follow along: CSS does that on its own, but the
  // icon has to be repainted.
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: light)");
    var onChange = function () {
      if (stored()) return;
      var btn = document.querySelector(".theme-toggle");
      if (btn) paint(btn);
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();
