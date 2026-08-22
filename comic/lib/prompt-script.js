/*
 * The three prompts of the script pipeline: draft, critique, rewrite — plus the
 * page breakdown.
 *
 * Why a critic at all: the reader is twelve to seventeen, and that audience
 * forgives bad drawing far sooner than a story that insults them. A single
 * generation produces something that looks like a story from a distance; the
 * critic is what catches the two failures that kill this product, both of them
 * invisible to a schema:
 *
 *   - the conflict resolves by luck, or the adult hero solves it, so the comic
 *     is not about the reader at all;
 *   - the dialogue is an adult's idea of how a teenager talks.
 *
 * The critic never rewrites. It returns findings; a second generation call
 * fixes them. Separating judgement from authorship is the whole point — a model
 * asked to improve its own text mostly reassures itself.
 */

const C = require("./catalog.js");

const SYSTEM = `Eres guionista de cómic para adolescentes. Escribes en español de España, natural y actual.
Nunca eres cursi, nunca moralizas, nunca explicas la lección: la lección se ve en lo que pasa.
No usas jerga forzada ni imitas cómo crees que hablan los jóvenes: escribes diálogo seco y creíble.
Nunca mencionas obras, series, marcas ni personajes que existan.`;

const SYSTEM_CRITIC = `Eres editor de cómic juvenil. Tu trabajo es encontrar lo que falla, no animar.
Eres duro y concreto. Si algo funciona, lo dices en una línea y pasas. Si algo falla, dices exactamente
dónde y por qué. No reescribes: diagnosticas.`;

/** The human-readable brief both the writer and the critic work from. */
function brief(order) {
  const trope = C.TROPES[order.trope];
  const tone = C.TONES[order.tone];
  const trait = C.TRAITS[order.trait];
  const band = C.ageBand(order.ageBand);
  const sidekick = order.sidekick
    ? `${order.sidekick.name}, que es ${C.RELATIONS[order.sidekick.relation] || "alguien de su vida"}`
    : "ninguno";

  return `PROTAGONISTA: ${order.name}, ${order.age} años, ${order.gender === "f" ? "chica" : "chico"}.
RASGO QUE LE DEFINE: ${trait.label} (${trait.en}).
SECUNDARIO: ${sidekick}.
MUNDO: ${trope.label} — ${trope.world}.
TONO: ${tone.label}. ${tone.hint}
LECTOR: ${band.label}. Registro: ${band.register}.
EXTENSIÓN: ${band.pages} páginas.`;
}

const RULES = `REGLAS DURAS:
1. El conflicto final lo resuelve EL PROTAGONISTA, y lo resuelve USANDO SU RASGO. No lo resuelve
   un adulto, ni un poder que aparece de la nada, ni una casualidad. Esta regla es la más importante:
   si no se cumple, el guion no vale para nada.
2. El protagonista FRACASA antes de ganar, y el fracaso es culpa suya.
3. En algún momento toma una decisión que le CUESTA algo.
4. El antagonista quiere algo concreto y comprensible. No es malo porque sí.
5. El secundario aparece al menos dos veces y hace algo que importa.
6. La historia se entiende leyendo solo el texto, sin ver los dibujos.
7. Nada de obras, series, personajes o marcas que existan. Ni de refilón.
8. Nada de sexo, drogas, autolesión ni violencia explícita. Puede haber peligro y golpes.
9. Diálogo corto. Nadie suelta discursos.`;

const OUTLINE_SHAPE = `{
  "title": "título en español, corto, sin subtítulo",
  "logline": "una frase que resuma la historia",
  "villain": { "label": "NOMBRE EN MAYÚSCULAS", "want": "qué quiere, en una frase", "sheet": "descripción física en INGLÉS para dibujarlo, una frase" },
  "ally": { "label": "NOMBRE EN MAYÚSCULAS", "sheet": "descripción física en INGLÉS para dibujarlo, una frase" },
  "pages": [
    { "beat": "nombre corto del momento", "summary": "qué pasa en esta página, 2-3 frases", "who": ["hero","ally"] }
  ]
}`;

function draftPrompt(order) {
  const band = C.ageBand(order.ageBand);
  return {
    system: SYSTEM,
    shape: OUTLINE_SHAPE,
    user: `Escribe el ESQUELETO de un cómic de ${band.pages} páginas.

${brief(order)}

${RULES}

ESTRUCTURA OBLIGATORIA, repartida en las ${band.pages} páginas:
- vida normal (quién es y qué le pasa este año)
- la chispa (algo cambia y le mete en la historia)
- primer intento y FRACASO por su culpa
- el momento bajo: se queda solo
- la idea: se da cuenta de algo gracias a su rasgo
- la prueba: se enfrenta al antagonista y casi pierde
- la resolución: gana usando su rasgo
- el cierre: una página tranquila

"who" lista quién aparece en la página: "hero", "ally", "villain" o "none" si es un plano sin personajes.
Las descripciones físicas del antagonista y del aliado van en INGLÉS porque las usa el ilustrador.
Todo lo demás en español.`,
  };
}

/*
 * No dialogue criterion here, on purpose. The outline HAS no dialogue — it is
 * written later, in the breakdown — so asking the editor to score it produced a
 * flat 2/5 every single run, and that 2 then triggered a mandatory rewrite that
 * could not possibly fix it. The editor said so itself: "los intercambios están
 * descritos pero no escritos con tono".
 *
 * Dialogue is judged by dialogueCriticPrompt, on the actual lines. Each critic
 * only scores what it can see.
 */
const CRITIC_SHAPE = `{
  "verdict": "aprobado" | "revisar" | "rechazado",
  "scores": { "resuelve_el_rasgo": 0, "fracaso_propio": 0, "decision_cara": 0, "antagonista": 0, "causalidad": 0, "se_entiende_sin_dibujos": 0 },
  "issues": [ { "page": 0, "problem": "qué falla, concreto", "fix": "qué hacer, concreto" } ],
  "worst": "el problema más grave en una frase"
}`;

/*
 * Scores are 0-5 and the rubric is written out, because "puntúa del 1 al 10" to
 * a model returns 7 for everything. `resuelve_el_rasgo` below 4 is an automatic
 * "rechazado" enforced in code, not left to the model's judgement.
 */
function criticPrompt(order, outline) {
  return {
    system: SYSTEM_CRITIC,
    shape: CRITIC_SHAPE,
    user: `Este es el encargo:

${brief(order)}

Este es el esqueleto que ha escrito el guionista:

${JSON.stringify(outline, null, 2)}

Puntúa de 0 a 5 cada criterio y explica los fallos. Sé duro.

- resuelve_el_rasgo: ¿el conflicto final lo resuelve el protagonista USANDO su rasgo (${C.TRAITS[order.trait].label})?
  5 = imposible resolverlo sin ese rasgo. 3 = el rasgo ayuda pero cualquiera lo habría resuelto.
  0 = lo resuelve otro, o una casualidad, o un poder nuevo.
- fracaso_propio: ¿fracasa antes de ganar, y el fracaso es culpa suya? 0 = no fracasa o la culpa es de otro.
- decision_cara: ¿toma una decisión que le cuesta algo real? 0 = nunca renuncia a nada.
- antagonista: ¿quiere algo concreto y entendible? 0 = es malo porque sí.
- causalidad: ¿cada página se sigue de la anterior por una razón, o hay cosas que pasan porque
  el guion las necesita? Penaliza contradicciones y pistas que aparecen sin haber sido sembradas.
- se_entiende_sin_dibujos: ¿se sigue la historia leyendo solo esto?

NO puntúes el diálogo: este esqueleto no lleva diálogo escrito, eso se juzga después.

En "issues" pon SOLO problemas reales, con el número de página. Si algo está bien, no lo menciones.
"worst" es el fallo que más daño hace al producto.`,
  };
}

function rewritePrompt(order, outline, critique) {
  const band = C.ageBand(order.ageBand);
  return {
    system: SYSTEM,
    shape: OUTLINE_SHAPE,
    user: `Este es el encargo:

${brief(order)}

${RULES}

Este es tu esqueleto anterior:

${JSON.stringify(outline, null, 2)}

El editor lo ha revisado y ha encontrado esto:

${JSON.stringify(critique.issues, null, 2)}

Lo más grave: ${critique.worst}

Reescribe el esqueleto entero arreglando TODOS esos problemas. Mantén lo que funcionaba —el título y el
mundo no hace falta cambiarlos si el editor no los critica— y conserva las ${band.pages} páginas.
No expliques los cambios: devuelve solo el esqueleto nuevo.`,
  };
}

const PAGE_SHAPE = `{
  "panels": [
    { "ref": "hero" | "ally" | "villain" | null,
      "scene": "qué se ve, en INGLÉS, una frase visual concreta, sin texto ni bocadillos dentro",
      "bubbles": [ { "type": "speech" | "thought" | "shout" | "caption", "who": "NOMBRE o vacío si habla el protagonista", "text": "en español" } ] }
  ]
}`;

/*
 * The breakdown runs one call per page, not one for the whole comic. Fourteen
 * small outputs land; one 6000-token output does not, and when it fails it
 * fails entirely. It also parallelises.
 */
function breakdownPrompt(order, outline, pageIndex) {
  const band = C.ageBand(order.ageBand);
  const page = outline.pages[pageIndex];
  const before = outline.pages[pageIndex - 1];
  const after = outline.pages[pageIndex + 1];

  return {
    system: SYSTEM,
    shape: PAGE_SHAPE,
    user: `Desglosa UNA página de cómic en viñetas.

${brief(order)}

ANTAGONISTA: ${outline.villain.label} — quiere ${outline.villain.want}.
ALIADO: ${outline.ally.label}.

PÁGINA ${pageIndex + 1} de ${outline.pages.length} — "${page.beat}":
${page.summary}

${before ? `Viene de: ${before.summary}` : "Es la primera página."}
${after ? `Continúa en: ${after.summary}` : "Es la última página."}

REGLAS DE DESGLOSE:
- Entre 3 y 6 viñetas. Usa 3 para momentos de calma, 5 o 6 para acción o para una discusión rápida.
  NO elijas maqueta: solo escribe las viñetas en orden de lectura, que de colocarlas ya se encarga otro.
- "ref" dice a quién hay que fijar con la hoja de personaje. Usa null en las viñetas que NO tienen
  personas: pantallas, objetos, paisajes, explosiones. Es importante: si pones un personaje en una
  viñeta de objeto, el dibujante lo mete y estropea la viñeta.
- "scene" en INGLÉS, concreta y visual: qué se ve, desde dónde, con qué luz. Nada de emociones
  abstractas ("se siente triste") — dilo con el cuerpo y el encuadre.
- **NUNCA escribas un nombre propio en "scene"**. Ni el del protagonista, ni el del aliado, ni el del
  antagonista. Di "the teenager", "the younger brother", "the technician". El nombre solo puede
  aparecer dentro de un bocadillo, cuando un personaje llama a otro.
- Máximo 2 bocadillos por viñeta y máximo ${band.words[1]} palabras por bocadillo. Muchas viñetas no
  llevan ninguno: deja respirar.
- "caption" es narración; úsala poco, para saltos de tiempo.
- Diálogo en español, registro de ${order.age} años: ${band.register}.
- Nada de texto dentro del dibujo: los bocadillos los pone el maquetador.`,
  };
}

/*
 * The dialogue pass, added 2026-08-22 after measuring that dialogue scored 2/5
 * with two different providers AND two different critics.
 *
 * The cause was a design mistake: the editor read the OUTLINE, but dialogue is
 * written later, during the breakdown. The critic was judging a layer that has
 * no dialogue in it, so the rewrite could not possibly fix it.
 *
 * This pass works on the finished bubbles, page by page, and it is allowed to
 * change nothing else: same panels, same number of bubbles, same types, same
 * speakers. Only the words.
 */

const SYSTEM_DIALOGUE = `Eres dialoguista de cómic juvenil en español de España.

Tu problema no es que los personajes hablen mucho: es que hablan DEMASIADO BIEN. Una réplica que
parece una frase de póster no la ha dicho nadie nunca. La gente real se interrumpe, repite, empieza
una frase y la deja, contesta con una palabra, se ríe de lo que acaba de decir el otro y dice cosas
que no aportan nada a la trama.

Reglas de oficio:
- Cada personaje habla DISTINTO. Uno es cortante, otro da rodeos, otro contesta con preguntas. Si al
  taparles el nombre no se distinguen, está mal.
- Alterna longitudes de verdad: una réplica de una palabra al lado de una de quince. Nunca tres
  réplicas seguidas del mismo largo.
- Deja frases sin terminar con puntos suspensivos, y usa la raya para interrumpir al otro.
- Nadie explica al otro lo que el otro ya sabe. Nadie describe lo que se está viendo en la viñeta.
- Lo importante casi nunca se dice de frente: se dice de lado, o con una tontería.
- No inventes jerga. Usa la que existe, y poca.`;

const DIALOGUE_SHAPE = `{
  "panels": [ { "index": 0, "bubbles": [ { "text": "la réplica reescrita, en español" } ] } ]
}`;

/** One page's dialogue, with the drawing described so the words can lean on it. */
function dialoguePolishPrompt(order, page, pageIndex, totalPages, critique) {
  const band = C.ageBand(order.ageBand);
  const inventory = page.panels
    .map((panel, i) => {
      const lines = (panel.bubbles || [])
        .map((b, j) => `      ${j}. [${b.type}]${b.who ? ` ${b.who}:` : ""} "${b.text}"`)
        .join("\n");
      return `  Viñeta ${i}: ${panel.scene}\n${lines || "      (sin texto — déjala sin texto)"}`;
    })
    .join("\n");

  // The critic already named the lines that do not work. Handing them back is
  // far more effective than restyling the whole page blind.
  const flagged = ((critique && critique.worst_lines) || [])
    .map((l) => `  - «${l.line}» → ${l.why}`)
    .join("\n");

  return {
    system: SYSTEM_DIALOGUE,
    shape: DIALOGUE_SHAPE,
    user: `Página ${pageIndex + 1} de ${totalPages} de un cómic. Reescribe SOLO las réplicas.

${brief(order)}

CÓMO HABLAN A ESTA EDAD: ${band.speech}

Lo que hay dibujado y lo que se dice ahora:

${inventory}
${flagged ? `\nEl editor ha señalado estas réplicas del cómic como falsas:\n${flagged}\n` : ""}
REGLAS:
- Devuelve EXACTAMENTE las mismas viñetas con el mismo número de réplicas en el mismo orden.
  Si una viñeta no tiene texto, no la incluyas.
- No cambies quién habla ni el tipo de bocadillo. Solo el texto.
- Máximo ${band.words[1]} palabras por réplica.
- Que se note quién habla sin leer el nombre.
- Al menos una réplica de esta página tiene que ser de una o dos palabras.
- Prohibido decir en voz alta lo que ya se ve dibujado.`,
  };
}

const DIALOGUE_CRITIC_SHAPE = `{
  "score": 0,
  "worst_lines": [ { "page": 0, "line": "la réplica", "why": "por qué no cuela" } ],
  "note": "una frase sobre el conjunto"
}`;

/** Reads the actual dialogue of the whole comic. Used before and after the pass. */
function dialogueCriticPrompt(order, pages) {
  const lines = pages
    .map((page, p) =>
      (page.panels || [])
        .flatMap((panel) => (panel.bubbles || []).map((b) => `p${p + 1} [${b.type}]${b.who ? ` ${b.who}:` : ""} ${b.text}`))
        .join("\n")
    )
    .filter(Boolean)
    .join("\n");

  return {
    system: SYSTEM_CRITIC,
    shape: DIALOGUE_CRITIC_SHAPE,
    user: `Estas son TODAS las réplicas de un cómic para un lector de ${order.age} años.

${lines}

Puntúa de 0 a 5 lo creíbles que suenan en boca de gente de esa edad en España hoy.
5 = podrías oírlo en un pasillo de instituto. 3 = correcto pero sin vida.
0 = un adulto imitando a un adolescente, o personajes explicándose la trama.

Penaliza: cursilería, solemnidad, jerga forzada, réplicas que explican lo que ya se ve,
y personajes que hablan todos igual.

En "worst_lines" pon como mucho cinco réplicas concretas que no cuelan, con el motivo.`,
  };
}

module.exports = {
  brief, draftPrompt, criticPrompt, rewritePrompt, breakdownPrompt, RULES,
  dialoguePolishPrompt, dialogueCriticPrompt,
};
