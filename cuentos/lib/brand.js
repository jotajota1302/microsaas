/*
 * The brand, in one place.
 *
 * "Familia de cuento" carries a double meaning Spanish gives for free — a
 * storybook family, and a family made into a story — and English keeps it
 * exactly: "storybook" means idyllic ("a storybook ending") as well as
 * literally a book of stories. "Fairytale family" would NOT do: fairies and
 * fantasy are what this product is not about.
 *
 * One brand, two languages, one domain: the English site lives under /en/ with
 * its own hreflang, so there is no second domain to buy or keep alive.
 */

const NAME = {
  es: "Familia de cuento",
  en: "Storybook Family",
};

const TAGLINE = {
  es: "el cuento de su vida",
  en: "the story of their life",
};

/** The word that carries the emphasis in the lockup: the rest is set lighter. */
const ACCENT_WORD = {
  es: "cuento",
  en: "Storybook",
};

const DOMAIN = "familiadecuento.com";

const lang = (locale) => (locale === "en" ? "en" : "es");

function name(locale) { return NAME[lang(locale)]; }
function tagline(locale) { return TAGLINE[lang(locale)]; }

/** "Familia de cuento — el cuento de su vida", for a title or an email sender. */
function full(locale) {
  return `${name(locale)} — ${tagline(locale)}`;
}

module.exports = { NAME, TAGLINE, ACCENT_WORD, DOMAIN, name, tagline, full };
