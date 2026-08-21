/*
 * Free colouring gallery: the SEO asset that costs nothing to serve.
 *
 * Twenty fixed themes, one page each. The pages are drawn once by
 * scripts/gen-coloring-gallery.js and committed as static files, so the
 * gallery needs no database and has no runtime cost: plain HTML plus a PNG
 * and a print-ready PDF per theme.
 *
 * Gallery pages are drawn from scratch, not converted from an illustration,
 * so they use their own prompt (SHEET_STYLE) instead of collection.LINEART_STYLE.
 */

// The visual contract of every gallery page. Frozen: changing it would leave
// the already-published pages inconsistent with the new ones.
const SHEET_STYLE =
  "A children's colouring book page, black and white line art: clean solid black outlines " +
  "on a pure white background, thick even lines, generous open areas to colour in, " +
  "no shading, no grey, no hatching, no colour fills, no text, no lettering, no watermark, " +
  "friendly rounded shapes, simple and readable for a child aged 4 to 8, centred composition " +
  "with a small margin of white around the drawing.";

/**
 * slug   the ES url segment (/colorear/<slug>/)
 * en     the EN url segment (/en/coloring/<en>/)
 * scene  what to draw, in English, for the image model
 */
const THEMES = [
  {
    slug: "dinosaurios", en: "dinosaurs",
    title: { es: "Dinosaurios", en: "Dinosaurs" },
    intro: {
      es: "Un diplodocus enorme y un bebé dinosaurio recién salido del huevo, con helechos y un volcán tranquilo al fondo.",
      en: "A huge diplodocus and a baby dinosaur fresh out of its egg, with ferns and a quiet volcano behind them.",
    },
    scene: "a huge friendly long-necked diplodocus lowering its head towards a small baby dinosaur that has just hatched from a cracked egg, tall ferns, three round stones and a calm distant volcano",
  },
  {
    slug: "unicornios", en: "unicorns",
    title: { es: "Unicornios", en: "Unicorns" },
    intro: {
      es: "Un unicornio de crin larguísima descansando en un prado de flores, bajo un arcoíris para colorear a tu gusto.",
      en: "A unicorn with a very long mane resting in a flowery meadow, under a rainbow you can colour any way you like.",
    },
    scene: "a gentle unicorn with a very long flowing mane standing in a meadow of large simple flowers, a wide rainbow arch above it, two butterflies",
  },
  {
    slug: "princesas", en: "princesses",
    title: { es: "Princesas", en: "Princesses" },
    intro: {
      es: "Una princesa asomada al balcón de su castillo, con torres, banderas y un gato dormido en la barandilla.",
      en: "A princess leaning out of her castle balcony, with towers, flags and a cat asleep on the railing.",
    },
    scene: "a princess in a long dress with a small crown leaning out of a castle balcony, tall towers with pointed roofs and flags behind her, a cat curled up asleep on the stone railing",
  },
  {
    slug: "coches", en: "cars",
    title: { es: "Coches", en: "Cars" },
    intro: {
      es: "Un coche de carreras en la línea de salida, con banderas a cuadros y las gradas llenas.",
      en: "A racing car on the starting line, with chequered flags and a full grandstand.",
    },
    scene: "a chunky cartoon racing car with big wheels, a spoiler and a driver waving from the window, seen from the front three quarters and filling most of the page, two chequered flags crossed behind it, a starting line under the wheels",
  },
  {
    slug: "gatos", en: "cats",
    title: { es: "Gatos", en: "Cats" },
    intro: {
      es: "Tres gatitos jugando con un ovillo de lana en una alfombra, con una ventana y una planta detrás.",
      en: "Three kittens playing with a ball of wool on a rug, with a window and a plant behind them.",
    },
    scene: "three round fluffy kittens playing with a big ball of wool that unrolls across a patterned rug, a window with curtains and a potted plant behind them",
  },
  {
    slug: "dragones", en: "dragons",
    title: { es: "Dragones", en: "Dragons" },
    intro: {
      es: "Un dragón bonachón sentado en lo alto de una montaña, con las alas abiertas y una bufanda al cuello.",
      en: "A good-natured dragon sitting on top of a mountain, wings open and a scarf around its neck.",
    },
    scene: "a plump friendly dragon with round eyes sitting on a rocky mountain top, wings spread wide, a long knitted scarf around its neck, small clouds and a crescent moon",
  },
  {
    slug: "sirenas", en: "mermaids",
    title: { es: "Sirenas", en: "Mermaids" },
    intro: {
      es: "Una sirena peinándose sobre una roca, rodeada de peces, estrellas de mar y burbujas.",
      en: "A mermaid combing her hair on a rock, surrounded by fish, starfish and bubbles.",
    },
    scene: "a mermaid sitting on a smooth rock combing her long wavy hair, a scalloped tail, four round fish, two starfish and a trail of bubbles around her, seaweed at the bottom",
  },
  {
    slug: "espacio", en: "space",
    title: { es: "El espacio", en: "Space" },
    intro: {
      es: "Un astronauta saludando desde la luna, con su cohete aparcado y planetas de anillos al fondo.",
      en: "An astronaut waving from the moon, rocket parked nearby and ringed planets in the distance.",
    },
    scene: "a small astronaut in a round helmet waving, standing on the cratered moon next to a parked rocket with fins, a ringed planet and simple five-pointed stars in the sky",
  },
  {
    slug: "piratas", en: "pirates",
    title: { es: "Piratas", en: "Pirates" },
    intro: {
      es: "Un barco pirata con las velas hinchadas, un loro en el mástil y una isla con un cofre en la orilla.",
      en: "A pirate ship with full sails, a parrot on the mast and an island with a chest on the shore.",
    },
    scene: "a pirate ship with three full sails and a flag riding rounded waves, a parrot perched on the mast, a small island with two palm trees and a treasure chest on the sand",
  },
  {
    slug: "granja", en: "farm",
    title: { es: "La granja", en: "The farm" },
    intro: {
      es: "Una vaca, una oveja y un cerdito delante del granero, con un gallo en la valla y girasoles.",
      en: "A cow, a sheep and a piglet in front of the barn, with a rooster on the fence and sunflowers.",
    },
    scene: "a cow, a woolly sheep and a round piglet standing in front of a barn with a double door, a rooster on the wooden fence, three tall sunflowers on the right",
  },
  {
    slug: "mariposas", en: "butterflies",
    title: { es: "Mariposas", en: "Butterflies" },
    intro: {
      es: "Cinco mariposas de alas grandes y dibujos distintos, revoloteando sobre un macizo de flores.",
      en: "Five big-winged butterflies, each with a different pattern, over a bed of flowers.",
    },
    scene: "five large butterflies with wide wings, each wing filled with a different simple pattern of circles, teardrops and swirls, flying above a bed of large daisies and tulips",
  },
  {
    slug: "robots", en: "robots",
    title: { es: "Robots", en: "Robots" },
    intro: {
      es: "Un robot grande de tornillos y antenas dando la mano a otro pequeñito con ruedas.",
      en: "A big bolted robot with antennas shaking hands with a tiny one on wheels.",
    },
    scene: "a big boxy robot with bolts, dials and two antennas shaking hands with a tiny round robot on wheels, gears and simple tools scattered on the floor around them",
  },
  {
    slug: "hadas", en: "fairies",
    title: { es: "Hadas", en: "Fairies" },
    intro: {
      es: "Un hada sentada en una seta gigante, con alas de encaje, una varita y luciérnagas alrededor.",
      en: "A fairy sitting on a giant mushroom, with lacy wings, a wand and fireflies around her.",
    },
    scene: "a small fairy with lacy patterned wings sitting on a giant spotted mushroom holding a star-tipped wand, tall grass, three round fireflies and a snail beside her",
  },
  {
    slug: "tiburones", en: "sharks",
    title: { es: "Tiburones", en: "Sharks" },
    intro: {
      es: "Un tiburón sonriente nadando entre corales, con dos peces payaso y un pulpo escondido.",
      en: "A smiling shark swimming through coral, with two clownfish and an octopus hiding.",
    },
    scene: "a smiling cartoon shark with rounded teeth swimming above a coral reef, two striped clownfish, an octopus peeking from behind a rock, bubbles rising",
  },
  {
    slug: "futbol", en: "football",
    title: { es: "Fútbol", en: "Football" },
    intro: {
      es: "Un niño chutando a portería mientras el portero se estira, con el balón a medio camino.",
      en: "A child striking at goal while the keeper dives, the ball halfway there.",
    },
    scene: "a child kicking a football towards a goal while the goalkeeper dives sideways with outstretched arms, the ball in mid air with a simple pentagon pattern, grass and a corner flag",
  },
  {
    slug: "navidad", en: "christmas",
    title: { es: "Navidad", en: "Christmas" },
    intro: {
      es: "Un árbol de Navidad cargado de bolas y regalos, con un muñeco de nieve asomando por la ventana.",
      en: "A Christmas tree loaded with baubles and presents, a snowman peeking through the window.",
    },
    scene: "a christmas tree covered in round baubles with a star on top, wrapped presents with ribbons at its base, a fireplace with two stockings, a snowman visible through the window",
  },
  {
    slug: "halloween", en: "halloween",
    title: { es: "Halloween", en: "Halloween" },
    intro: {
      es: "Una calabaza sonriente, un fantasmita simpático y un murciélago sobre la luna llena.",
      en: "A grinning pumpkin, a friendly little ghost and a bat against a full moon.",
    },
    scene: "a big grinning carved pumpkin filling the lower half of the page, a small friendly round ghost floating beside it, a bat with open wings above them, a bare tree on the left and three wrapped sweets on the ground, no moon, no shaded areas",
  },
  {
    slug: "flores", en: "flowers",
    title: { es: "Flores", en: "Flowers" },
    intro: {
      es: "Un ramo grande de flores distintas en un jarrón de rayas, con una abeja dando vueltas.",
      en: "A big bouquet of different flowers in a striped vase, with a bee circling.",
    },
    scene: "a large bouquet of six different flowers with big open petals in a striped vase on a table, leaves spilling over the sides, a round bee flying above",
  },
  {
    slug: "trenes", en: "trains",
    title: { es: "Trenes", en: "Trains" },
    intro: {
      es: "Una locomotora de vapor con dos vagones cruzando un puente, echando nubes de humo.",
      en: "A steam engine with two carriages crossing a bridge, puffing clouds of smoke.",
    },
    scene: "a steam locomotive with a round funnel pulling two carriages across an arched stone bridge, round puffs of smoke above, hills and a river below",
  },
  {
    slug: "superheroes", en: "superheroes",
    title: { es: "Superhéroes", en: "Superheroes" },
    intro: {
      es: "Un superhéroe con la capa al viento, volando por encima de los tejados de la ciudad.",
      en: "A superhero with a streaming cape, flying above the city rooftops.",
    },
    scene: "a child superhero with a long cape streaming behind, flying with one fist forward above a city of simple square buildings, a star emblem on the chest, three birds and small clouds",
  },
];

const BY_SLUG = new Map();
for (const t of THEMES) { BY_SLUG.set(t.slug, t); BY_SLUG.set(t.en, t); }

function findTheme(slug) {
  return BY_SLUG.get(String(slug || "").toLowerCase()) || null;
}

/** The full prompt for one gallery page: style first, scene second. */
function coloringPrompt(theme) {
  const t = typeof theme === "string" ? findTheme(theme) : theme;
  if (!t) throw new Error(`unknown colouring theme "${theme}"`);
  return `${SHEET_STYLE} Draw: ${t.scene}.`;
}

/** Public url of a theme page in each language. */
function themeUrl(theme, lang) {
  return lang === "en" ? `/en/coloring/${theme.en}/` : `/colorear/${theme.slug}/`;
}

/** Generated files: one image and one PDF per theme, shared by both languages. */
function assetPaths(theme) {
  return {
    png: `/colorear/img/${theme.slug}.png`,
    thumb: `/colorear/img/${theme.slug}-thumb.webp`,
    pdf: `/colorear/pdf/${theme.slug}.pdf`,
  };
}

module.exports = { SHEET_STYLE, THEMES, findTheme, coloringPrompt, themeUrl, assetPaths };
