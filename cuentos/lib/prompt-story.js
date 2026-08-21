/*
 * Builds the prompt for the story model and drives the validator-guided retry
 * loop. The model sees ONLY anonymised traits: never a name, never an email,
 * never a photo. Real names are substituted later, in lib/pdf.js.
 *
 * Input (all ids from lib/collection.js):
 *   { ageBand, gender, hairColor, hairType, skin, glasses, pet, hobby, theme,
 *     people: [{ relation, ageBand? }] (max 2), moment, tone, locale,
 *     instructions: string[] (accumulated "cambiar algo" requests) }
 */

const C = require("./collection.js");
const SCHEMA = require("../schema/story.schema.json");
const { validateStory } = require("./validate-story.js");
const llm = require("./llm.js");

const MAX_ATTEMPTS = 3;

function label(list, id, field = "en") {
  const found = list.find((x) => x.id === id);
  if (!found) throw new Error(`[cuentos] unknown option "${id}"`);
  return found[field];
}

function describeChild(input) {
  const hairColor = label(C.HAIR_COLORS, input.hairColor, "visual");
  const hairType = label(C.HAIR_TYPES, input.hairType, "visual");
  const skin = label(C.SKIN_TONES, input.skin, "visual");
  const who = label(C.GENDERS, input.gender || "neutro", "visual");
  const glasses = input.glasses ? " and round glasses" : "";
  const age = input.ageBand === "3-5" ? "5-year-old" : "7-year-old";
  return `a ${age} ${who} with ${hairType} ${hairColor} hair, ${skin}${glasses}`;
}

/** Spanish forces a choice; make it explicit so the model does not guess. */
function genderRule(input) {
  const g = C.GENDERS.find((x) => x.id === (input.gender || "neutro"));
  if (!g) throw new Error(`[cuentos] unknown option "${input.gender}"`);
  return g.noun
    ? `El protagonista es ${g.noun}: usa SIEMPRE el género gramatical correspondiente en sustantivos y adjetivos («${g.noun}», «cansada» o «cansado» según toque). No te equivoques ni una vez.`
    : `No sabemos el género del protagonista: NO uses nunca «el niño» ni «la niña» ni adjetivos con género para referirte a él. Habla siempre de «{{NOMBRE}}» o usa fórmulas neutras («esa criatura curiosa», «quien dibujaba»). Ni un solo adjetivo con género referido al protagonista.`;
}

/** Normalises the people list; accepts the legacy hasCompanion flag. */
function peopleOf(input) {
  const people = Array.isArray(input.people) ? input.people.slice(0, C.MAX_PEOPLE) : [];
  if (!people.length && input.hasCompanion) people.push({ relation: "amigo" });
  return people.map((p, i) => {
    const rel = C.RELATIONS.find((r) => r.id === p.relation);
    if (!rel) throw new Error(`[cuentos] unknown option "${p.relation}"`);
    return { marker: `{{PERSONA${i + 1}}}`, role: rel.role, ageBand: p.ageBand || null };
  });
}

const SYSTEM = `Eres un autor de álbumes ilustrados infantiles en español. Generas EXCLUSIVAMENTE datos (un objeto JSON), nunca comentarios ni explicaciones.

# Qué escribes
Un cuento de 12 páginas para leer en voz alta a un niño de 3 a 8 años. Cada página es una escena ilustrada con su texto. El cuento habla de la vida real del niño: su familia, sus amigos, su mascota y lo que está viviendo ahora.

# Reglas del texto (las comprueba un validador; si fallan, el cuento se descarta)
1. EXACTAMENTE 12 páginas, numeradas 1 a 12 en orden.
2. Cada página tiene entre 70 y 85 palabras: apunta a 75. Los modelos tienden a quedarse cortos, así que si dudas, alarga con un detalle sensorial (un olor, un sonido, una textura), nunca con relleno. Una página de menos de 60 palabras o de más de 90 invalida el cuento entero. Cuenta las palabras antes de responder.
3. El protagonista se llama SIEMPRE «{{NOMBRE}}», escrito así, con las dobles llaves. Debe aparecer en al menos 6 de las 12 páginas. Las demás personas de su vida que te indique tienen también su marcador («{{PERSONA1}}», «{{PERSONA2}}»): úsalos SIEMPRE tal cual, y cada una debe aparecer en al menos 2 páginas con un papel real en la historia (ayuda, estorba, acompaña, enseña), nunca como adorno.
4. PROHIBIDO inventar nombres propios de personas, lugares, animales o cosas. Los demás personajes se nombran por lo que son: «la mujer que remendaba redes», «el viejo del faro», «su gato». Y siempre en minúscula: «la cierva», «el búho», «la tortuga» — NUNCA «la Cierva» ni «el Búho» como si fueran nombres. Un nombre propio inventado invalida el cuento entero.
5. Estructura obligatoria, marcada en el campo "beat" de cada página:
   - página 1: "setup" (el mundo del niño, su vida normal, lo que le gusta)
   - página 2: "problem" (aparece el problema, que te doy en "momento")
   - páginas 3 a 11: "attempt" (intenta, falla, aprende, vuelve a intentar; al menos dos intentos que NO funcionan antes del que sí)
   - página 12: "resolution" (lo resuelve usando algo suyo: su afición, su forma de mirar, su tozudez)
6. La solución la encuentra el niño, nunca un adulto ni la magia. Las personas de su vida pueden ayudar, pero el último paso lo da él.
7. NADA de violencia, muerte, armas, miedo intenso, enfermedad, religión, política, marcas registradas ni personajes con derechos de autor.
8. La moraleja se MUESTRA, jamás se enuncia. Prohibido escribir «la moraleja es», «aprendió que debía», «nunca debemos», «siempre hay que». Si el último párrafo suena a sermón, reescríbelo.
9. Español de España, natural y sonoro al leerlo en voz alta. TODAS las tildes (á é í ó ú), la ñ, y los signos de apertura ¿ ¡. Frases cortas. Nada de diminutivos empalagosos ni de cursilería.
10. Usa comillas angulares «así» o rayas de diálogo —así—, JAMÁS comillas dobles: romperían el JSON.

# Reglas de las ilustraciones
11. Cada página lleva "image_hint": descripción visual EN INGLÉS de lo que se ve en esa página (lugar, acción, luz). MÁXIMO 25 PALABRAS: cuéntalas. Una sola frase, sin subordinadas. Un image_hint de 30 palabras o más invalida el cuento. Si en la página aparece una de las personas, descríbela por su relación y edad («her grandmother», «his older sister»), nunca por un nombre.
12. PROHIBIDO pedir texto en la imagen: nada de carteles, letras, palabras, rótulos ni títulos. El modelo de imagen no sabe escribir.
13. "character_sheet" describe al niño EN INGLÉS con los rasgos que te doy, y su ropa. Esa ropa es la misma en las 12 páginas: no la cambies en el texto.
14. "coloring_hints": 4 escenas de ESTE cuento, en inglés, que funcionen como dibujo para colorear (formas claras, poco fondo).

# Forma EXACTA del JSON (nombres de campo literales; ni uno más, ni uno menos)
{
  "title": "…",
  "dedication_hint": "…",
  "character_sheet": { "appearance": "…", "outfit": "…", "companion": "…" o null },
  "pages": [
    { "n": 1, "beat": "setup", "text": "…", "image_hint": "…" }
    … doce objetos, con "n" de 1 a 12 …
  ],
  "coloring_hints": ["…", "…", "…", "…"],
  "moral": "…"
}
El número de página se llama "n" (no "page", no "number"). NO añadas campos que no estén en esta lista: nada de "word_count", "age", "name_token" ni "protagonist_token". El campo "companion" describe a la mascota en inglés; si no hay ninguna, vale null (nunca lo omitas).

# Formato de salida
Devuelve ÚNICAMENTE el objeto JSON, sin markdown, sin comentarios, sin texto antes ni después.`;

function buildMessages(input, previousErrors) {
  const theme = C.THEMES.find((t) => t.id === input.theme);
  if (!theme) throw new Error(`[cuentos] unknown theme "${input.theme}"`);
  const pet = C.PETS.find((p) => p.id === (input.pet || "ninguna"));
  const hobby = label(C.HOBBIES, input.hobby, "es");
  const moment = C.MOMENTS.find((m) => m.id === (input.moment || "aventura"));
  if (!moment) throw new Error(`[cuentos] unknown option "${input.moment}"`);
  const tone = C.TONES.find((t) => t.id === (input.tone || "divertido"));
  if (!tone) throw new Error(`[cuentos] unknown option "${input.tone}"`);
  const people = peopleOf(input);

  const peopleLines = people.length
    ? people.map((p) => `- ${p.marker}: ${p.role}${p.ageBand ? ` (${p.ageBand === "3-5" || p.ageBand === "6-8" ? "niño de " + p.ageBand + " años" : p.ageBand})` : ""}. Debe aparecer en al menos 2 páginas con un papel real.`).join("\n")
    : "Nadie más con nombre: no inventes amigos, hermanos ni familiares con nombre. Los adultos que aparezcan se nombran por lo que son.";

  const brief = `# Este cuento
Tema (el mundo donde ocurre): ${theme.es} — ${theme.seed_idea}
Edad del lector: ${input.ageBand} años
El protagonista (descríbelo así en character_sheet, en inglés): ${describeChild(input)}
${genderRule(input)}
Lo que más le gusta: ${hobby} — y eso debe ser LA CLAVE de cómo resuelve el problema en la página 12.
${pet && pet.visual ? `Le acompaña su mascota: ${pet.es.toLowerCase()} (${pet.visual}). Aparece en varias páginas y ayuda de alguna forma.` : "No tiene mascota: no inventes ninguna."}

# Momento que está viviendo (fija el beat "problem" de la página 2)
${moment.es}: ${moment.conflict_hint}.

# Tono
${tone.es}: ${tone.register_hint}.

# Personas de su vida que entran en el cuento
${peopleLines}

Escribe el cuento ahora.`;

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: brief },
  ];

  const instructions = Array.isArray(input.instructions) ? input.instructions.filter(Boolean) : [];
  if (instructions.length) {
    messages.push({
      role: "user",
      content:
        `Quien encarga el cuento ha pedido estos cambios sobre una versión anterior. Respétalos TODOS sin romper ninguna regla:\n` +
        instructions.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    });
  }

  if (previousErrors && previousErrors.length) {
    messages.push({
      role: "user",
      content:
        `Tu cuento anterior fue RECHAZADO por el validador con estos errores. ` +
        `Corrígelos TODOS y devuelve el cuento entero de nuevo:\n` +
        previousErrors.map((e) => `- ${e}`).join("\n"),
    });
  }

  return messages;
}

async function generateStory(input, deps = {}) {
  const complete = deps.completeJson || llm.completeJson;
  const maxAttempts = deps.maxAttempts || MAX_ATTEMPTS;
  const people = peopleOf(input).length;

  let errors = [];
  let costUsd = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const messages = buildMessages(input, attempt > 1 ? errors : null);
    const result = await complete({ messages, schema: SCHEMA });
    costUsd += result.costUsd || 0;

    const verdict = validateStory(result.data, { people });
    if (verdict.ok) {
      return { story: result.data, attempts: attempt, costUsd, errors: [] };
    }
    errors = verdict.errors;
    console.log(`[cuentos] attempt ${attempt} rejected: ${errors.length} errors`);
  }

  const err = new Error(`story did not validate after ${maxAttempts} attempts`);
  err.name = "StoryNotValidError";
  err.errors = errors;
  err.costUsd = costUsd;
  throw err;
}

module.exports = { buildMessages, generateStory, describeChild, peopleOf, SYSTEM, MAX_ATTEMPTS };
