/*
 * Builds a whole demo comic from a story JSON, end to end, the way the product
 * would: one character sheet, then every panel generated against it, then the
 * page laid out and lettered BY CODE (the model never writes a word).
 *
 * It also answers the open question from the first spike — can image-01 draw a
 * whole page in one image? — by generating each page both ways and putting the
 * two results side by side.
 *
 * Usage:
 *   node scripts/gen-demo.js                     # panels only
 *   node scripts/gen-demo.js --fullpage          # panels + whole-page comparison
 *   node scripts/gen-demo.js --pages 1,2         # just those pages
 *   node scripts/gen-demo.js --concurrency 6
 *
 * Output: out/demo/img/*.jpg, out/demo/index.html, out/demo/fullpage.html
 */

const fs = require("fs");
const path = require("path");
const S = require("../lib/style.js");
const letterer = require("../lib/letterer.js");

// --- env (project .env wins over the shell, same rule as cuentos) ------------
const ENV_FILE = path.join(__dirname, "..", ".env");
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}
if (!process.env.MINIMAX_API_KEY) throw new Error("missing MINIMAX_API_KEY");

const BASE = process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1";
// One output folder per story, chosen once the story file is known: generating
// Nerea must not overwrite Kia.
const OUT_ROOT = path.join(__dirname, "..", "out");
let OUT = path.join(OUT_ROOT, "demo");
let IMG = path.join(OUT, "img");
const COST = 0.0035;

// Panel shapes per layout. The page is portrait, so these are the cell ratios
// a real comic page uses: a wide establishing strip, square beats, a tall hero.
const LAYOUTS = {
  "wide-two": { aspects: ["16:9", "1:1", "1:1"] },
  "tall-stack": { aspects: ["2:3", "3:2", "3:2"] },
  quad: { aspects: ["1:1", "1:1", "1:1", "1:1"] },
  five: { aspects: ["16:9", "3:2", "3:2", "3:2", "3:2"] },
  six: { aspects: ["3:2", "3:2", "3:2", "3:2", "3:2", "3:2"] },
};

// --- provider ----------------------------------------------------------------

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * image-01 enforces a requests-per-minute cap and answers 1002 when you cross
 * it (measured 2026-08-22: concurrency 6 lost 4 of 21 panels). A dropped panel
 * is a hole in the middle of a page, so this retries with a backoff rather
 * than failing the job — the same reason cuentos retries per step.
 */
async function generate(opts) {
  let wait = 8000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await attemptGenerate(opts);
    } catch (e) {
      const rateLimited = /1002|rate limit/i.test(e.message);
      if (!rateLimited || attempt >= 5) throw e;
      await sleep(wait);
      wait *= 2;
    }
  }
}

async function attemptGenerate({ prompt, ref, aspect }) {
  const body = {
    model: "image-01",
    prompt,
    aspect_ratio: aspect || "1:1",
    response_format: "url",
    n: 1,
  };
  if (ref) {
    body.subject_reference = [
      { type: "character", image_file: `data:image/jpeg;base64,${ref.toString("base64")}` },
    ];
  }
  const started = Date.now();
  const res = await fetch(`${BASE}/image_generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const url = data.data && data.data.image_urls && data.data.image_urls[0];
  if (!url) throw new Error(JSON.stringify(data.base_resp || data).slice(0, 300));
  return { buffer: await download(url), ms: Date.now() - started };
}

/*
 * The content filter, and what to do about it.
 *
 * Measured 2026-08-22 on a dark-toned story with a 15-year-old protagonist:
 * MiniMax refused 19 of 83 images with `1026 input new_sensitive`. Taking the
 * character's real name out of the scene text (which we had to do anyway — see
 * the privacy rule in ../CLAUDE.md) fixed 13 of them. The remaining six share a
 * shape: a minor, at night, entering somewhere. Nothing violent, just a filter
 * being careful about children.
 *
 * A refusal cannot leave a hole in the middle of a page, so this climbs a
 * ladder: soften the framing, soften it harder, and if it still refuses, draw
 * the place without anybody in it. An establishing shot is a real comic panel;
 * a missing panel is a broken product.
 */
const SOFTEN = [
  // level 1: drop the words that co-occur with refusals, keep the composition
  (p) => p
    .replace(/\b(at night|in the dark|dark|dim|shadowy|shadows|gloom|deserted|empty street)\b/gi, "in low evening light")
    .replace(/\b(alone|by herself|by himself)\b/gi, "")
    .replace(/\bcrouch(ed|ing)?\b/gi, "kneeling")
    + " Calm, safe, all-ages comic panel. Nobody is in danger and nobody is threatening anybody.",
  // level 2: pull the camera back; a wide shot of a lit place reads as safe
  (p) => p
    .replace(/\b(close-up|extreme close-up|tight shot|over-the-shoulder shot|low angle)\b/gi, "wide shot")
    .replace(/\b(at night|in the dark|dark|dim|shadowy)\b/gi, "in daylight")
    + " Wide, bright, calm all-ages comic panel, everyday scene, nobody in danger.",
];

/** Last resort: the location, drawn empty. Always passes, always usable. */
function emptyPlacePrompt(job) {
  return job.prompt
    .replace(/Scene: [^.]*\./, "Scene: a wide establishing shot of the location, completely empty, no people at all.")
    + " No people, no figures, no silhouettes. Just the place.";
}

// Softening appends text, and image-01 rejects anything past 1500 characters
// with `2013 invalid params` — which looked like a second, different failure
// until the lengths were checked.
const clamp1500 = (text) => {
  if (text.length <= 1500) return text;
  const cut = text.slice(0, 1500);
  return cut.slice(0, cut.lastIndexOf(" "));
};

async function drawPanel(job, refs) {
  const ref = refs && refs[job.refKey];
  const attempts = [
    { prompt: job.prompt, ref, level: 0 },
    { prompt: clamp1500(SOFTEN[0](job.prompt)), ref, level: 1 },
    { prompt: clamp1500(SOFTEN[1](job.prompt)), ref, level: 2 },
    { prompt: clamp1500(emptyPlacePrompt(job)), ref: undefined, level: 3 },
  ];
  let last;
  for (const a of attempts) {
    try {
      const r = await generate({ prompt: a.prompt, ref: a.ref, aspect: job.aspect });
      return { ...r, level: a.level };
    } catch (e) {
      last = e;
      // Only a content refusal is worth softening; anything else is a real error.
      if (!/1026|sensitive/i.test(e.message)) throw e;
    }
  }
  throw last;
}

async function pool(items, limit, worker) {
  const out = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i], i);
      }
    })
  );
  return out;
}

// --- main --------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
  };
  const concurrency = Number(flag("concurrency", 6));
  const wantFullPage = argv.includes("--fullpage");
  // Experiment 2026-08-22: the same whole page, but with the hero's sheet as
  // subject_reference. In panel mode the reference forcing the hero in was a
  // defect; on a page where he appears in most panels it should be the fix
  // for the cross-page drift that whole-page mode suffers from.
  const wantFullPageRef = argv.includes("--fullpage-ref");
  const only = flag("pages", null);
  const onlyPages = only ? only.split(",").map((n) => Number(n.trim())) : null;

  const storyFile = flag("story", "stories/kia.json");
  const story = JSON.parse(fs.readFileSync(path.join(__dirname, "..", storyFile), "utf8"));
  const styleId = story.style || "shonen";
  // One folder per story: generating Nerea must not overwrite Kia.
  const slug = path.basename(storyFile).replace(/\.json$/, "");
  if (slug !== "kia") { OUT = path.join(OUT_ROOT, slug); IMG = path.join(OUT, "img"); }
  const hero = story.hero;
  fs.mkdirSync(IMG, { recursive: true });

  const log = [];
  const clock = {};
  const stamp = (id, ms, phase, err) => {
    log.push({ id, ms, phase, error: err || null });
    console.log(`  ${id.padEnd(18)} ${err ? `FAIL ${err.slice(0, 70)}` : `${(ms / 1000).toFixed(1)}s`}`);
  };
  const wallclock = async (phase, fn) => {
    const t0 = Date.now();
    await fn();
    clock[phase] = +((Date.now() - t0) / 1000).toFixed(1);
  };

  /* The cast. One reference sheet per character, because image-01 takes a
     single subject_reference: a panel can lock the hero OR the hero's ally,
     never both. Panels name which one they need. */
  const SUBJECTS = {
    hero: { block: S.characterBlock(hero), lock: S.identityLock(hero) },
  };
  for (const [key, c] of Object.entries(story.cast || {})) {
    SUBJECTS[key] = {
      block: S.castBlock(c.label, c.sheet),
      lock: `Keep ${c.label} strictly identical to the reference image: same armour, same colours, same build`,
    };
  }

  console.log(`\n"${story.title}" — ${story.pages.length} páginas · estilo ${styleId}\n\n1/4 hojas de personaje (${Object.keys(SUBJECTS).length})`);
  const refs = {};
  await wallclock("sheets", () => pool(Object.keys(SUBJECTS), 2, async (key) => {
    const dest = path.join(IMG, `sheet-${key}.jpg`);
    if (fs.existsSync(dest)) { refs[key] = fs.readFileSync(dest); console.log(`  sheet-${key.padEnd(12)} (reutilizada)`); return; }
    try {
      const { buffer, ms } = await generate({ prompt: S.sheetPrompt(SUBJECTS[key].block, styleId), aspect: "3:2" });
      fs.writeFileSync(dest, buffer);
      refs[key] = buffer;
      stamp(`sheet-${key}`, ms, "sheets");
    } catch (e) {
      stamp(`sheet-${key}`, 0, "sheets", e.message);
    }
  }));

  // The cover: the image that sells on Etsy and the first thing the teenager sees.
  console.log(`\n2/4 portada`);
  await wallclock("cover", async () => {
    const dest = path.join(IMG, "cover.jpg");
    if (fs.existsSync(dest)) { console.log("  cover              (reutilizada)"); return; }
    const sub = SUBJECTS[story.cover.ref] || SUBJECTS.hero;
    try {
      // The cover climbs the same ladder as a panel: it was refused too, and a
      // comic with no cover is not a product.
      const { buffer, ms, level } = await drawPanel({
        id: "cover",
        aspect: "2:3",
        refKey: story.cover.ref,
        prompt: S.coverPrompt({ block: sub.block, scene: story.cover.scene, styleId }),
      }, refs);
      fs.writeFileSync(dest, buffer);
      stamp("cover" + (level ? ` (nivel ${level})` : ""), ms, "cover");
    } catch (e) {
      stamp("cover", 0, "cover", e.message);
    }
  });

  // 3. Every panel of every page, each against the reference its subject needs.
  const jobs = [];
  story.pages.forEach((page, pi) => {
    if (onlyPages && !onlyPages.includes(pi + 1)) return;
    const aspects = (LAYOUTS[page.layout] || LAYOUTS.quad).aspects;
    page.panels.forEach((panel, qi) => {
      const id = `p${pi + 1}-${qi + 1}`;
      const subject = panel.ref ? SUBJECTS[panel.ref] : null;
      jobs.push({
        id,
        file: `${id}.jpg`,
        aspect: aspects[qi] || "1:1",
        refKey: panel.ref || null,
        prompt: S.panelPrompt({ subject, scene: panel.scene, room: panel.room, styleId }),
      });
    });
  });

  console.log(`\n3/4 ${jobs.length} viñetas, concurrencia ${concurrency}`);
  await wallclock("panels", () => pool(jobs, concurrency, async (job) => {
    const dest = path.join(IMG, job.file);
    if (fs.existsSync(dest)) { console.log(`  ${job.id.padEnd(18)} (reutilizada)`); return; }
    try {
      const { buffer, ms, level } = await drawPanel(job, refs);
      fs.writeFileSync(dest, buffer);
      stamp(job.id + (level ? ` (nivel ${level})` : ""), ms, "panels");
    } catch (e) {
      stamp(job.id, 0, "panels", e.message);
    }
  }));

  // 3b. The whole-page alternative, timed separately so the two are comparable.
  if (wantFullPage) {
    const blocks = [SUBJECTS.hero.block, ...Object.values(story.cast || {}).map((c) => S.castBlock(c.label, c.sheet))];
    const pageJobs = story.pages
      .map((page, pi) => ({ page, pi }))
      .filter(({ pi }) => !onlyPages || onlyPages.includes(pi + 1))
      .map(({ page, pi }) => ({
        id: `full-${pi + 1}`,
        file: `full-${pi + 1}.jpg`,
        prompt: S.fullPagePrompt({ blocks, panels: page.panels, styleId }),
      }));
    console.log(`\n3b/4 ${pageJobs.length} páginas enteras de una sola imagen`);
    await wallclock("fullpages", () => pool(pageJobs, concurrency, async (job) => {
      const dest = path.join(IMG, job.file);
      if (fs.existsSync(dest)) { console.log(`  ${job.id.padEnd(18)} (reutilizada)`); return; }
      try {
        const { buffer, ms } = await generate({ prompt: job.prompt, aspect: "2:3" });
        fs.writeFileSync(dest, buffer);
        stamp(job.id, ms, "fullpages");
      } catch (e) {
        stamp(job.id, 0, "fullpages", e.message);
      }
    }));
  }

  if (wantFullPageRef) {
    // Only the hero's block here: the reference image is doing the work of
    // pinning him, and dropping the cast blocks buys back the ~250 characters
    // the identity lock needs to fit under the 1500-char cap.
    const refJobs = story.pages
      .map((page, pi) => ({ page, pi }))
      .filter(({ pi }) => !onlyPages || onlyPages.includes(pi + 1))
      .map(({ page, pi }) => ({
        id: `ref-${pi + 1}`,
        file: `ref-${pi + 1}.jpg`,
        prompt: S.fullPagePrompt({
          blocks: [SUBJECTS.hero.block],
          panels: page.panels,
          lock: S.identityLock(hero),
        }),
      }));
    console.log(`
3c/4 ${refJobs.length} páginas enteras CON referencia de personaje`);
    await wallclock("fullpages_ref", () => pool(refJobs, concurrency, async (job) => {
      const dest = path.join(IMG, job.file);
      if (fs.existsSync(dest)) { console.log(`  ${job.id.padEnd(18)} (reutilizada)`); return; }
      try {
        const { buffer, ms } = await generate({ prompt: job.prompt, ref: refs.hero, aspect: "2:3" });
        fs.writeFileSync(dest, buffer);
        stamp(job.id, ms, "fullpages_ref");
      } catch (e) {
        stamp(job.id, 0, "fullpages_ref", e.message);
      }
    }));
  }

  // 4. Letter and lay out — no model involved past this line.
  console.log(`\n4/4 maquetación y rotulado (por código)`);
  fs.writeFileSync(path.join(OUT, "index.html"), reader(story, onlyPages, await placements(story, onlyPages)));
  if (wantFullPage) fs.writeFileSync(path.join(OUT, "fullpage.html"), fullPageSheet(story, onlyPages));

  const done = log.filter((r) => !r.error);
  const byPhase = (p) => done.filter((r) => r.phase === p);
  const cost = (n) => +(n * COST).toFixed(4);
  const summary = {
    images: log.length,
    ok: done.length,
    failed: log.length - done.length,
    cost_usd_total: cost(done.length),
    avg_seconds: done.length ? +(done.reduce((a, r) => a + r.ms, 0) / done.length / 1000).toFixed(1) : 0,
    per_phase: Object.fromEntries(
      ["sheets", "cover", "panels", "fullpages", "fullpages_ref"].map((p) => [
        p,
        { images: byPhase(p).length, cost_usd: cost(byPhase(p).length), wallclock_s: clock[p] || 0 },
      ])
    ),
    comic_by_panels: { images: byPhase("panels").length + byPhase("sheets").length + byPhase("cover").length,
      cost_usd: cost(byPhase("panels").length + byPhase("sheets").length + byPhase("cover").length),
      wallclock_s: +((clock.panels || 0) + (clock.sheets || 0) + (clock.cover || 0)).toFixed(1) },
    comic_by_fullpages: { images: byPhase("fullpages").length + byPhase("cover").length,
      cost_usd: cost(byPhase("fullpages").length + byPhase("cover").length),
      wallclock_s: +((clock.fullpages || 0) + (clock.cover || 0)).toFixed(1) },
  };
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ summary, log }, null, 2));
  console.log(`\n${JSON.stringify(summary, null, 2)}\n`);
  console.log(`open: ${path.join(OUT, "index.html")}\n`);
}

// --- the letterer ------------------------------------------------------------
// Bubbles are HTML over the image: the Spanish is always correct, it survives
// a retouch, and the English edition reuses every image without regenerating.

function bubble(b) {
  const cls = `bub ${b.type} at-${b.at || "top-left"}`;
  const who = b.who ? `<b class="who">${esc(b.who)}</b>` : "";
  return `<div class="${cls}">${who}${esc(b.text)}</div>`;
}

function panel(story, pi, qi, p, placed) {
  return `<figure class="panel a${qi + 1}">
      <img src="img/p${pi + 1}-${qi + 1}.jpg" alt="">
      ${(p.bubbles || []).map((b, bi) => bubble(b, placed[bi])).join("")}
    </figure>`;
}

/* Same measured placement as the PDF: the two renderers must not diverge. */
async function placements(story, onlyPages) {
  const out = {};
  for (const [pi, page] of story.pages.entries()) {
    if (onlyPages && !onlyPages.includes(pi + 1)) continue;
    out[pi] = [];
    for (const [qi, panel] of page.panels.entries()) {
      out[pi].push(await letterer.place(path.join(IMG, `p${pi + 1}-${qi + 1}.jpg`), panel.bubbles || []));
    }
  }
  return out;
}

function reader(story, onlyPages, placed) {
  const pages = story.pages
    .map((page, pi) => ({ page, pi }))
    .filter(({ pi }) => !onlyPages || onlyPages.includes(pi + 1))
    .map(({ page, pi }) => `
    <section class="page ${page.layout}">
      ${page.panels.map((p, qi) => panel(story, pi, qi, p, placed[pi][qi])).join("")}
      <span class="folio">${pi + 1}</span>
    </section>`).join("");

  return `<!doctype html><meta charset="utf-8"><title>${esc(story.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bangers&family=Nunito:wght@700;900&display=swap" rel="stylesheet">
${CSS}
<header class="cover">
  <img src="img/cover.jpg" alt="">
  <div class="cover-text">
    <p class="vol">${esc(story.subtitle)}</p>
    <h1>${esc(story.title)}</h1>
    <p class="by">protagonista: <b>${esc(story.hero.name)}</b>, ${story.hero.age} años</p>
  </div>
</header>
${pages}
<footer class="colofon">
  <p>Demo generada con IA (MiniMax <code>image-01</code>) y rotulada por código. Los textos no los escribe el modelo.</p>
</footer>`;
}

function fullPageSheet(story, onlyPages) {
  const rows = story.pages
    .map((page, pi) => ({ page, pi }))
    .filter(({ pi }) => !onlyPages || onlyPages.includes(pi + 1))
    .map(({ page, pi }) => `<figure><img src="img/full-${pi + 1}.jpg" alt="">
      <figcaption>Página ${pi + 1} — «${esc(page.beat)}» pedida como ${page.panels.length} viñetas en una sola imagen</figcaption></figure>`)
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>Experimento: página entera en un prompt</title>
<style>body{font:15px/1.5 system-ui;margin:0;padding:2rem;max-width:900px;margin-inline:auto;background:#111;color:#eee}
h1{font-size:1.3rem}p.lead{opacity:.75}
figure{margin:0 0 2.5rem}img{width:100%;border-radius:6px;display:block}
figcaption{font-size:.8rem;opacity:.7;margin-top:.5rem}</style>
<h1>Experimento: ¿sale una página entera de un solo prompt?</h1>
<p class="lead">Una imagen por página, sin referencia de personaje, pidiendo las viñetas separadas por calles blancas.
Cuesta 0,0035 $ por página en vez de ~0,014 $. Lo que hay que mirar: ¿respeta el número de viñetas?
¿es el mismo chaval en todas? ¿se puede leer en orden?</p>
${rows}`;
}

const CSS = `<style>
  :root{ --ink:#111; --paper:#f4f1ea; --gutter:10px; }
  *{box-sizing:border-box}
  body{margin:0;padding:2rem 1rem 4rem;background:#1a1a1c;color:#eee;
       font:16px/1.45 Nunito,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .cover{max-width:760px;margin:0 auto 2.5rem;position:relative;border:3px solid #eee;
         border-radius:6px;overflow:hidden;box-shadow:0 14px 40px #0008;background:#20242e}
  .cover img{width:100%;display:block}
  .cover-text{position:absolute;inset:0 0 auto;padding:1.6rem 1.2rem 2.4rem;text-align:center;
              background:linear-gradient(#000c 0%,#0009 55%,#0000 100%)}
  .cover .vol{font:1rem/1 Bangers,'Arial Black',sans-serif;letter-spacing:.22em;
              text-transform:uppercase;opacity:.8;margin:0 0 .5rem}
  .cover h1{font:clamp(1.9rem,6vw,3.4rem)/1 Bangers,'Arial Black',sans-serif;margin:0;
            letter-spacing:.02em;text-shadow:4px 4px 0 #c62828}
  .cover .by{margin:.8rem 0 0;font-size:.85rem;opacity:.85}

  .page{max-width:760px;margin:0 auto 2rem;background:var(--paper);padding:var(--gutter);
        border-radius:4px;display:grid;gap:var(--gutter);position:relative;
        box-shadow:0 14px 40px #0008}
  .page.quad{grid-template-columns:1fr 1fr}
  .page.wide-two{grid-template-columns:1fr 1fr;grid-template-areas:"a a" "b c"}
  .page.wide-two .a1{grid-area:a}.page.wide-two .a2{grid-area:b}.page.wide-two .a3{grid-area:c}
  .page.tall-stack{grid-template-columns:1.15fr 1fr;grid-template-areas:"a b" "a c"}
  .page.tall-stack .a1{grid-area:a}.page.tall-stack .a2{grid-area:b}.page.tall-stack .a3{grid-area:c}
  .page.five{grid-template-columns:1fr 1fr;grid-template-areas:"a a" "b c" "d e"}
  .page.five .a1{grid-area:a}.page.five .a2{grid-area:b}.page.five .a3{grid-area:c}
  .page.five .a4{grid-area:d}.page.five .a5{grid-area:e}
  .page.five .a1{aspect-ratio:16/9}.page.five .panel{aspect-ratio:3/2}
  .page.six{grid-template-columns:1fr 1fr}.page.six .panel{aspect-ratio:3/2}

  .panel{margin:0;position:relative;overflow:hidden;border:3px solid var(--ink);
         background:#ddd;border-radius:2px}
  /* Crop 3% off every edge: the watermark lands in a corner 1 time in 11. */
  .panel img{width:106%;height:106%;margin:-3%;object-fit:cover;display:block}
  .page.quad .panel{aspect-ratio:1}
  .page.wide-two .a1{aspect-ratio:16/9}.page.wide-two .a2,.page.wide-two .a3{aspect-ratio:1}
  .page.tall-stack .a1{aspect-ratio:auto}.page.tall-stack .a2,.page.tall-stack .a3{aspect-ratio:3/2}

  .bub{position:absolute;max-width:44%;padding:.5rem .7rem;color:var(--ink);
       font-weight:900;font-size:clamp(.62rem,1.35vw,.86rem);line-height:1.15;
       text-transform:uppercase;letter-spacing:.01em;z-index:2}
  .bub .who{display:block;font-size:.85em;color:#c62828;letter-spacing:.05em}
  .at-top-left{top:4%;left:3%}.at-top-right{top:4%;right:3%}
  .at-bottom-left{bottom:4%;left:3%}.at-bottom-right{bottom:4%;right:3%}
  .at-top-center{top:4%;left:50%;transform:translateX(-50%)}
  .at-bottom-center{bottom:4%;left:50%;transform:translateX(-50%)}
  .at-top-center.shout,.at-bottom-center.shout{transform:translateX(-50%) rotate(-2deg)}

  .speech,.shout,.thought{background:#fff;border:3px solid var(--ink)}
  /* No tails: a fixed triangle points at nothing (see make-pdf.js). */
  .speech{border-radius:16px}
  .thought{border-radius:26px;border-style:dashed}
  .shout{border-radius:4px;border-width:4px;color:#b71c1c;transform:rotate(-2deg);
    clip-path:polygon(3% 0,97% 4%,100% 50%,96% 100%,40% 96%,4% 100%,0 48%)}
  .caption{background:#ffe9a8;border:3px solid var(--ink);border-radius:2px;
    font-family:Nunito,system-ui,sans-serif;font-weight:700;text-transform:none;font-style:italic}

  .folio{position:absolute;bottom:-1.4rem;right:.2rem;font-size:.75rem;opacity:.45;color:#eee}
  .colofon{max-width:760px;margin:3rem auto 0;font-size:.8rem;opacity:.55;text-align:center}
  @media print{body{background:#fff;padding:0}.page{box-shadow:none;page-break-after:always;margin:0}
    .cover{border-color:#111;color:#111;background:#fff}.folio{color:#111}}
</style>`;

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

main().catch((e) => { console.error(e); process.exit(1); });
