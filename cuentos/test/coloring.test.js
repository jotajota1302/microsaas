const test = require("node:test");
const assert = require("node:assert");
const C = require("../lib/coloring.js");

test("the gallery has 20 themes with unique slugs in both languages", () => {
  assert.strictEqual(C.THEMES.length, 20);
  // A slug can be the same word in both languages (robots, halloween); what
  // must not repeat is a slug within one language, which would collide as a url.
  const es = new Set(), en = new Set();
  for (const t of C.THEMES) {
    for (const [s, seen] of [[t.slug, es], [t.en, en]]) {
      assert.match(s, /^[a-z]+$/, `slug "${s}" must be plain lowercase ascii`);
      assert.ok(!seen.has(s), `duplicate slug "${s}"`);
      seen.add(s);
    }
  }
});

test("every theme carries copy in both languages and a scene for the model", () => {
  for (const t of C.THEMES) {
    for (const lang of ["es", "en"]) {
      assert.ok(t.title[lang] && t.title[lang].length <= 40, `${t.slug}: ${lang} title`);
      assert.ok(t.intro[lang] && t.intro[lang].length >= 40, `${t.slug}: ${lang} intro too short`);
    }
    assert.ok(t.scene.length >= 60, `${t.slug}: scene too vague`);
    assert.ok(!/[áéíóúñ]/i.test(t.scene), `${t.slug}: the scene must be in English`);
  }
});

test("the prompt puts the frozen line-art style before the scene", () => {
  const p = C.coloringPrompt("gatos");
  assert.ok(p.startsWith(C.SHEET_STYLE));
  assert.match(p, /kittens playing with a big ball of wool/);
  assert.doesNotMatch(p, /watercolour/, "a colouring page must never ask for the watercolour style");
});

test("themes resolve from either language, and unknown ones throw", () => {
  assert.strictEqual(C.findTheme("cats"), C.findTheme("gatos"));
  assert.strictEqual(C.findTheme("nope"), null);
  assert.throws(() => C.coloringPrompt("nope"), /unknown colouring theme/);
});

test("urls are language-specific but the files are shared", () => {
  const t = C.findTheme("espacio");
  assert.strictEqual(C.themeUrl(t, "es"), "/colorear/espacio/");
  assert.strictEqual(C.themeUrl(t, "en"), "/en/coloring/space/");
  const a = C.assetPaths(t);
  assert.strictEqual(a.pdf, "/colorear/pdf/espacio.pdf");
  assert.strictEqual(a.thumb, "/colorear/img/espacio-thumb.webp");
});
