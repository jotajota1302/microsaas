/*
 * Collection "Acuarela" — the single visual and narrative identity of the
 * product. STYLE is appended to every image prompt and must never change:
 * a different style is a different collection, not an edit of this one.
 *
 * Everything here is frozen on purpose. These lists are also the closed
 * option sets the order form offers, so the user can never type a value the
 * pipeline has not been designed for.
 */

const STYLE =
  ", soft children's watercolour illustration, light ink linework, warm limited palette, " +
  "visible paper texture, gentle rounded shapes, storybook composition, " +
  "no text, no lettering, no signage, no watermark";

// The prompt fragment that turns an illustrated page into a colouring page.
const LINEART_STYLE =
  "Convert this illustration into a children's colouring book page: clean solid black outlines " +
  "on a pure white background, thick even lines, no shading, no grey, no hatching, no colour, " +
  "no text. Keep the same composition and the same character.";

const THEMES = [
  // Every entry is a PLACE — the world the story happens in. "Football" used
  // to live here and never fitted: it is something a child does, not somewhere
  // they are, and it already exists as a hobby (which is what resolves the
  // story). Ordered from the child's own world outwards, which is also the
  // order a parent scans.
  { id: "casa", es: "Dentro de su casa", en: "Inside their house", seed_idea: "the ordinary house turned enormous, under the beds and behind the wardrobes, something that only appears at night" },
  { id: "ciudad", es: "Su barrio", en: "Their neighbourhood", seed_idea: "rooftops and balconies, a shopkeeper who knows everyone, something lost between two streets" },
  { id: "granja", es: "La granja", en: "The farm", seed_idea: "a farm at dawn, an animal that will not come out of the barn, a job nobody wants to do" },
  { id: "bosque", es: "El bosque", en: "The forest", seed_idea: "an old forest where the trees remember names, a shy animal that needs guiding home" },
  { id: "montana", es: "La montaña", en: "The mountain", seed_idea: "a stone refuge above the clouds, a path that changes shape, a goat that knows the way" },
  { id: "mar", es: "La playa y el mar", en: "The beach and the sea", seed_idea: "a coastal village, a lighthouse, a friendly sea creature that has lost something" },
  { id: "fondomar", es: "El fondo del mar", en: "The deep sea", seed_idea: "a city of coral, a light that goes out every night, a shy creature that guards something" },
  { id: "jungla", es: "La selva", en: "The jungle", seed_idea: "green light under the canopy, a river that hums, a creature that copies every sound" },
  { id: "desierto", es: "El desierto", en: "The desert", seed_idea: "dunes that move overnight, a well everyone has forgotten, a camel with its own opinions" },
  { id: "hielo", es: "El hielo y la nieve", en: "Ice and snow", seed_idea: "a white plain that creaks, a lamp in the long night, an animal following at a distance" },
  { id: "espacio", es: "El espacio", en: "Space", seed_idea: "a small homemade rocket, a planet made of soft clouds, a lonely little moon" },
  { id: "tren", es: "Un tren de noche", en: "A night train", seed_idea: "a sleeper train crossing the dark, a carriage that was not on the plan, a stop nobody announced" },
  { id: "circo", es: "El circo", en: "The circus", seed_idea: "a small travelling circus, a number that keeps going wrong, an act that needs one more pair of hands" },
  { id: "castillos", es: "Un castillo", en: "A castle", seed_idea: "a castle where nobody remembers how to be brave, a dragon who is simply cold" },
  { id: "piratas", es: "Una isla pirata", en: "A pirate island", seed_idea: "a crooked map, an island with two names, a crew that has forgotten how to agree" },
  { id: "dinosaurios", es: "El mundo de los dinosaurios", en: "The world of the dinosaurs", seed_idea: "a valley of gentle dinosaurs, a hatchling separated from its herd" },
];


const PETS = [
  { id: "ninguna", es: "Ninguna", en: "None", visual: null },
  { id: "perro", es: "Un perro", en: "A dog", visual: "a small friendly brown dog" },
  { id: "gato", es: "Un gato", en: "A cat", visual: "a fluffy grey cat" },
  { id: "conejo", es: "Un conejo", en: "A rabbit", visual: "a white rabbit with long ears" },
  { id: "pez", es: "Un pez", en: "A fish", visual: "an orange fish in a round bowl" },
  { id: "tortuga", es: "Una tortuga", en: "A turtle", visual: "a small green turtle" },
  { id: "pajaro", es: "Un pájaro", en: "A bird", visual: "a little yellow bird" },
  { id: "hamster", es: "Un hámster", en: "A hamster", visual: "a tiny golden hamster" },
];

const HOBBIES = [
  // The hobby is what RESOLVES the story on page 12, so each one has to be
  // something a child DOES. "The stars" and "plants" were interests, not
  // skills: there is nothing to do with them when the plot needs saving.
  { id: "dibujar", es: "Dibujar y pintar", en: "Drawing and painting" },
  { id: "manualidades", es: "Las manualidades", en: "Arts and crafts" },
  { id: "construir", es: "Construir con piezas", en: "Building with blocks" },
  { id: "leer", es: "Leer cuentos", en: "Reading stories" },
  { id: "cantar", es: "Cantar", en: "Singing" },
  { id: "musica", es: "Tocar un instrumento", en: "Playing an instrument" },
  { id: "bailar", es: "Bailar", en: "Dancing" },
  { id: "futbol", es: "El fútbol", en: "Football" },
  { id: "baloncesto", es: "El baloncesto", en: "Basketball" },
  { id: "nadar", es: "Nadar", en: "Swimming" },
  { id: "bicicleta", es: "Montar en bici", en: "Riding a bike" },
  { id: "patinar", es: "Patinar", en: "Skating" },
  { id: "cocinar", es: "Cocinar", en: "Cooking" },
  { id: "animales", es: "Cuidar animales", en: "Looking after animals" },
];


const HAIR_COLORS = [
  { id: "castano", es: "Castaño", en: "Brown", visual: "brown" },
  { id: "negro", es: "Negro", en: "Black", visual: "black" },
  { id: "rubio", es: "Rubio", en: "Blond", visual: "blond" },
  { id: "pelirrojo", es: "Pelirrojo", en: "Red", visual: "red" },
];

const HAIR_TYPES = [
  { id: "liso", es: "Liso", en: "Straight", visual: "straight" },
  { id: "rizado", es: "Rizado", en: "Curly", visual: "curly" },
  { id: "ondulado", es: "Ondulado", en: "Wavy", visual: "wavy" },
  { id: "trenzas", es: "Con trenzas", en: "Braided", visual: "in braids" },
  { id: "corto", es: "Corto", en: "Short", visual: "short" },
];

const SKIN_TONES = [
  { id: "clara", es: "Clara", en: "Light", visual: "light skin" },
  { id: "media", es: "Media", en: "Medium", visual: "medium skin" },
  { id: "morena", es: "Morena", en: "Tan", visual: "tan skin" },
  { id: "oscura", es: "Oscura", en: "Dark", visual: "dark skin" },
];

// Spanish is a gendered language: without this the model guesses, and half the
// stories call a girl "el niño". "neutro" asks for text that avoids gendered
// nouns and adjectives for the protagonist altogether.
const GENDERS = [
  { id: "nina", es: "Niña", en: "Girl", visual: "girl", noun: "la niña" },
  { id: "nino", es: "Niño", en: "Boy", visual: "boy", noun: "el niño" },
  { id: "neutro", es: "Prefiero no decirlo", en: "Prefer not to say", visual: "child", noun: null },
];

// People the child can bring into the story. Only the relation travels to
// the model; the name stays home as {{PERSONA1}} / {{PERSONA2}}.
const RELATIONS = [
  { id: "hermano", es: "Su hermano", en: "Brother", role: "su hermano", adult: false },
  { id: "hermana", es: "Su hermana", en: "Sister", role: "su hermana", adult: false },
  { id: "padre", es: "Su padre", en: "Father", role: "su padre", adult: true },
  { id: "madre", es: "Su madre", en: "Mother", role: "su madre", adult: true },
  { id: "abuelo", es: "Su abuelo", en: "Grandfather", role: "su abuelo", adult: true },
  { id: "abuela", es: "Su abuela", en: "Grandmother", role: "su abuela", adult: true },
  { id: "tio", es: "Su tío", en: "Uncle", role: "su tío", adult: true },
  { id: "tia", es: "Su tía", en: "Aunt", role: "su tía", adult: true },
  { id: "amigo", es: "Un amigo", en: "Friend (boy)", role: "su amigo", adult: false },
  { id: "amiga", es: "Una amiga", en: "Friend (girl)", role: "su amiga", adult: false },
  { id: "primo", es: "Su primo", en: "Cousin (boy)", role: "su primo", adult: false },
  { id: "prima", es: "Su prima", en: "Cousin (girl)", role: "su prima", adult: false },
];

// Ages offered for a COMPANION, which is not the same question as the reader's
// age band: a form that offers "3 to 5" for a father contradicts itself, so
// adults are never asked. AGE_BANDS stays what the book is written for.
const PERSON_AGES = [
  { id: "bebe", es: "Un bebé", en: "A baby", visual: "a baby" },
  { id: "2-3", es: "2 y 3 años", en: "2 and 3", visual: "a 3-year-old child" },
  { id: "4-5", es: "4 y 5 años", en: "4 and 5", visual: "a 5-year-old child" },
  { id: "6-8", es: "6 a 8 años", en: "6 to 8", visual: "a 7-year-old child" },
  { id: "9-12", es: "9 a 12 años", en: "9 to 12", visual: "a 10-year-old child" },
  { id: "adolescente", es: "Adolescente", en: "A teenager", visual: "a teenager" },
];
const MAX_PEOPLE = 2;

// The life moment fixes the story's problem. conflict_hint is what the model
// is told to build the "problem" beat around.
const MOMENTS = [
  { id: "cumple", es: "Es su cumpleaños", en: "It's their birthday", conflict_hint: "es el día de su cumpleaños y algo importante para la fiesta falta o se tuerce; el conflicto es cómo salvar el día sin que nadie se lo resuelva" },
  { id: "hermanito", es: "Va a tener un hermanito", en: "A baby sibling is coming", conflict_hint: "va a llegar un bebé a casa y teme dejar de ser importante; el conflicto es ese miedo, tratado con ternura y sin sermones" },
  { id: "mudanza", es: "Se muda de casa", en: "Moving house", conflict_hint: "acaba de mudarse o va a mudarse y todo le resulta extraño; el conflicto es hacer suyo un sitio nuevo" },
  { id: "cole", es: "Empieza el cole", en: "Starting school", conflict_hint: "empieza el colegio (o un curso nuevo) y le da vértigo lo desconocido; el conflicto es el primer día" },
  { id: "oscuridad", es: "Le da miedo la oscuridad", en: "Afraid of the dark", conflict_hint: "le da miedo la oscuridad o dormir solo; el conflicto es la noche, y la solución sale de su afición, nunca de un adulto que lo arregla" },
  { id: "anoranza", es: "Echa de menos a alguien", en: "Missing someone", conflict_hint: "echa de menos a alguien que está lejos (un abuelo, un amigo que se mudó); el conflicto es la distancia, y la resolución encuentra una forma de seguir cerca" },
  { id: "aventura", es: "Una aventura sin más", en: "Just an adventure", conflict_hint: "una aventura en el mundo del tema elegido, sin carga emocional especial: algo se pierde o se rompe y hay que resolverlo" },
];

// The tone fixes the register and the kind of ending.
const TONES = [
  { id: "dormir", es: "Para dormir", en: "Bedtime", register_hint: "ritmo lento y sereno, frases que arrullan, final en calma con el protagonista a punto de dormir o ya tranquilo; nada de sustos ni gritos" },
  { id: "divertido", es: "Divertido", en: "Funny", register_hint: "humor amable y situaciones absurdas pero nunca crueles; repeticiones y onomatopeyas que hagan reír al leer en voz alta; final alegre" },
  { id: "valiente", es: "Valiente", en: "Brave", register_hint: "el protagonista se enfrenta a algo que le da miedo y lo supera por sí mismo; tensión suave, nunca terror; final de orgullo tranquilo" },
];

const AGE_BANDS = [
  /*
   * The reader's age is not decoration: it decides how long a page is and how
   * it sounds. Two bands (3-5, 6-8) covered a narrow slice of the families who
   * buy this, and both got the same 60-90 words — which is a lot of text for a
   * three-year-old and thin for a ten-year-old.
   *
   * `words` is what the validator enforces; `target` is the narrower band the
   * model is asked to aim at, so a small miss still passes instead of throwing
   * a whole story away.
   */
  { id: "2-3", es: "2 y 3 años", en: "2 and 3", visual: "a 3-year-old", words: [25, 45], target: [30, 40],
    reading_hint: "frases muy cortas, una idea por frase, palabras de todos los días. Repeticiones y sonidos (¡plif!, ¡plaf!) que se disfrutan al leer en voz alta" },
  { id: "4-5", es: "4 y 5 años", en: "4 and 5", visual: "a 5-year-old", words: [40, 70], target: [48, 62],
    reading_hint: "frases cortas y mucho diálogo. Alguna palabra nueva, siempre explicada por lo que pasa alrededor" },
  { id: "6-8", es: "6 a 8 años", en: "6 to 8", visual: "a 7-year-old", words: [60, 90], target: [70, 85],
    reading_hint: "frases de longitud media, vocabulario rico pero claro, humor amable y algún detalle sensorial" },
  { id: "9-12", es: "9 a 12 años", en: "9 to 12", visual: "a 10-year-old", words: [85, 130], target: [95, 120],
    reading_hint: "párrafos algo más largos, vocabulario amplio, más mundo interior del protagonista y diálogos con lo que no se dice" },
];

// Orders taken before the bands were re-cut carry ids that no longer exist.
// They are still readable stories: map them to the closest band rather than
// crashing when one is revised.
const LEGACY_AGE_BANDS = { "3-5": "4-5" };
const DEFAULT_AGE_BAND = "6-8";

/** The band for an id, never undefined: an unknown one reads as the default. */
function ageBand(id) {
  const key = LEGACY_AGE_BANDS[id] || id;
  return AGE_BANDS.find((b) => b.id === key) || AGE_BANDS.find((b) => b.id === DEFAULT_AGE_BAND);
}


// The narrative shape every story must have, page by page. The validator
// checks the sequence; the model is told to label each page with its beat.
const PAGE_COUNT = 12;
const WORDS_MIN = 60;
const WORDS_MAX = 90;
const BEATS = ["setup", "problem", "attempt", "attempt", "resolution"];

// Position rules the validator enforces: page 1 is setup, page 12 is
// resolution, and at least two attempts sit in between.
const BEAT_RULES = Object.freeze({
  firstPage: "setup",
  lastPage: "resolution",
  minAttempts: 2,
  minProblems: 1,
});

const COLORING_PAGE_COUNT = 4;
// Title + nameplate + 12 scenes + 4 colouring + character card + colophon.
// A MULTIPLE OF FOUR on purpose: a bound book is folded sheets of four pages,
// so printers require it (Blurb states it; it is the norm). See lib/pdf.js.
const BOOK_PAGE_COUNT = 20;

// Words that must never appear in a story for 3-8 year olds. Matched on
// normalised text (lowercase, no accents), on word boundaries.
const BLOCKLIST = [
  // violence and weapons
  // "herida" is deliberately NOT here: a bird with a hurt wing is the most
  // common plot in children's books. Nuance is the second pass's job.
  "matar", "muerte", "muerto", "muerta", "morir", "sangre", "arma", "pistola",
  "cuchillo", "espada ensangrentada", "disparar", "golpear", "pegar una paliza", "guerra",
  "batalla sangrienta", "explosion", "bomba", "veneno", "envenenar",
  // fear
  "pesadilla", "terror", "monstruo horrible", "demonio", "infierno", "fantasma aterrador",
  "secuestrar", "raptar", "desaparecer para siempre", "abandonar para siempre",
  // adult content and substances
  // "vino" alone is the preterite of "venir" ("el sol vino a despertarla") and
  // refused good stories; the drink is matched in the shapes it turns up in.
  "sexo", "desnudo", "desnuda", "alcohol", "borracho", "cerveza", "tabaco",
  "copa de vino", "botella de vino", "vaso de vino", "vino tinto", "vino blanco",
  "fumar", "droga", "casino", "apostar",
  // illness and self-harm
  "cancer", "suicidio", "hacerse dano", "cortarse",
  // religion and politics (deliberately out of scope, not judged)
  "dios", "jesus", "biblia", "iglesia catolica", "alá", "coran", "rezar a",
  "partido politico", "elecciones", "presidente del gobierno",
  // trademarks
  "disney", "pixar", "marvel", "pokemon", "peppa pig", "paw patrol", "patrulla canina",
  "frozen", "elsa", "spiderman", "batman", "barbie", "lego", "minecraft", "roblox",
  "coca cola", "mcdonalds", "nike", "adidas", "real madrid", "barcelona fc",
];

// Common Spanish words that are capitalised mid-sentence without being proper
// names. Used by the invented-name check so it does not produce false alarms.
// Capitalised words the validator must NOT read as an invented character name.
// These are real names a children's story legitimately reaches for; without
// them the validator rejects the very story the prompt asked for (measured:
// a stargazing story was refused four times over "Osa Mayor").
const NAME_WHITELIST = [
  "Sol", "Luna", "Mar", "Tierra", "Norte", "Sur", "Este", "Oeste",
  "Navidad", "Reyes", "Papá", "Mamá", "Abuela", "Abuelo", "Señor", "Señora",
  // sky
  "Osa", "Mayor", "Menor", "Vía", "Láctea", "Polar", "Estrella", "Cruz",
  "Marte", "Venus", "Júpiter", "Saturno", "Mercurio", "Neptuno", "Urano", "Plutón", "Orión",
  // calendar
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
  "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo",
  // places a Spanish child hears every day
  "España", "Atlántico", "Mediterráneo", "Cantábrico", "Pirineos",
];

// Fallback illustrations, one battery per theme, pre-generated with the same
// STYLE. Used when a page fails twice: never leave a hole in the book.
function fallbackImage(themeId, index) {
  const theme = THEMES.find((t) => t.id === themeId);
  if (!theme) throw new Error(`[cuentos] unknown theme: ${themeId}`);
  const n = String((index % 6) + 1).padStart(2, "0");
  return `assets/img/fallback/${theme.id}-${n}.jpg`;
}

function ids(list) {
  return list.map((x) => x.id);
}

module.exports = Object.freeze({
  STYLE,
  LINEART_STYLE,
  THEMES,
  PETS,
  HOBBIES,
  HAIR_COLORS,
  HAIR_TYPES,
  SKIN_TONES,
  GENDERS,
  RELATIONS,
  PERSON_AGES,
  MAX_PEOPLE,
  MOMENTS,
  TONES,
  AGE_BANDS,
  PAGE_COUNT,
  WORDS_MIN,
  WORDS_MAX,
  BEATS,
  BEAT_RULES,
  COLORING_PAGE_COUNT,
  BOOK_PAGE_COUNT,
  BLOCKLIST,
  NAME_WHITELIST,
  LEGACY_AGE_BANDS,
  DEFAULT_AGE_BAND,
  ageBand,
  fallbackImage,
  ids,
});
