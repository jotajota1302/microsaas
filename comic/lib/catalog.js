/*
 * The closed lists. Everything the buyer can choose lives here, and nothing
 * else is accepted — the form offers exactly these options, the validator
 * rejects anything outside them, and the prompts are built from them.
 *
 * Same discipline as cuentos/lib/collection.js, for the same reason: the
 * pipeline can only be designed for values it knows about. Two rules on top of
 * that one, both of them ours:
 *
 *   1. NO TITLES, EVER. The buyer picks the furniture of a genre, never a work.
 *      "Academia donde se entrenan poderes" is free; the name of the series it
 *      reminds them of is a trademark, and the moment it enters a prompt, a log
 *      or a listing it stops being inspiration and starts being evidence.
 *      See the IP rule in ../CLAUDE.md.
 *   2. A STYLE IS A COLLECTION. Changing a style string is not an edit, it is a
 *      new collection: every comic already sold was drawn with the old one.
 */

// --- visual styles -----------------------------------------------------------
// Each one is a full anchor, not a modifier: it goes FIRST in the prompt, which
// is what stopped the drift measured on 2026-08-21.

const STYLES = {
  "manga-bn": {
    label: "Manga en blanco y negro",
    hint: "El manga de verdad: tinta, tramas y líneas de velocidad, sin color.",
    // The default on purpose. No colour means no palette to drift: it removes
    // the axis the model kept escaping through, instead of fighting it.
    anchor:
      "Black and white manga panel, pure greyscale, no colour at all, crisp black ink linework of " +
      "varying weight, benday screentone dot shading, hatching for shadows, speed lines, " +
      "high contrast pure blacks and pure whites, printed manga page texture",
  },
  "shonen": {
    label: "Shōnen a color",
    hint: "Acción, color vivo, gestos grandes. Lo más reconocible.",
    anchor:
      "Flat 2D cel-shaded anime comic panel, hand-drawn animation cel, bold black ink outlines of " +
      "even weight, three-tone flat shading with hard edges, halftone screentone texture, " +
      "limited flat palette of navy blue, crimson red, cream white and teal, high contrast, " +
      "clean vector-like fills, no gradients",
  },
  "seinen": {
    label: "Seinen",
    hint: "Proporciones reales y expresión contenida. Para los que ya no quieren nada infantil.",
    anchor:
      "Seinen manga panel, realistic adult proportions, restrained facial expressions, " +
      "detailed ink linework with fine hatching, muted desaturated palette of slate grey, " +
      "ochre and dull blue, naturalistic lighting, grounded everyday settings, sober composition",
  },
  "americano": {
    label: "Cómic americano clásico",
    hint: "Tinta pesada, puntos de trama y colores primarios. El superhéroe de toda la vida.",
    anchor:
      "Classic American comic book panel, heavy black ink outlines, bold brush inking, " +
      "benday dot halftone colour, saturated primary palette of red, blue and yellow, " +
      "dramatic low angles, newsprint texture, four-colour printing look",
  },
  "novela-grafica": {
    label: "Novela gráfica",
    hint: "Pintado, paleta sucia y luz de cine. El más adulto de todos.",
    anchor:
      "Graphic novel panel, painted illustration with visible brushwork, muted dirty palette of " +
      "umber, teal and bone, cinematic directional lighting, heavy atmosphere, loose confident " +
      "linework, textured paper grain",
  },
  "ligne-claire": {
    label: "Línea clara europea",
    hint: "Línea limpia y color plano. Todo se lee de un vistazo.",
    anchor:
      "Ligne claire European comic panel, uniform even black outline of constant weight, " +
      "completely flat areas of colour with no shading and no hatching, clear readable " +
      "architecture and backgrounds, calm bright palette, everything in sharp focus",
  },
};

// The negatives that survived measurement, plus the trademark rule.
const NEGATIVES =
  "Strictly flat 2D drawn illustration. NOT photorealistic, NOT a 3D render, NOT CGI, " +
  "no realistic skin pores, no realistic fabric or knitted wool texture, no cinematic photography, " +
  "no depth of field, no bokeh, no lens blur, no painterly digital oil painting, no airbrush. " +
  "No watermark, no signature, no artist mark, no page border, no panel frame. " +
  "All devices and clothing are unbranded: no brand logos, no company logos, no trademarks, " +
  "no readable brand names on laptops, phones or clothes";

const NEGATIVES_SHORT =
  "Strictly flat 2D drawn illustration. NOT photorealistic, NOT 3D, no depth of field, " +
  "no painterly brushwork. No watermark, no signature, no brand logos on devices or clothes";

// Styles that are greyscale by definition: the palette words must not be added.
const MONOCHROME = new Set(["manga-bn"]);

// --- story furniture ---------------------------------------------------------
// Tropes, not works. Each carries the setting the writer needs and nothing that
// belongs to anybody.

const TROPES = {
  academia: {
    label: "Una academia donde entrenan poderes",
    world: "a modern academy where teenagers train newly awakened powers, dormitories, training halls, entrance exams",
  },
  cazador: {
    label: "Cazadores de criaturas",
    world: "a world where ordinary streets hide creatures, and a guild of hunters keeps them out of sight",
  },
  torneo: {
    label: "Un torneo por eliminatorias",
    world: "a tournament with rounds, brackets, rivals who become allies, and a crowd that never leaves",
  },
  mecha: {
    label: "Pilotos de mecha",
    world: "a defence corps of giant piloted machines, hangars, launch bays and a city that needs shielding",
  },
  isekai: {
    label: "Te transportan a otro mundo",
    world: "an ordinary teenager pulled into another world with its own rules, unable to go home yet",
  },
  club: {
    label: "Un club del instituto",
    world: "an after-school club that turns out to matter far more than anyone thought, classrooms and rooftops",
  },
  detectives: {
    label: "Detectives / misterio",
    world: "a city with a case nobody official wants to solve, evidence hidden in plain sight",
  },
  ciber: {
    label: "Ciberamenaza en la ciudad",
    world: "a connected city where infrastructure itself is under attack, server halls, dark streets, dead traffic lights",
  },
};

const TONES = {
  epico: { label: "Épico", hint: "Grande, con momentos de subidón." },
  oscuro: { label: "Oscuro", hint: "Serio, con consecuencias reales." },
  humor: { label: "Con humor", hint: "Se toma en serio a sí mismo sin ser solemne." },
};

// --- the character -----------------------------------------------------------
// Closed appearance lists, so the frozen character block never has to improvise.

const HAIR_SHAPE = {
  corto: "short cropped hair",
  despeinado: "short messy hair",
  largo: "long straight hair",
  rizado: "curly hair",
  recogido: "hair tied back in a ponytail",
  trenzas: "hair in braids",
  rapado: "buzzed hair",
  flequillo: "straight hair with a blunt fringe",
};

const HAIR_COLOUR = {
  negro: "black", castano: "dark brown", claro: "light brown",
  rubio: "blond", pelirrojo: "red", blanco: "white", tenido: "dyed bright blue",
};

const EYES = {
  marron: "dark brown", miel: "hazel", verde: "green", azul: "blue", gris: "grey", negro: "black",
};

const SKIN = {
  clara: "fair", media: "light brown", morena: "brown", oscura: "dark brown",
};

const BUILD = {
  delgado: "slight build", normal: "average build",
  atletico: "athletic build", fuerte: "solidly built", bajito: "short for their age",
};

/*
 * The mark. Not decoration: it is the anchor the model recognises from panel to
 * panel. Kia's grey hoodie is what held the character together across 49 panels;
 * without one, the face wanders. One is required.
 */
const MARKS = {
  bufanda: "a long red scarf",
  capucha: "an oversized grey hoodie worn with the hood down",
  gorra: "a worn baseball cap turned backwards",
  auriculares: "big over-ear headphones around the neck",
  cazadora: "a battered leather jacket",
  mochila: "a heavy patched backpack on one shoulder",
  gafas: "thick round glasses",
  pulsera: "a stack of woven bracelets on one wrist",
  bata: "an open school jacket several sizes too big",
};

/*
 * The trait. The single most important field in the form: it is what has to
 * resolve the conflict on the last page, and it is the whole gift. A comic where
 * the adult hero saves the day is a comic about somebody else.
 */
const TRAITS = {
  "no-se-rinde": { label: "No se rinde nunca", en: "never gives up, keeps going after everyone else has stopped" },
  observador: { label: "Se fija en todo", en: "notices the small detail that everybody else walks past" },
  gracioso: { label: "Hace reír a todo el mundo", en: "defuses anything with a joke, and it is a real weapon" },
  protector: { label: "Protege a los suyos", en: "puts themselves between danger and the people they care about" },
  honesto: { label: "No sabe mentir", en: "cannot lie, which costs them dearly and then saves them" },
  rapido: { label: "Piensa rápido", en: "improvises a plan while everything is still falling apart" },
  tozudo: { label: "Es cabezota", en: "refuses to accept an answer they were given, and is right to" },
  leal: { label: "Nunca deja a nadie atrás", en: "will not abandon anyone, even when it is the sensible thing" },
};

const RELATIONS = {
  "mejor-amigo": "su mejor amigo", "mejor-amiga": "su mejor amiga",
  hermano: "su hermano mayor", hermana: "su hermana mayor",
  "hermano-peq": "su hermano pequeño", "hermana-peq": "su hermana pequeña",
  primo: "su primo", prima: "su prima",
  entrenador: "su entrenador", profesora: "su profesora favorita",
  abuelo: "su abuelo", abuela: "su abuela",
};

/*
 * Reader age decides register and page length, the way cuentos maps age to
 * words per page. Thirteen is not sixteen.
 */
const AGE_BANDS = {
  "12-13": {
    label: "12-13 años", pages: 12, words: [4, 16],
    register: "direct, energetic, short sentences, nothing cynical",
    // What the dialogue pass is allowed to put in their mouths. Measured
    // 2026-08-22: without permission to be messy, every character ends up
    // speaking in tidy quotable lines and the critic calls it "frases de póster".
    speech: "nada de tacos; sí muletillas de crío («jo», «es que», «buah»), frases a medias y repeticiones",
  },
  "14-15": {
    label: "14-15 años", pages: 14, words: [4, 20],
    register: "wry, a bit sarcastic, self-aware, never cute",
    speech: "tacos suaves y contados («joder», «mierda», «tío»/«tía»); muletillas reales («en plan», «o sea», «es que», «vale»), interrupciones y frases sin terminar",
  },
  "16-17": {
    label: "16-17 años", pages: 16, words: [3, 22],
    register: "dry, understated, adult rhythm, silences allowed",
    speech: "tacos normales sin pasarse; mucho subtexto, respuestas cortantes, silencios y frases que se cortan a la mitad",
  },
};
const DEFAULT_AGE_BAND = "14-15";

/** Never returns undefined: an unknown band falls back rather than crashing an old order. */
function ageBand(id) {
  return AGE_BANDS[id] || AGE_BANDS[DEFAULT_AGE_BAND];
}

/*
 * Free-text fields are limited to names and a dedication, and both go through
 * this. Trademarks are here for the same reason as in cuentos: somebody will
 * type the name of their favourite series into the name field.
 */
const BLOCKLIST = [
  // franchises: the IP rule, enforced at the only door where free text enters
  "naruto", "goku", "dragon ball", "one piece", "luffy", "pokemon", "pikachu",
  "demon slayer", "tanjiro", "jujutsu", "gojo", "attack on titan", "eren", "titan",
  "my hero academia", "deku", "bleach", "ichigo", "sailor moon", "evangelion",
  "marvel", "dc comics", "spiderman", "spider-man", "batman", "superman", "ironman",
  "iron man", "avengers", "vengadores", "hulk", "thor", "wolverine", "x-men",
  "star wars", "harry potter", "disney", "pixar", "nintendo", "mario", "zelda",
  "minecraft", "roblox", "fortnite", "among us",
  // Marcas de consumo que un guion en español mete sin darse cuenta. Salieron
  // en pruebas reales ("two mugs of ColaCao"), y acaban dibujadas en la viñeta.
  "colacao", "cola cao", "nesquik", "coca cola", "fanta", "iphone", "android",
  "whatsapp", "instagram", "tiktok", "youtube", "netflix", "playstation", "xbox",
  // adult content and hard violence: the reader is a minor
  "sexo", "desnudo", "desnuda", "porno", "violacion", "droga", "cocaina", "heroina",
  "suicidio", "suicidarse", "autolesion", "cortarse las venas", "matarse",
  "nazi", "hitler", "isis", "terrorista",
  // real people and identifiers
  // "telefono" estuvo aquí y era un falso positivo: un personaje puede decir la palabra.
  "presidente del gobierno", "numero de dni", "mi nie",
];

/*
 * What the buyer reads. The appearance maps above hold the ENGLISH fragment the
 * illustrator needs; these are the Spanish and English labels the form shows.
 * Kept separate on purpose: one is a prompt, the other is copy, and merging
 * them is how a prompt ends up on a web page.
 */
const LABELS = {
  hairShape: {
    corto: ["Corto", "Short"], despeinado: ["Despeinado", "Messy"],
    largo: ["Largo y liso", "Long and straight"], rizado: ["Rizado", "Curly"],
    recogido: ["Recogido en coleta", "Ponytail"], trenzas: ["Trenzas", "Braids"],
    rapado: ["Rapado", "Buzzed"], flequillo: ["Con flequillo", "With a fringe"],
  },
  hairColour: {
    negro: ["Negro", "Black"], castano: ["Castaño oscuro", "Dark brown"],
    claro: ["Castaño claro", "Light brown"], rubio: ["Rubio", "Blond"],
    pelirrojo: ["Pelirrojo", "Red"], blanco: ["Blanco", "White"],
    tenido: ["Teñido de azul", "Dyed blue"],
  },
  eyes: {
    marron: ["Marrones", "Brown"], miel: ["Color miel", "Hazel"], verde: ["Verdes", "Green"],
    azul: ["Azules", "Blue"], gris: ["Grises", "Grey"], negro: ["Negros", "Black"],
  },
  skin: {
    clara: ["Clara", "Fair"], media: ["Media", "Light brown"],
    morena: ["Morena", "Brown"], oscura: ["Oscura", "Dark brown"],
  },
  build: {
    delgado: ["Delgada", "Slight"], normal: ["Normal", "Average"],
    atletico: ["Atlética", "Athletic"], fuerte: ["Fuerte", "Solid"],
    bajito: ["Bajita para su edad", "Short for their age"],
  },
  marks: {
    bufanda: ["Una bufanda roja", "A red scarf"],
    capucha: ["Una sudadera con capucha", "An oversized hoodie"],
    gorra: ["Una gorra del revés", "A backwards cap"],
    auriculares: ["Auriculares al cuello", "Headphones round the neck"],
    cazadora: ["Una cazadora de cuero", "A leather jacket"],
    mochila: ["Una mochila llena de parches", "A patched backpack"],
    gafas: ["Gafas redondas", "Round glasses"],
    pulsera: ["Un montón de pulseras", "A stack of bracelets"],
    bata: ["La chaqueta del insti dos tallas grande", "An oversized school jacket"],
  },
};

/** Spanish label for a catalogue id, falling back to the id itself. */
function label(group, id, lang = "es") {
  const entry = LABELS[group] && LABELS[group][id];
  if (!entry) return id;
  return lang === "en" ? entry[1] : entry[0];
}

const ids = (obj) => Object.keys(obj);

module.exports = {
  STYLES, MONOCHROME, NEGATIVES, NEGATIVES_SHORT,
  TROPES, TONES,
  HAIR_SHAPE, HAIR_COLOUR, EYES, SKIN, BUILD, MARKS, TRAITS, RELATIONS,
  AGE_BANDS, DEFAULT_AGE_BAND, ageBand,
  LABELS, label,
  BLOCKLIST, ids,
};
