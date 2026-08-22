/*
 * Builds the static colouring gallery from lib/coloring.js.
 *
 *   node scripts/build-coloring-gallery.js
 *
 * Writes 2 index pages + 40 theme pages + sitemap.xml. Everything is plain
 * HTML with no JavaScript beyond the email form, so the gallery costs nothing
 * to serve and indexes cleanly. Re-run it after editing the catalogue or the
 * copy below; the generated files are committed.
 */

const fs = require("fs");
const path = require("path");
const G = require("../lib/coloring.js");

const ROOT = path.join(__dirname, "..");
const BASE = "https://cuentos-seven.vercel.app";
const LANGS = ["es", "en"];

const T = {
  es: {
    lang: "es", dir: "colorear", other: "/en/coloring/", otherLabel: "English",
    brand: "el cuento de su vida",
    indexTitle: "20 dibujos para colorear gratis (imprimir en PDF) — Familia de cuento",
    indexDesc: "Veinte páginas para colorear listas para imprimir en A4: dinosaurios, unicornios, dragones, sirenas, espacio y más. Descarga gratis en PDF, sin registro.",
    h1: "Dibujos para colorear gratis",
    lede: "Veinte páginas en A4, listas para imprimir. Sin registro y sin marcas de agua: eliges el dibujo, lo descargas en PDF y a por los lápices.",
    all: "Todos los dibujos",
    download: "Descargar en PDF",
    downloadPng: "Descargar la imagen",
    back: "← Todos los dibujos",
    printTitle: "Cómo se imprime",
    printBody: "El PDF es un A4 con margen: imprime a tamaño real (100 %, sin «ajustar a la página») en papel normal. Si vas a usar rotuladores, sube el gramaje a 120 g para que no traspasen.",
    ctaTitle: "¿Y si el protagonista fuera él?",
    ctaBody: "Estas páginas son iguales para todo el mundo. Un cuento personalizado no: tu hijo es el protagonista, con su familia, sus amigos y lo que está viviendo ahora. Lees el guion gratis y solo pagas si te gusta.",
    ctaBtn: "Crear su cuento — gratis",
    mailTitle: "Te avisamos cuando haya más",
    mailBody: "Cada mes subimos dibujos nuevos. Déjanos el correo y te avisamos; nada más.",
    mailBtn: "Avísame",
    mailOk: "Hecho. Te escribiremos cuando haya dibujos nuevos.",
    mailErr: "No hemos podido guardarlo. Inténtalo dentro de un rato.",
    mailPlaceholder: "tu@correo.com",
    related: "Más dibujos",
    legal: ["Aviso legal", "Privacidad", "Condiciones"],
    freeNote: "Uso libre en casa, en el cole y en actividades infantiles. No los revendas ni los subas a otra web como si fueran tuyos.",
  },
  en: {
    lang: "en", dir: "en/coloring", other: "/colorear/", otherLabel: "Español",
    brand: "the story of their life",
    indexTitle: "20 free colouring pages to print (PDF) — Familia de cuento",
    indexDesc: "Twenty A4 colouring pages ready to print: dinosaurs, unicorns, dragons, mermaids, space and more. Free PDF download, no sign-up.",
    h1: "Free colouring pages",
    lede: "Twenty A4 pages, ready to print. No sign-up and no watermarks: pick a drawing, download the PDF and get the pencils out.",
    all: "Every drawing",
    download: "Download the PDF",
    downloadPng: "Download the image",
    back: "← Every drawing",
    printTitle: "How to print it",
    printBody: "The PDF is a bordered A4: print at full size (100 %, not «fit to page») on ordinary paper. For felt tips, use 120 gsm so they do not bleed through.",
    ctaTitle: "What if they were the hero?",
    ctaBody: "These pages are the same for everyone. A personalised storybook is not: your child is the hero, with their family, their friends and whatever they are going through right now. You read the script for free and only pay if you love it.",
    ctaBtn: "Create their story — free",
    mailTitle: "We will tell you when there are more",
    mailBody: "We add new drawings every month. Leave your email and we will let you know. Nothing else.",
    mailBtn: "Tell me",
    mailOk: "Done. We will write when there are new drawings.",
    mailErr: "We could not save it. Please try again in a while.",
    mailPlaceholder: "you@email.com",
    related: "More drawings",
    legal: ["Legal notice", "Privacy", "Terms"],
    freeNote: "Free to use at home, at school and in children's activities. Do not resell them or republish them elsewhere as your own.",
  },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function shell({ t, title, desc, canonical, alternate, body, jsonLd }) {
  const home = t.lang === "en" ? "/en/" : "/";
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${BASE}${canonical}">
<link rel="alternate" hreflang="es" href="${BASE}${t.lang === "es" ? canonical : alternate}">
<link rel="alternate" hreflang="en" href="${BASE}${t.lang === "en" ? canonical : alternate}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Karla:wght@400;700&family=Andika:wght@400;700&display=swap">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/app.css">
<script src="/assets/js/track.js" defer></script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand-mark" href="${home}"><svg class="mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 L33 16"/><path d="M20 6 L7 16"/><path d="M9.5 17.5 V32 h21 V17.5"/><path d="M20 6 V32"/></g><circle cx="14.5" cy="23" r="1.8" fill="currentColor"/><circle cx="25.5" cy="23" r="1.8" fill="currentColor"/></svg>${t.lang === "en" ? '<span class="wordmark">Storybook <b>Family</b></span>' : '<span class="wordmark">Familia de <b>cuento</b></span>'}<span class="tag">${t.brand}</span></a>
    <a class="lang" href="${alternate}">${t.otherLabel}</a>
  </header>

${body}

  <footer>
    <a href="/legal/">${t.legal[0]}</a><a href="/legal/#privacidad">${t.legal[1]}</a><a href="/legal/#condiciones">${t.legal[2]}</a><span>© 2026</span>
  </footer>
</div>
</body>
</html>
`;
}

function mailForm(t) {
  return `    <section class="card stack" id="avisos">
      <h2>${t.mailTitle}</h2>
      <p class="muted">${t.mailBody}</p>
      <form class="row" id="mailForm">
        <input type="email" name="email" required placeholder="${t.mailPlaceholder}" style="flex:1;min-width:14rem">
        <button class="btn" type="submit">${t.mailBtn}</button>
      </form>
      <p class="muted" id="mailMsg" hidden></p>
    </section>

<script>
(function () {
  var form = document.getElementById("mailForm");
  var msg = document.getElementById("mailMsg");
  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var btn = form.querySelector("button");
    btn.disabled = true;
    try {
      var res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.value, locale: "${t.lang}", reason: "gallery" })
      });
      msg.textContent = res.ok ? ${JSON.stringify(t.mailOk)} : ${JSON.stringify(t.mailErr)};
      if (res.ok) form.hidden = true;
    } catch (e) {
      msg.textContent = ${JSON.stringify(t.mailErr)};
    }
    msg.hidden = false;
    btn.disabled = false;
  });
})();
</script>`;
}

function cta(t) {
  const href = t.lang === "en" ? "/crear/?lang=en" : "/crear/";
  return `    <section class="card stack">
      <h2>${t.ctaTitle}</h2>
      <p>${t.ctaBody}</p>
      <div class="row"><a class="btn big" href="${href}">${t.ctaBtn}</a></div>
    </section>`;
}

function card(t, theme) {
  const a = G.assetPaths(theme);
  return `      <a class="tile" href="${G.themeUrl(theme, t.lang)}">
        <img src="${a.thumb}" alt="${esc(theme.title[t.lang])}" width="560" height="792" loading="lazy">
        <span>${esc(theme.title[t.lang])}</span>
      </a>`;
}

function indexPage(t) {
  const canonical = t.lang === "en" ? "/en/coloring/" : "/colorear/";
  const alternate = t.other;
  const body = `  <main class="stack-lg">
    <section class="stack">
      <p class="eyebrow">${t.lang === "es" ? "Gratis · sin registro" : "Free · no sign-up"}</p>
      <h1>${t.h1}</h1>
      <p class="lede">${t.lede}</p>
    </section>

    <section class="stack">
      <h2>${t.all}</h2>
      <div class="tiles">
${G.THEMES.map((x) => card(t, x)).join("\n")}
      </div>
      <p class="muted">${t.freeNote}</p>
    </section>

${cta(t)}

${mailForm(t)}
  </main>`;
  return { canonical, html: shell({ t, title: t.indexTitle, desc: t.indexDesc, canonical, alternate, body }) };
}

function themePage(t, theme) {
  const canonical = G.themeUrl(theme, t.lang);
  const alternate = G.themeUrl(theme, t.lang === "es" ? "en" : "es");
  const a = G.assetPaths(theme);
  const name = theme.title[t.lang];
  const title = t.lang === "es"
    ? `Dibujo de ${name.toLowerCase()} para colorear (PDF gratis) — Familia de cuento`
    : `${name} colouring page (free PDF) — Storybook Family`;
  const desc = `${theme.intro[t.lang]} ${t.lang === "es" ? "Descarga gratis en A4, lista para imprimir." : "Free A4 download, ready to print."}`;
  const others = G.THEMES.filter((x) => x.slug !== theme.slug).slice(0, 6);

  const body = `  <main class="stack-lg">
    <section class="stack">
      <p class="eyebrow"><a href="${t.lang === "en" ? "/en/coloring/" : "/colorear/"}">${t.back}</a></p>
      <h1>${esc(name)}</h1>
      <p class="lede">${esc(theme.intro[t.lang])}</p>
    </section>

    <section class="stack">
      <figure class="sheet" style="margin:0;max-width:34rem">
        <img src="${a.thumb}" alt="${esc(desc)}" width="560" height="792">
      </figure>
      <div class="row">
        <a class="btn big" href="${a.pdf}" download>${t.download}</a>
        <a class="btn secondary" href="${a.png}" download>${t.downloadPng}</a>
      </div>
      <p class="muted">${t.freeNote}</p>
    </section>

    <section class="stack">
      <h2>${t.printTitle}</h2>
      <p>${t.printBody}</p>
    </section>

${cta(t)}

    <section class="stack">
      <h2>${t.related}</h2>
      <div class="tiles">
${others.map((x) => card(t, x)).join("\n")}
      </div>
    </section>

${mailForm(t)}
  </main>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    name,
    description: theme.intro[t.lang],
    contentUrl: `${BASE}${a.png}`,
    thumbnailUrl: `${BASE}${a.thumb}`,
    license: `${BASE}/legal/#condiciones`,
    creditText: "Familia de cuento",
    isAccessibleForFree: true,
  };
  return { canonical, html: shell({ t, title, desc, canonical, alternate, body, jsonLd }) };
}

function write(canonical, html) {
  const dir = path.join(ROOT, canonical.replace(/^\/|\/$/g, ""));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  return canonical;
}

function main() {
  const urls = [];
  for (const lang of LANGS) {
    const t = T[lang];
    const idx = indexPage(t);
    urls.push(write(idx.canonical, idx.html));
    for (const theme of G.THEMES) {
      const p = themePage(t, theme);
      urls.push(write(p.canonical, p.html));
    }
  }

  const staticUrls = ["/", "/en/", "/crear/", "/imprimir/", "/en/print/"];
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [...staticUrls, ...urls].map((u) => `  <url><loc>${BASE}${u}</loc></url>`).join("\n") +
    `\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap);
  fs.writeFileSync(
    path.join(ROOT, "robots.txt"),
    `User-agent: *\nAllow: /\nDisallow: /c/\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${BASE}/sitemap.xml\n`
  );

  console.log(`built ${urls.length} pages + sitemap.xml (${staticUrls.length + urls.length} urls) + robots.txt`);
}

main();
