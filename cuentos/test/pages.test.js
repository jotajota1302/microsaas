/*
 * The static pages, checked against the filesystem.
 *
 * Two things went wrong before and neither showed up anywhere: a page linked
 * to a directory that did not exist (a customer finds that, nobody else), and
 * the whole free colouring gallery — 42 pages of SEO, the cheapest traffic we
 * have — was built without the measurement script, so its visits were never
 * counted. Both are one grep away from being caught here.
 */

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", "out", "docs", "test", "scripts", "lib", "api", "schema", "supabase", ".git", ".vercel", "assets"]);

/** Every index.html we serve, as site paths ("/", "/en/print/"). */
function pages(dir = ROOT, base = "/") {
  const found = [];
  if (fs.existsSync(path.join(dir, "index.html"))) found.push(base);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
    found.push(...pages(path.join(dir, entry.name), `${base}${entry.name}/`));
  }
  return found;
}

const read = (p) => fs.readFileSync(path.join(ROOT, p.replace(/^\//, ""), "index.html"), "utf8");

/** Does a site path exist on disk, as a file or as a directory with an index? */
function resolves(href) {
  const clean = href.split("#")[0].split("?")[0];
  if (!clean || clean === "/") return true;
  const target = path.join(ROOT, clean.replace(/^\//, ""));
  if (fs.existsSync(target)) return fs.statSync(target).isFile() || fs.existsSync(path.join(target, "index.html"));
  return false;
}

const ALL = pages();

test("the site has the pages we think it has", () => {
  for (const p of ["/", "/en/", "/crear/", "/legal/", "/colorear/", "/en/coloring/", "/imprimir/", "/en/print/", "/c/", "/admin/"]) {
    assert.ok(ALL.includes(p), `${p} is missing`);
  }
});

test("every public page measures its audience, and the panel never does", () => {
  for (const p of ALL) {
    const has = read(p).includes("/assets/js/track.js");
    if (p === "/admin/") assert.ok(!has, "the panel is ours: it must not be measured");
    else assert.ok(has, `${p} does not load track.js, so its visits are invisible`);
  }
});

test("no internal link points at a page that does not exist", () => {
  for (const p of ALL) {
    const html = read(p);
    for (const m of html.matchAll(/href="(\/[^"#][^"]*)"/g)) {
      const href = m[1];
      // Templates (${...}) are filled in at runtime; /api and /c/<token> are
      // served by functions and rewrites, not by files.
      if (href.includes("${") || href.startsWith("/api/") || /^\/c\/./.test(href)) continue;
      assert.ok(resolves(href), `${p} links to ${href}, which does not exist`);
    }
  }
});

test("the printing page exists in both languages and each points at the other", () => {
  const es = read("/imprimir/");
  const en = read("/en/print/");
  assert.ok(es.includes('hreflang="en" href="https://cuentos-seven.vercel.app/en/print/"'), "the Spanish page does not declare the English one");
  assert.ok(en.includes('hreflang="es" href="https://cuentos-seven.vercel.app/imprimir/"'), "the English page does not declare the Spanish one");
  assert.ok(es.includes('href="/en/print/"'), "no way to reach the English page from the Spanish one");
  assert.ok(en.includes('href="/imprimir/"'), "no way to reach the Spanish page from the English one");
});

test("the printing page asks the waitlist for the printed edition, not for something else", () => {
  for (const [p, locale] of [["/imprimir/", "es"], ["/en/print/", "en"]]) {
    const html = read(p);
    assert.ok(html.includes('"/api/waitlist"'), `${p} does not collect emails`);
    assert.match(html, /reason:\s*"print"/, `${p} files its emails under the wrong reason`);
    assert.ok(html.includes(`locale: "${locale}"`), `${p} files its emails under the wrong language`);
  }
});

test("both landings and the sitemap lead to it", () => {
  assert.ok(read("/").includes('href="/imprimir/"'), "the Spanish landing does not link to it");
  assert.ok(read("/en/").includes('href="/en/print/"'), "the English landing does not link to it");
  const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  for (const u of ["/imprimir/", "/en/print/"]) {
    assert.ok(sitemap.includes(`${u}</loc>`), `${u} is not in the sitemap, so nobody will find it`);
  }
});

test("the printing page does not lie about the book it is describing", () => {
  const C = require("../lib/collection.js");
  const n = C.BOOK_PAGE_COUNT;
  // The whole page argues "hand this file to a printer as it is". If the book
  // changes length and this page still says 18, or stops being a multiple of
  // four while the page promises it is, we have sent somebody to a counter
  // with the wrong file.
  assert.strictEqual(n % 4, 0, "the book is no longer a multiple of four, so the page's promise is false");
  assert.ok(read("/imprimir/").includes(`${n} páginas cuadradas`), `the Spanish page does not say ${n} pages`);
  assert.ok(read("/en/print/").includes(`${n} square pages`), `the English page does not say ${n} pages`);
});

test("the viewer sends each language to its own printing page", () => {
  const i18n = fs.readFileSync(path.join(ROOT, "assets", "js", "i18n.js"), "utf8");
  for (const url of ["/imprimir/", "/en/print/"]) {
    assert.ok(i18n.includes(`print_how_url: "${url}"`), `no locale points at ${url}`);
    assert.ok(resolves(url), `${url} is offered to customers but does not exist`);
  }
  assert.ok(read("/c/").includes("${T.print_how_url}"), "the book page does not offer the printing help");
});
