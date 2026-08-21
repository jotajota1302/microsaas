/*
 * Phase 0 spike — which text model writes good Spanish for 3-8 year olds and
 * passes the validator on the first try?
 *
 * Measures, per model: first-try pass rate, average attempts, cost, latency,
 * and which validator rules break most often (that tells us what to fix in
 * the prompt, not only which model to buy).
 *
 * Usage:
 *   node scripts/spike-text.js                      # every model with a key
 *   node scripts/spike-text.js --model MiniMax-M3 --runs 3
 *
 * Output: out/spike-text/<model>/<n>.json  and  out/spike-text/results.json
 */

const fs = require("fs");
const path = require("path");
const { env } = require("../lib/env.js");
const { buildMessages } = require("../lib/prompt-story.js");
const { validateStory } = require("../lib/validate-story.js");
const { completeJson } = require("../lib/llm.js");
const SCHEMA = require("../schema/story.schema.json");

const OUT = path.join(__dirname, "..", "out", "spike-text");
const MAX_ATTEMPTS = 3;

// Five personalisations that stress different parts of the prompt.
const CASES = [
  { id: "mar-gato", ageBand: "6-8", hairColor: "castano", hairType: "rizado", skin: "clara", glasses: true, pet: "gato", hobby: "dibujar", theme: "mar", hasCompanion: false },
  { id: "bosque-solo", ageBand: "3-5", hairColor: "negro", hairType: "liso", skin: "morena", glasses: false, pet: "ninguna", hobby: "cantar-musica", theme: "bosque", hasCompanion: false },
  { id: "espacio-amigo", ageBand: "6-8", hairColor: "rubio", hairType: "corto", skin: "media", glasses: false, pet: "perro", hobby: "estrellas", theme: "espacio", hasCompanion: true },
  { id: "dino-trenzas", ageBand: "3-5", hairColor: "pelirrojo", hairType: "trenzas", skin: "clara", glasses: false, pet: "ninguna", hobby: "construir", theme: "dinosaurios", hasCompanion: false },
  { id: "futbol-conejo", ageBand: "6-8", hairColor: "negro", hairType: "ondulado", skin: "oscura", glasses: true, pet: "conejo", hobby: "futbol", theme: "futbol", hasCompanion: true },
];

// hobby ids must exist in the collection; fix the one placeholder above.
CASES[1].hobby = "musica";

const CANDIDATES = [
  { model: "google/gemini-2.5-flash-lite", provider: "openrouter", needs: "OPENROUTER_API_KEY" },
  { model: "deepseek/deepseek-v4-flash", provider: "openrouter", needs: "OPENROUTER_API_KEY" },
  { model: "openai/gpt-5-mini", provider: "openrouter", needs: "OPENROUTER_API_KEY" },
  { model: "MiniMax-M3", provider: "minimax", needs: "MINIMAX_API_KEY" },
];

function argOf(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Groups validator errors by rule so we learn what the prompt must fix. */
function ruleOf(error) {
  if (/words, must be between/.test(error)) return "page length";
  if (/proper name/.test(error)) return "invented name";
  if (/\{\{NOMBRE\}\}/.test(error)) return "placeholder";
  if (/blocklist/.test(error)) return "blocklist";
  if (/beat|pages with beat|first page|last page/.test(error)) return "structure";
  if (/image_hint/.test(error)) return "image_hint";
  if (/preachy/.test(error)) return "preachy";
  if (/must be numbered|exactly 12 pages/.test(error)) return "page count";
  if (/is required|not allowed|must be a|must be at (least|most)/.test(error)) return "schema";
  return "other";
}

(async () => {
  const only = argOf("model");
  const runs = Number(argOf("runs", CASES.length));
  const candidates = CANDIDATES.filter((c) => (only ? c.model === only : env[c.needs]));

  if (!candidates.length) {
    console.log(`
[cuentos] no text model can run: none of the required keys is set.
  OPENROUTER_API_KEY  -> gemini-2.5-flash-lite, deepseek-v4-flash, gpt-5-mini
  MINIMAX_API_KEY     -> MiniMax-M3

Get an OpenRouter key at https://openrouter.ai/settings/keys and load a few
dollars of credit; that unlocks the three main candidates with one account.`);
    process.exit(0);
  }

  const results = [];

  for (const candidate of candidates) {
    process.env.TEXT_PROVIDER = candidate.provider;
    const dir = path.join(OUT, candidate.model.replace(/\//g, "_"));
    fs.mkdirSync(dir, { recursive: true });

    const row = {
      model: candidate.model, provider: candidate.provider,
      cases: 0, firstTry: 0, eventually: 0, failed: 0,
      totalAttempts: 0, costUsd: 0, msTotal: 0, rules: {},
    };

    for (const testCase of CASES.slice(0, runs)) {
      const started = Date.now();
      row.cases++;
      let errors = [];
      let done = false;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        row.totalAttempts++;
        try {
          const messages = buildMessages(testCase, attempt > 1 ? errors : null);
          const result = await completeJson({ messages, schema: SCHEMA, model: candidate.model });
          row.costUsd += result.costUsd || 0;
          const verdict = validateStory(result.data);

          if (verdict.ok) {
            if (attempt === 1) row.firstTry++;
            row.eventually++;
            fs.writeFileSync(
              path.join(dir, `${testCase.id}.json`),
              JSON.stringify(result.data, null, 2)
            );
            console.log(`[${candidate.model}] ${testCase.id}: OK on attempt ${attempt}`);
            done = true;
            break;
          }

          errors = verdict.errors;
          for (const e of errors) {
            const rule = ruleOf(e);
            row.rules[rule] = (row.rules[rule] || 0) + 1;
          }
          console.log(`[${candidate.model}] ${testCase.id}: attempt ${attempt} rejected (${errors.length}) — ${errors.slice(0, 3).join(" | ")}`);
        } catch (e) {
          console.error(`[${candidate.model}] ${testCase.id}: attempt ${attempt} ERROR ${e.message.slice(0, 160)}`);
          errors = [e.message];
        }
      }

      if (!done) {
        row.failed++;
        fs.writeFileSync(
          path.join(dir, `${testCase.id}.errors.json`),
          JSON.stringify(errors, null, 2)
        );
      }
      row.msTotal += Date.now() - started;
    }

    results.push(row);
    console.log(
      `\n[${candidate.model}] ${row.firstTry}/${row.cases} first try, ` +
      `${row.eventually}/${row.cases} eventually, $${row.costUsd.toFixed(4)}, ` +
      `${Math.round(row.msTotal / row.cases / 1000)}s per story\n`
    );
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));

  console.log("=== summary ===");
  for (const r of results) {
    const rules = Object.entries(r.rules).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(", ");
    console.log(
      `${r.model}: first-try ${r.firstTry}/${r.cases}, cost $${r.costUsd.toFixed(4)}, ` +
      `${Math.round(r.msTotal / Math.max(r.cases, 1) / 1000)}s/story` + (rules ? ` | broken rules: ${rules}` : "")
    );
  }
  console.log(`
=== decision rule ===
Winner: >= 8/10 first-try passes; on a tie, the cheaper one.
Then READ two stories out loud before deciding — the validator cannot hear.
Write the decision into docs/fase-0-resultados.md and set TEXT_MODEL in .env.`);
})();
