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
  { id: "mar", es: "El mar", en: "The sea", seed_idea: "a coastal village, a lighthouse, a friendly sea creature that has lost something" },
  { id: "bosque", es: "El bosque", en: "The forest", seed_idea: "an old forest where the trees remember names, a shy animal that needs guiding home" },
  { id: "espacio", es: "El espacio", en: "Space", seed_idea: "a small homemade rocket, a planet made of soft clouds, a lonely little moon" },
  { id: "dinosaurios", es: "Dinosaurios", en: "Dinosaurs", seed_idea: "a valley of gentle dinosaurs, a hatchling separated from its herd" },
  { id: "castillos", es: "Princesas y caballeros", en: "Princesses and knights", seed_idea: "a castle where nobody remembers how to be brave, a dragon who is simply cold" },
  { id: "futbol", es: "Fútbol", en: "Football", seed_idea: "a neighbourhood pitch, a match that cannot start because something is missing" },
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
  { id: "dibujar", es: "Dibujar", en: "Drawing" },
  { id: "bailar", es: "Bailar", en: "Dancing" },
  { id: "futbol", es: "El fútbol", en: "Football" },
  { id: "leer", es: "Leer", en: "Reading" },
  { id: "cocinar", es: "Cocinar", en: "Cooking" },
  { id: "musica", es: "La música", en: "Music" },
  { id: "nadar", es: "Nadar", en: "Swimming" },
  { id: "construir", es: "Construir cosas", en: "Building things" },
  { id: "animales", es: "Los animales", en: "Animals" },
  { id: "estrellas", es: "Las estrellas", en: "The stars" },
  { id: "bicicleta", es: "La bicicleta", en: "Cycling" },
  { id: "plantas", es: "Las plantas", en: "Plants" },
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
  { id: "hermano", es: "Su hermano", en: "Brother", role: "su hermano" },
  { id: "hermana", es: "Su hermana", en: "Sister", role: "su hermana" },
  { id: "padre", es: "Su padre", en: "Father", role: "su padre" },
  { id: "madre", es: "Su madre", en: "Mother", role: "su madre" },
  { id: "abuelo", es: "Su abuelo", en: "Grandfather", role: "su abuelo" },
  { id: "abuela", es: "Su abuela", en: "Grandmother", role: "su abuela" },
  { id: "amigo", es: "Un amigo", en: "Friend (boy)", role: "su amigo" },
  { id: "amiga", es: "Una amiga", en: "Friend (girl)", role: "su amiga" },
  { id: "primo", es: "Su primo", en: "Cousin (boy)", role: "su primo" },
  { id: "prima", es: "Su prima", en: "Cousin (girl)", role: "su prima" },
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
  { id: "3-5", es: "3 a 5 años", en: "3 to 5" },
  { id: "6-8", es: "6 a 8 años", en: "6 to 8" },
];

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
const BOOK_PAGE_COUNT = 18; // title + 12 scenes + 4 colouring + card/colophon

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
  "sexo", "desnudo", "desnuda", "alcohol", "borracho", "cerveza", "vino", "tabaco",
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
  fallbackImage,
  ids,
});
