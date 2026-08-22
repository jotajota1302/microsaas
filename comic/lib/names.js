/*
 * Real names never reach a model. This is the file that makes that structural
 * instead of something everybody has to remember.
 *
 * WHY THIS EXISTS, and it is not theory. `../CLAUDE.md` has said since day one
 * that no real name travels to an AI provider: the data belongs to minors and
 * none of the three providers we use has an EU DPA. In August the rule was
 * found broken in the image pipeline — the child's name was inside every scene
 * description — and it was fixed there.
 *
 * It was still broken everywhere else, and nobody noticed for a fortnight:
 *
 *   lib/prompt-script.js   "PROTAGONISTA: Nerea, 15 años" in every text call,
 *                          so MiniMax M3 AND OpenRouter both had it
 *   lib/style.js           characterBlock() opened with hero.name.toUpperCase(),
 *                          so image-01 had it on every sheet and every panel
 *
 * Patching those two call sites would fix today and break again the next time
 * somebody writes a prompt. So instead the ORDER ITSELF carries a placeholder
 * from the moment it is stored, the real names live in a separate map that no
 * prompt builder is ever given, and the names are put back in code at the end,
 * after the last model call.
 *
 * The placeholders are the same ones `cuentos` uses, so the two products read
 * the same way: {{NOMBRE}} for the hero, {{AMIGO1}} for the sidekick.
 */

const HERO = "{{NOMBRE}}";
const SIDEKICK = "{{AMIGO1}}";

/**
 * Splits an order into the version prompts may see and the names they may not.
 *
 * @returns {{ order: object, names: Record<string,string> }}
 */
function maskOrder(order) {
  const names = {};
  const masked = { ...order };

  if (order.name) {
    names[HERO] = order.name;
    masked.name = HERO;
  }
  if (order.sidekick && order.sidekick.name) {
    names[SIDEKICK] = order.sidekick.name;
    masked.sidekick = { ...order.sidekick, name: SIDEKICK };
  }
  return { order: masked, names };
}

/**
 * Puts the real names back. Deep, because it runs over a whole story object.
 *
 * Only ever called AFTER the last model call — see lib/preview-job.js assemble().
 */
function unmask(value, names) {
  if (!names || !Object.keys(names).length) return value;

  if (typeof value === "string") {
    let out = value;
    for (const [token, real] of Object.entries(names)) out = out.split(token).join(real);
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => unmask(v, names));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = unmask(v, names);
    return out;
  }
  return value;
}

/**
 * Does this text contain a real name? The guard, used by the validator and by
 * scripts/check-privacy.js.
 *
 * Accent- and case-insensitive, and it matches on word boundaries so "Ana"
 * does not fire on "analiza" — a false positive here blocks a legitimate
 * comic, which is how a safety check gets switched off.
 */
function findRealNames(text, names) {
  if (!text || !names) return [];
  const flat = String(text)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hits = [];
  for (const real of Object.values(names)) {
    const needle = String(real)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!needle || needle.length < 2) continue;
    const re = new RegExp(`(^|[^\\p{L}])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "u");
    if (re.test(flat)) hits.push(real);
  }
  return hits;
}

/** Every string in a prompt object, flattened, for the guard to scan. */
function promptText(prompt) {
  if (!prompt) return "";
  if (typeof prompt === "string") return prompt;
  return [prompt.system, prompt.user].filter(Boolean).join("\n");
}

module.exports = { maskOrder, unmask, findRealNames, promptText, HERO, SIDEKICK };
