# Cuentos personalizados — Plan de implementación (fases 0 y 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que un desconocido pueda pagar 4,99 € en la web y recibir por email, en menos de 48 horas, un PDF de 32 páginas con un cuento ilustrado protagonizado por su hijo, generado por un pipeline validado.

**Architecture:** front estático vanilla + funciones serverless en Vercel. El pedido se guarda en Supabase antes de cobrar; el pago dispara un **job persistido** que avanza por pasos (texto → validación → hoja de personaje → 12 ilustraciones → line-art → PDF → revisión humana → email), con reintento por paso y un cron de barrido. La IA solo produce datos; `lib/validate-story.js` es la única puerta hacia el PDF.

**Tech Stack:** Node 22 (CommonJS), `node --test` como runner, sin framework de front. Dependencias de servidor: `pdf-lib`, `@pdf-lib/fontkit`, `sharp`, `@supabase/supabase-js`, `stripe`, `resend`. IA: OpenRouter (texto) y fal.ai/Seedream 4.5 (imagen) por `fetch`, sin SDK.

**Spec:** [`../specs/2026-08-20-cuentos-design.md`](../specs/2026-08-20-cuentos-design.md) · Alcance: [`../../mvp.md`](../../mvp.md) · Investigación: [`../../research-2026-08.md`](../../research-2026-08.md)

## Estado de ejecución (actualizado 2026-08-20)

`npm test` → **121 tests, 0 fallos**. Resultados de los spikes: [`../../fase-0-resultados.md`](../../fase-0-resultados.md).

| Tarea | Estado |
|---|---|
| 0.1 Andamiaje | ✅ hecho (`npm test` usa `"test/**/*.test.js"`: en Windows `--test test/` no funciona) |
| 0.2 Spike de imagen | ⚠️ script hecho y **baseline de MiniMax medido**; Seedream y Nano Banana pendientes de `FAL_KEY` / `GEMINI_API_KEY` |
| 0.3 Spike de POD | ⚠️ script hecho; imprime las instrucciones exactas y espera a `GELATO_API_KEY` |
| 0.4 Spike de texto | ⚠️ script hecho y **baseline de M3 medido**; los tres candidatos de OpenRouter pendientes de `OPENROUTER_API_KEY` |
| 1.1 Colección | ✅ hecho (+ `GENDERS`, que faltaba en el diseño) |
| 1.2 Schema y validador (estructura) | ✅ hecho |
| 1.3 Validador (contenido) | ✅ hecho |
| 1.4 Cliente de OpenRouter | ✅ hecho (también habla con MiniMax, para poder medir sin la clave de OpenRouter) |
| 1.5 Generación con reintentos | ✅ hecho |
| 1.6 Moderación | ✅ hecho |
| 1.7 Adaptador de imagen | ⏸ bloqueado: la forma real de la petición se anota en el spike 0.2 |
| 1.8 Hoja de personaje y páginas | ⏸ bloqueado por 1.7 |
| 1.9 Line-art | ⏸ bloqueado por 1.7 |
| 1.10 Render del PDF | ✅ hecho (fuente Andika OFL descargada; `scripts/render-fixture.js` produce un libro real) |
| 1.11 en adelante | ⏸ pendientes (ver la parte 2) |
| 1.12 Precios e IVA | ✅ hecho (adelantada: la necesitaban 1.13 y 1.14) |

## Global Constraints

- Código y comentarios **en inglés**; textos de producto en español e inglés.
- **Ningún dato personal en los prompts.** El cuento se genera con `{{NOMBRE}}` y `{{AMIGO}}`; la sustitución ocurre en `lib/pdf.js`. Sin fotos, nunca.
- **La IA genera datos, el código valida y decide.** Nada llega al PDF sin pasar por `validate-story.js`.
- Repo público (`github.com/jotajota1302/microsaas`): ningún secreto, ninguna ref de proyecto, ningún dato de cliente. Secretos en `cuentos/.env` (gitignored) y en las variables de entorno de Vercel.
- Sin dependencias en el front. En el servidor, solo las seis listadas arriba.
- Libro: **20×20 cm, 32 páginas**, colección «Acuarela». Precios: PDF 4,99 € · tapa dura 34,90 € + 4,90 € envío · créditos 4,99 €/20.
- Techo de coste por cuento: **1,50 €**. Un job que lo supere se detiene en `needs_review`.
- Proveedores de IA **siempre detrás de un adaptador** conmutable por variable de entorno (`IMAGE_PROVIDER`, `TEXT_MODEL`).
- Todo `console.log` de servidor va con prefijo `[cuentos]` para poder filtrarlo en los logs de Vercel.

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `lib/env.js` | Carga `.env` en local, valida que existen las variables obligatorias |
| `lib/collection.js` | Colección «Acuarela»: sufijo de estilo, temas, aficiones, mascotas, catálogo de respaldo |
| `schema/story.schema.json` | Contrato del JSON del cuento |
| `lib/validate-story.js` | Puerta única: schema + longitudes + estructura + marcadores + lista negra |
| `lib/llm.js` | Cliente de OpenRouter: structured outputs, reintentos, coste |
| `lib/prompt-story.js` | Construye los mensajes; reintenta alimentando los errores del validador |
| `lib/moderation.js` | Filtro de entrada y segunda pasada de salida |
| `lib/images.js` | Adaptador de imagen (fal/Seedream, Google, MiniMax) + verificación VLM |
| `lib/character.js` | Hoja de personaje en cuadrícula y recorte en referencias |
| `lib/lineart.js` | Ilustración → página de colorear (IA + limpieza con sharp) |
| `lib/pdf.js` | PDF de pantalla y PDF de imprenta |
| `lib/db.js` | Acceso a Supabase con service role |
| `lib/email.js` | Plantillas y envío con Resend |
| `lib/money.js` | Catálogo de productos, precios, IVA |
| `api/order.js` | Guarda el pedido y modera la entrada **antes** de cobrar |
| `api/checkout.js` | Crea la sesión de Stripe |
| `api/webhook-stripe.js` | Pago → `billing` + crea el job |
| `api/job.js` | Máquina de estados del pedido |
| `api/cron.js` | Barre jobs atascados y pedidos pagados sin job |
| `api/sample.js` | Muestra gratis con el nombre insertado, sin IA |
| `api/admin.js` + `admin/index.html` | Cola de revisión humana |
| `index.html`, `en/index.html`, `crear/`, `pedido/`, `colorear/` | Front |
| `scripts/spike-*.js` | Spikes de la fase 0 (desechables, quedan como documentación) |

---

# Fase 0 — Spikes

Su salida son **decisiones y números**, no código de producción. Todo lo que produzcan se anota en `docs/fase-0-resultados.md`.

### Task 0.1: Andamiaje del proyecto

**Files:**
- Create: `package.json`, `.env.example`, `vercel.json`, `lib/env.js`, `test/env.test.js`, `docs/fase-0-resultados.md`

**Interfaces:**
- Produces: `require("../lib/env.js")` → `{ env, requireEnv(names: string[]): void }` donde `env` es `process.env` ya poblado desde `.env`.

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "cuentos",
  "private": true,
  "version": "0.1.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test test/",
    "spike:images": "node scripts/spike-images.js",
    "spike:text": "node scripts/spike-text.js",
    "spike:pod": "node scripts/spike-pod.js"
  },
  "dependencies": {
    "@pdf-lib/fontkit": "^1.1.1",
    "@supabase/supabase-js": "^2.108.1",
    "pdf-lib": "^1.17.1",
    "resend": "^4.0.0",
    "sharp": "^0.33.5",
    "stripe": "^17.0.0"
  }
}
```

- [ ] **Step 2: Crear `.env.example`** (este sí se commitea; `.env` no)

```
OPENROUTER_API_KEY=
TEXT_MODEL=google/gemini-2.5-flash-lite
FAL_KEY=
IMAGE_PROVIDER=seedream
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
GELATO_API_KEY=
ADMIN_TOKEN=
PUBLIC_BASE_URL=http://localhost:3000
LIVE_IMAGES=1
```

- [ ] **Step 3: Escribir el test que falla**

```js
// test/env.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { requireEnv } = require("../lib/env.js");

test("requireEnv throws listing every missing variable", () => {
  delete process.env.__A; delete process.env.__B;
  assert.throws(() => requireEnv(["__A", "__B"]), /__A.*__B/s);
});

test("requireEnv passes when all are present", () => {
  process.env.__A = "x"; process.env.__B = "y";
  assert.doesNotThrow(() => requireEnv(["__A", "__B"]));
});
```

- [ ] **Step 4: Ejecutar y ver que falla**

Run: `npm test`
Expected: FAIL, `Cannot find module '../lib/env.js'`

- [ ] **Step 5: Implementar `lib/env.js`**

```js
/* Loads .env in local dev (Vercel injects env vars itself) and validates. */
const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, "..", ".env");
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i <= 0 || line.trim().startsWith("#")) continue;
    const key = line.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = line.slice(i + 1).trim();
  }
}

function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`[cuentos] missing env vars: ${missing.join(", ")}`);
}

module.exports = { env: process.env, requireEnv };
```

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `npm test` → Expected: PASS (2 tests)

- [ ] **Step 7: Crear `vercel.json`**

```json
{
  "functions": { "api/job.js": { "maxDuration": 300 } },
  "crons": [{ "path": "/api/cron", "schedule": "* * * * *" }]
}
```

- [ ] **Step 8: Commit**

```bash
git add cuentos/package.json cuentos/.env.example cuentos/vercel.json cuentos/lib/env.js cuentos/test/env.test.js
git commit -m "chore(cuentos): scaffold project with env loader and test runner"
```

### Task 0.2: Spike de consistencia de personaje

Mide lo que decide el proveedor de imagen: consistencia, rechazos del filtro y resolución real.

**Files:**
- Create: `scripts/spike-images.js`, `scripts/spike-contact-sheet.js`

**Interfaces:**
- Produces: `out/spike/<provider>/<character>/{sheet.png, p01..p12.png}` y `out/spike/index.html` para revisar a ojo. Números a `docs/fase-0-resultados.md`.

- [ ] **Step 1: Escribir `scripts/spike-images.js`**

Tres personajes (niña 5 años pelo rizado castaño y gafas; niño 7 años pelo liso negro; niña 4 años pelirroja con perro), tres proveedores (`seedream`, `nanobanana`, `flux`), doce escenas fijas (playa, bosque de noche, cocina, barco, cueva, biblioteca, montaña, mercado, nave espacial, jardín con lluvia, tren, dormitorio). Para cada combinación: genera la hoja de personaje en cuadrícula 2×2, recorta las cuatro vistas con sharp, y genera las doce escenas pasando esas cuatro referencias.

```js
const { env, requireEnv } = require("../lib/env.js");
const fs = require("fs"); const path = require("path");
requireEnv(["FAL_KEY"]);

const STYLE = "soft children's watercolour illustration, light ink linework, warm limited palette, visible paper texture, no text, no lettering, no watermark";
const CHARACTERS = [
  { id: "ana",  desc: "a 5-year-old girl with curly brown hair, light skin, round glasses, wearing a mustard yellow dress" },
  { id: "leo",  desc: "a 7-year-old boy with straight black hair, brown skin, wearing a green striped t-shirt and blue shorts" },
  { id: "sofi", desc: "a 4-year-old girl with red hair in two braids, freckles, wearing dungarees, with a small brown dog" },
];
const SCENES = [
  "walking on a sunny beach collecting shells", "in a dark forest at night holding a lantern",
  "baking bread in a warm kitchen", "on the deck of a small wooden sailboat",
  "inside a cave with glowing crystals", "in a huge library climbing a ladder",
  "on a mountain top above the clouds", "in a busy street market with fruit stalls",
  "inside a spaceship looking at the stars", "in a garden in the rain with an umbrella",
  "sitting by the window of a moving train", "falling asleep in a cosy bedroom",
];
const SHEET_PROMPT = (d) => `Character reference sheet, 2x2 grid on white background, four views of the same character: front view, side profile, full body standing, happy expression close-up. The character is ${d}. ${STYLE}`;
const SCENE_PROMPT = (d, s) => `${d}, ${s}. Keep the character exactly identical to the reference images: same face, same hair, same clothes. ${STYLE}`;

// ... genera, guarda en out/spike/<provider>/<char>/, cronometra y cuenta rechazos
```

- [ ] **Step 2: Ejecutar el spike con un solo personaje y un proveedor**

Run: `node scripts/spike-images.js --provider seedream --character ana`
Expected: 1 hoja + 12 escenas en `out/spike/seedream/ana/`. **Anotar la forma real de la respuesta de fal.ai** (nombres de parámetros y del array de salida) en `docs/fase-0-resultados.md`: es lo que consumirá `lib/images.js` en la Task 1.7.

- [ ] **Step 3: Ejecutar los nueve cruces**

Run: `node scripts/spike-images.js`
Expected: 117 imágenes. Registrar por proveedor: coste total, latencia media, número de rechazos del filtro de contenido y resolución real de los ficheros.

- [ ] **Step 4: Montar la hoja de contactos y decidir**

Run: `node scripts/spike-contact-sheet.js && start out/spike/index.html`
Criterio de decisión: se elige el proveedor con **≥ 80 % de páginas donde el personaje es reconociblemente el mismo** (juicio de JJ sobre las 12 páginas de cada personaje), **0 rechazos** del filtro y **≥ 1.900 px** de lado. Escribir la decisión y los números en `docs/fase-0-resultados.md`.

- [ ] **Step 5: Commit**

```bash
git add cuentos/scripts/spike-images.js cuentos/scripts/spike-contact-sheet.js cuentos/docs/fase-0-resultados.md
git commit -m "spike(cuentos): measure character consistency across image providers"
```

### Task 0.3: Spike de POD

**Files:**
- Create: `scripts/spike-pod.js`

- [ ] **Step 1: Crear cuentas gratuitas en Gelato y Peecho** y guardar las claves en `.env`.

- [ ] **Step 2: Escribir `scripts/spike-pod.js`** que llame a `GET /v3/products/.../cover-dimensions?pageCount=32` y al endpoint de cotización de Gelato para un libro 20×20 tapa dura de 32 páginas con destino a un código postal español, e imprima coste de producción, coste de envío y plazo.

- [ ] **Step 3: Ejecutar y anotar**

Run: `node scripts/spike-pod.js`
Expected: precio en euros y plazo. **Regla de decisión**: si producción + envío > 18 €, o el plazo supera 7 días, repetir con Peecho a 24 páginas; si ninguno cumple, subir el PVP a 39,90 € y anotarlo en `mvp.md`.

- [ ] **Step 4: Pedir una muestra impresa** del PDF de ejemplo del proveedor ganador, a la dirección de JJ. Anotar fecha de pedido para medir el plazo real.

- [ ] **Step 5: Commit**

```bash
git add cuentos/scripts/spike-pod.js cuentos/docs/fase-0-resultados.md
git commit -m "spike(cuentos): quote 20x20 hardcover from Gelato and Peecho"
```

### Task 0.4: Spike de modelo de texto y solicitud de Stripe

**Files:**
- Create: `scripts/spike-text.js`

- [ ] **Step 1: Solicitar la elegibilidad de Stripe Managed Payments** para la cuenta española, con el tax code «Digital Books». Abrir en paralelo una cuenta en Creem como plan B. Anotar fecha de solicitud.

- [ ] **Step 2: Escribir `scripts/spike-text.js`** que genere diez cuentos (cinco combinaciones de personalización × dos temas) con `google/gemini-2.5-flash-lite`, `deepseek/deepseek-v4-flash` y `openai/gpt-5-mini` vía OpenRouter, usando el schema de la Task 1.2, y cuente cuántos pasan el validador a la primera.

- [ ] **Step 3: Ejecutar y decidir**

Run: `node scripts/spike-text.js`
Expected: tabla de aciertos, coste y latencia. **Criterio**: gana el modelo con ≥ 8/10 a la primera; a igualdad, el más barato. Leer dos cuentos de cada modelo en voz alta para juzgar el español. Escribir la decisión en `docs/fase-0-resultados.md` y fijar `TEXT_MODEL` en `.env`.

- [ ] **Step 4: Commit**

```bash
git add cuentos/scripts/spike-text.js cuentos/docs/fase-0-resultados.md
git commit -m "spike(cuentos): pick the text model by validator pass rate"
```

---

# Fase 1 — El mínimo que cobra

Las tareas 1.1 a 1.10 no tocan red salvo donde se dice, y todas se prueban con `node --test`.

### Task 1.1: Colección «Acuarela»

**Files:**
- Create: `lib/collection.js`, `test/collection.test.js`

**Interfaces:**
- Produces: `{ STYLE: string, THEMES: {id, es, en, seed_idea}[], PETS, HOBBIES, HAIR, PAGE_COUNT: 12, WORDS_MIN: 60, WORDS_MAX: 90, BEATS: string[], BLOCKLIST: string[], fallbackImage(themeId, index): string }`.

- [ ] **Step 1: Escribir el test que falla**

```js
const { test } = require("node:test");
const assert = require("node:assert");
const C = require("../lib/collection.js");

test("style suffix is frozen and mentions watercolour and no-text", () => {
  assert.match(C.STYLE, /watercolour/i);
  assert.match(C.STYLE, /no text/i);
  assert.throws(() => { C.STYLE = "other"; }, TypeError);
});

test("six themes, each with a spanish and english label", () => {
  assert.strictEqual(C.THEMES.length, 6);
  for (const t of C.THEMES) { assert.ok(t.id && t.es && t.en && t.seed_idea); }
});

test("narrative beats are the five the validator checks", () => {
  assert.deepStrictEqual(C.BEATS, ["setup", "problem", "attempt", "attempt", "resolution"]);
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — Run: `npm test` → FAIL, módulo no encontrado.

- [ ] **Step 3: Implementar `lib/collection.js`** con `Object.freeze` en el módulo y en `STYLE`, los seis temas (mar, bosque, espacio, dinosaurios, princesas y caballeros, fútbol), las listas cerradas de mascota/afición/pelo, y una lista negra inicial de ~40 términos (violencia, muerte, armas, miedo intenso, marcas registradas, religión, política).

- [ ] **Step 4: Ejecutar y ver que pasa** — Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cuentos/lib/collection.js cuentos/test/collection.test.js
git commit -m "feat(cuentos): add frozen Acuarela collection definition"
```

### Task 1.2: Schema del cuento y validador — estructura

**Files:**
- Create: `schema/story.schema.json`, `lib/validate-story.js`, `test/validate-story.test.js`, `test/fixtures/story-valid.json`

**Interfaces:**
- Consumes: `lib/collection.js`.
- Produces: `validateStory(story): { ok: boolean, errors: string[] }`.

- [ ] **Step 1: Escribir `schema/story.schema.json`**

Campos: `title` (string), `dedication_hint` (string), `pages` (array de exactamente 12 objetos con `n`, `beat`, `text`, `image_hint`), `character_sheet` (objeto con `appearance`, `outfit`), `coloring_hints` (array de 4 strings), `moral` (string). `additionalProperties: false` en todos los niveles.

- [ ] **Step 2: Crear `test/fixtures/story-valid.json`** — un cuento completo escrito a mano que cumple todas las reglas. Es la referencia contra la que se prueba todo lo demás.

- [ ] **Step 3: Escribir los tests que fallan**

```js
const { test } = require("node:test");
const assert = require("node:assert");
const { validateStory } = require("../lib/validate-story.js");
const valid = require("./fixtures/story-valid.json");
const clone = (o) => JSON.parse(JSON.stringify(o));

test("the reference story passes", () => {
  const r = validateStory(valid);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.ok, true);
});

test("rejects a story without exactly 12 pages", () => {
  const s = clone(valid); s.pages.pop();
  assert.match(validateStory(s).errors.join(" "), /12 pages/);
});

test("rejects a page under 60 or over 90 words", () => {
  const s = clone(valid); s.pages[3].text = "Corto.";
  assert.match(validateStory(s).errors.join(" "), /page 4/);
});

test("rejects a story missing the resolution beat", () => {
  const s = clone(valid); s.pages[11].beat = "attempt";
  assert.match(validateStory(s).errors.join(" "), /resolution/);
});

test("reports every problem at once, not just the first", () => {
  const s = clone(valid); s.pages.pop(); s.pages[0].text = "Corto.";
  assert.ok(validateStory(s).errors.length >= 2);
});
```

- [ ] **Step 4: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 5: Implementar `lib/validate-story.js`** con la validación de schema hecha a mano (sin dependencias: comprobación recursiva de tipos y de `additionalProperties`), el recuento de palabras y la comprobación de que la secuencia de `beat` contiene setup en la página 1, resolution en la 12 y al menos dos attempt en medio. Acumula **todos** los errores antes de devolver.

- [ ] **Step 6: Ejecutar y ver que pasan** — Run: `npm test` → PASS (5 tests nuevos).

- [ ] **Step 7: Commit**

```bash
git add cuentos/schema/story.schema.json cuentos/lib/validate-story.js cuentos/test/validate-story.test.js cuentos/test/fixtures/story-valid.json
git commit -m "feat(cuentos): validate story schema, page length and narrative beats"
```

### Task 1.3: Validador — marcadores, contenido y prohibiciones

**Files:**
- Modify: `lib/validate-story.js`, `test/validate-story.test.js`

**Interfaces:**
- Produces: la misma firma; añade las reglas de contenido.

- [ ] **Step 1: Escribir los tests que fallan**

```js
test("rejects a story where {{NOMBRE}} appears on fewer than 6 pages", () => {
  const s = clone(valid);
  for (let i = 0; i < 8; i++) s.pages[i].text = s.pages[i].text.replace(/\{\{NOMBRE\}\}/g, "la niña");
  assert.match(validateStory(s).errors.join(" "), /NOMBRE/);
});

test("rejects an invented proper name", () => {
  const s = clone(valid); s.pages[2].text += " Entonces apareció Marcos con su caña.";
  assert.match(validateStory(s).errors.join(" "), /proper name.*Marcos/i);
});

test("rejects blocklisted content", () => {
  const s = clone(valid); s.pages[5].text = s.pages[5].text.replace("olas", "pistola");
  assert.match(validateStory(s).errors.join(" "), /blocklist/i);
});

test("rejects an image_hint that asks for text in the picture", () => {
  const s = clone(valid); s.pages[1].image_hint = "a sign that reads Welcome";
  assert.match(validateStory(s).errors.join(" "), /text in image/i);
});

test("rejects a preachy moral", () => {
  const s = clone(valid); s.pages[11].text = "La moraleja es que debemos obedecer siempre a los mayores sin rechistar nunca jamás en la vida porque ellos saben mucho más que nosotros y así todo sale bien y nadie se enfada ni se pone triste en casa.";
  assert.match(validateStory(s).errors.join(" "), /preachy/i);
});
```

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar las reglas.** Nombres propios: palabra capitalizada que no está al principio de frase, no es un marcador y no está en la lista blanca de la colección. Texto en imagen: `image_hint` que contenga `sign|text|reads|letters|word|poster`. Moraleja predicadora: frases que empiecen por «la moraleja», «aprendió que debía», «nunca debemos», «siempre hay que».

- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cuentos/lib/validate-story.js cuentos/test/validate-story.test.js
git commit -m "feat(cuentos): validate placeholders, invented names and content rules"
```

### Task 1.4: Cliente de OpenRouter

**Files:**
- Create: `lib/llm.js`, `test/llm.test.js`

**Interfaces:**
- Produces: `completeJson({ messages, schema, model?, maxTokens? }): Promise<{ data: object, costUsd: number }>` y `completeText({ messages, model? })`. Lanza `LlmError` con `status` y `body` si la respuesta no es JSON válido tras la reparación.

- [ ] **Step 1: Escribir los tests que fallan** — con `fetch` sustituido por un doble que devuelve, en llamadas sucesivas: (a) una respuesta correcta, (b) una respuesta con el JSON envuelto en ```` ```json ````, (c) un 429 seguido de éxito, (d) tres fallos seguidos.

```js
test("parses a well-formed structured response", async () => { /* ... */ });
test("strips markdown fences and <think> blocks before parsing", async () => { /* ... */ });
test("retries once on HTTP 429 and succeeds", async () => { /* ... */ });
test("throws LlmError after three failures", async () => { /* ... */ });
test("reports cost from the usage block", async () => { /* ... */ });
```

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar `lib/llm.js`**: `POST https://openrouter.ai/api/v1/chat/completions` con `response_format: { type: "json_schema", json_schema: { name: "story", strict: true, schema } }`, cabeceras `Authorization` y `X-Title: cuentos`, timeout de 90 s con `AbortController`, tres intentos con espera de 1 s y 4 s, y limpieza previa de vallas markdown y bloques `<think>` (portada desde `rpg-narrativo/api/generate.js`).

- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cuentos/lib/llm.js cuentos/test/llm.test.js
git commit -m "feat(cuentos): add OpenRouter client with structured outputs and retries"
```

### Task 1.5: Generación del cuento con reintento guiado por el validador

**Files:**
- Create: `lib/prompt-story.js`, `test/prompt-story.test.js`

**Interfaces:**
- Consumes: `collection.js`, `llm.js`, `validate-story.js`.
- Produces: `buildMessages(input, previousErrors?): object[]` y `generateStory(input): Promise<{ story, attempts, costUsd }>`, donde `input` es la personalización **anonimizada**: `{ ageBand, hair, skin, glasses, pet, hobby, theme, hasCompanion, locale }`.

- [ ] **Step 1: Escribir los tests que fallan**

```js
test("the prompt never contains a real name", () => {
  const m = buildMessages({ ageBand: "6-8", hair: "rizado castaño", pet: "perro", hobby: "fútbol", theme: "mar", hasCompanion: true, locale: "es" });
  const all = JSON.stringify(m);
  assert.ok(all.includes("{{NOMBRE}}"));
  assert.ok(all.includes("{{AMIGO}}"));
});

test("a retry includes the validator errors verbatim", () => {
  const m = buildMessages({ /* ... */ }, ["page 4: 41 words, must be 60-90"]);
  assert.match(JSON.stringify(m), /41 words/);
});

test("generateStory retries until the story validates", async () => { /* llm doble: 1º inválido, 2º válido */ });
test("generateStory gives up after three attempts and reports the errors", async () => { /* ... */ });
```

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar `lib/prompt-story.js`.** El prompt de sistema fija: español de España neutro con todas las tildes, 12 páginas de 60-90 palabras, la secuencia de beats, el uso obligatorio de `{{NOMBRE}}` en al menos 6 páginas y de `{{AMIGO}}` si hay acompañante, la prohibición de inventar nombres propios, `image_hint` en inglés de máximo 30 palabras sin texto ni carteles, `character_sheet` coherente con los rasgos dados, y 4 `coloring_hints` que reutilicen escenas del cuento.

- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 5: Comprobar contra la API real una vez**

Run: `node -e "require('./lib/prompt-story.js').generateStory({ageBand:'3-5',hair:'liso negro',skin:'morena',glasses:false,pet:'gato',hobby:'dibujar',theme:'bosque',hasCompanion:false,locale:'es'}).then(r=>console.log(r.attempts, r.costUsd, r.story.title))"`
Expected: 1-2 intentos y un título en español. Si son 3, revisar el prompt antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add cuentos/lib/prompt-story.js cuentos/test/prompt-story.test.js
git commit -m "feat(cuentos): generate stories with validator-guided retries"
```

### Task 1.6: Moderación

**Files:**
- Create: `lib/moderation.js`, `test/moderation.test.js`

**Interfaces:**
- Produces: `checkInput({ name, companionName, dedication }): Promise<{ ok, reason? }>` y `reviewStory(story): Promise<{ ok, issues: string[] }>`.

- [ ] **Step 1: Escribir los tests que fallan** — entradas limpias pasan; un insulto, una URL, un email y un nombre de 60 caracteres se bloquean **sin llamar al modelo**; una dedicatoria ambigua sí llega al modelo; `reviewStory` devuelve `ok:false` cuando el modelo señala un problema.

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar.** Primero reglas locales (longitud máxima de 30 caracteres en nombres y 140 en dedicatoria, sin URLs ni emails, sin dígitos en el nombre, lista negra); solo si pasan, una llamada a `completeJson` con schema `{safe: boolean, reason: string}`. `reviewStory` hace la segunda pasada sobre el texto ya generado. **Fail-closed**: si el modelo no responde, `checkInput` devuelve `ok:true` (no bloquear una venta por infraestructura) pero marca el pedido para revisión; `reviewStory` devuelve `ok:false` (mejor revisar que imprimir).

- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cuentos/lib/moderation.js cuentos/test/moderation.test.js
git commit -m "feat(cuentos): moderate personalisation input and generated text"
```

### Task 1.7: Adaptador de imagen

**Files:**
- Create: `lib/images.js`, `test/images.test.js`

**Interfaces:**
- Produces: `generateImage({ prompt, refs: Buffer[], size }): Promise<{ buffer: Buffer, costUsd: number, provider: string }>` y `verifySameCharacter(sheetBuffer, pageBuffer): Promise<{ same: boolean, issues: string[] }>`.

- [ ] **Step 1: Escribir los tests que fallan** — el adaptador elige el proveedor por `IMAGE_PROVIDER`; reintenta una vez ante un 5xx; lanza `ImageBlockedError` (distinguible) cuando el proveedor responde con rechazo de contenido; añade siempre `collection.STYLE` al final del prompt; nunca pide menos de 1.900 px.

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar** con la forma de la petición **anotada en el spike 0.2**. Tres implementaciones (`seedream` vía `fal.run`, `nanobanana` vía la API de Gemini, `minimax` vía `image_generation`) detrás de la misma firma. `verifySameCharacter` sube ambas imágenes a un VLM barato con schema `{same: boolean, issues: string[]}`.

- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cuentos/lib/images.js cuentos/test/images.test.js
git commit -m "feat(cuentos): add switchable image provider adapter with VLM check"
```

### Task 1.8: Hoja de personaje y páginas

**Files:**
- Create: `lib/character.js`, `test/character.test.js`

**Interfaces:**
- Produces: `buildSheet(characterSheet): Promise<{ sheet: Buffer, refs: Buffer[], costUsd }>` (4 recortes de la cuadrícula 2×2) y `renderPages(story, refs): Promise<{ pages: {buffer, fallback: boolean}[], costUsd }>` (12 en paralelo con concurrencia 4).

- [ ] **Step 1: Escribir los tests que fallan** — la cuadrícula se recorta en cuatro cuartos exactos con sharp; `renderPages` mantiene el orden aunque terminen desordenadas; una página rechazada por el VLM se regenera una vez; una página que falla dos veces devuelve `fallback:true` con la ilustración del catálogo; si hay tres o más `fallback`, lanza `TooManyFallbacksError`.

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar** con `sharp().extract()` para los recortes y un semáforo simple de concurrencia 4 para las páginas.

- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cuentos/lib/character.js cuentos/test/character.test.js
git commit -m "feat(cuentos): build character sheet and render pages with fallbacks"
```

### Task 1.9: Páginas para colorear

**Files:**
- Create: `lib/lineart.js`, `test/lineart.test.js`

**Interfaces:**
- Produces: `toLineArt(pageBuffer, hint): Promise<{ buffer: Buffer, costUsd }>` — PNG A4 en blanco y negro puro.

- [ ] **Step 1: Escribir los tests que fallan** — la salida no tiene grises (histograma solo en 0 y 255); es A4 a 300 dpi (2.480×3.508); un fallo del modelo propaga el error en vez de devolver una imagen a color.

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar**: edición por IA con el prompt de line-art, luego `sharp().greyscale().normalise().median(3).threshold(200)` y encaje en A4 con márgenes de 10 mm.

- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cuentos/lib/lineart.js cuentos/test/lineart.test.js
git commit -m "feat(cuentos): turn illustrations into pure black and white colouring pages"
```

### Task 1.10: Render del PDF

**Files:**
- Create: `lib/pdf.js`, `test/pdf.test.js`, `assets/fonts/Andika-Regular.ttf`, `assets/fonts/Andika-Bold.ttf`

**Interfaces:**
- Produces: `renderPdf({ story, images, coloring, personalization, mode }): Promise<Buffer>` con `mode` en `screen | print | preview`.

- [ ] **Step 1: Descargar Andika** (licencia OFL) a `assets/fonts/` y anotar la licencia en `assets/fonts/LICENSE`.

- [ ] **Step 2: Escribir los tests que fallan**

```js
test("produces exactly 32 pages", async () => { /* ... */ });
test("screen mode is 20x20 cm with no bleed", async () => { /* 566.9 pt */ });
test("print mode adds 3 mm bleed on every side", async () => { /* 583.9 pt */ });
test("replaces every placeholder with the real name", async () => { /* extrae texto y busca {{ */ });
test("preview mode stamps a watermark on every page", async () => { /* ... */ });
test("throws if any placeholder is left unreplaced", async () => { /* ... */ });
```

- [ ] **Step 3: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 4: Implementar `lib/pdf.js`** con pdf-lib + fontkit: portadilla con dedicatoria, 12 dobles (ilustración a sangre en la par, texto centrado con interlineado 1,6 en la impar), 4 de colorear, ficha del personaje, colofón con QR y el aviso de IA. La sustitución de marcadores ocurre aquí y **solo** aquí, y termina con una comprobación de que no queda ningún `{{`.

- [ ] **Step 5: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 6: Generar un PDF real y mirarlo**

Run: `node scripts/render-fixture.js && start out/fixture.pdf`
Expected: 32 páginas legibles, sin marcadores, con el texto dentro de los márgenes.

- [ ] **Step 7: Commit**

```bash
git add cuentos/lib/pdf.js cuentos/test/pdf.test.js cuentos/assets/fonts/
git commit -m "feat(cuentos): render 32-page screen and print PDFs"
```

---

Las tareas 1.11 a 1.20 (base de datos, cobro, máquina de estados, email, admin, front, galería y despliegue) continúan en la segunda parte de este plan: [`2026-08-20-cuentos-fase-1-parte-2.md`](2026-08-20-cuentos-fase-1-parte-2.md).

---

## Revisión 2026-08-21 — giro a solo PDF

Ver la sección homónima del spec. Efectos sobre este plan:

- **Task 0.3 (POD)**: sale del camino crítico. El script queda; no se ejecuta hasta que el botón de interés lo justifique.
- **Task 1.7 / 1.8**: sin requisito de 2K. `generateImage` pide 1024.
- **Task 1.10 (PDF)**: ya hecha con 32 páginas y modo `print`; se **rehace** como Task 1.10b: 18 páginas, una escena por página (ilustración en el 58 % superior), sin `print`, test de que cada página de escena contiene su número y su texto, y de que el total es 18.
- **Nuevas tareas antes de 1.11**:
  - **Task 1.1b — Colección**: añadir `RELATIONS`, `MOMENTS`, `TONES`; tests de que cada lista tiene etiquetas ES/EN y de que `MOMENTS` tiene exactamente 7 entradas con `conflict_hint`.
  - **Task 1.3b — Validador**: marcadores `{{PERSONA1}}`/`{{PERSONA2}}`; `validateStory(story, { people: 2 })` exige cada persona declarada en ≥ 2 páginas y rechaza una persona no declarada; `{{AMIGO}}` deja de existir.
  - **Task 1.5b — Prompt**: brief con personas (relación + edad), momento (`conflict_hint` en el beat `problem`) y tono; tests de que el prompt nunca contiene el nombre de una persona, de que una persona declarada aparece descrita por su relación, y de que el momento elegido aparece en el brief.
- **Task 1.11 (schema SQL)**: sin `print_orders`; con `print_interest` y `waitlist`.
- **Task 1.12 (precios)**: `pdf` a **1290** céntimos (ES) y `pdf_en` a 1490; `hardcover` y `softcover` se eliminan del catálogo. **Hecho el 21-08.**
- **Task 1.13 (pedido)**: el pedido se crea **con email y sin cobro**; lanza el job en modo `preview`. Tope `MAX_PREVIEWS_PER_DAY` (respuesta `sold_out` + alta en `waitlist`) y límite por IP; tests de que la vista previa 51 del día se rechaza y de que un mismo email no genera dos.
- **Nueva Task 1.13b — Visor `/c/<token>`**: `api/story.js` devuelve el cuento por token (404 si no existe o ha caducado), y `c/index.html` lo pinta: 12 páginas de texto, ilustraciones presentes o marco de «se ilustra al completar», marca de agua en preview, botón «Completar el cuento» que llama a `checkout` con el `order_id`, y en `full` los botones «Descargar PDF» y «Quiero el libro impreso». Tests: un token caducado responde 410; el JSON de preview no incluye la URL del PDF; el de full sí.
- **Nueva Task 1.13c — Emails de vista previa**: enlace por email al crear; recordatorios a los días 5 y 7 desde `api/cron.js`; test de que un cuento ya pagado no recibe recordatorio de caducidad.
- **Task 1.16 (job)**: dos puntos de entrada, `preview` y `full`, sobre la misma máquina de estados; `full` reutiliza hoja y páginas ya generadas; el techo de coste suma ambos tramos. Test: ejecutar `full` tras `preview` no regenera las páginas 1, 5 y 12.
- **Task 1.17 (cron)**: añadir la purga diaria de cuentos caducados (ficheros del Storage + datos personales a `null`). Test: un cuento caducado y pagado conserva `order_id`, `price_cents` y `billing`, pero no `personalization`.
- **Task 1.14 (checkout)**: solo Stripe MP; se elimina la rama física.
- **Task 1.20 (front)**: formulario con personas, momento y tono, **email obligatorio y Turnstile**; la página de «pedido» desaparece (la sustituye el visor `/c/<token>`); el botón «Quiero el libro impreso» vive en el visor en estado `full`.
- **Parte 2, Task 1.22**: la verificación de extremo a extremo recorre el flujo completo: formulario → email con enlace → visor en preview con 3 ilustraciones → pago de 12,90 € → visor en full → descarga del PDF → cuento caducado a los 30 días (simulado adelantando `expires_at`).
- **Fase 2 (impreso)**: fuera del plan. Se planifica aparte si procede.


## Revisión 2026-08-21 (tarde) — embudo en dos puertas y proveedor de imagen

- **Proveedor de imagen decidido**: Nano Banana 2 vía OpenRouter (`google/gemini-3.1-flash-image`, `modalities: ["image","text"]`, `image_config: { aspect_ratio: "1:1" }`, referencia como `image_url` en el mensaje; la imagen vuelve como data URI en `message.images[0].image_url.url`). La forma exacta de la petición está en `scripts/spike-images.js` (`viaOpenRouter`). **Task 1.7** implementa `openrouter` como proveedor por defecto y deja `minimax` como respaldo; `seedream` y `nanobanana` (Gemini directo) se eliminan.
- **Task 1.8**: la hoja de personaje **no se recorta**: va entera como única referencia (medido: funciona y evita el problema de la maqueta).
- **Task 1.13 (pedido)**: crea el pedido y lanza el job en modo `script`. Topes `MAX_SCRIPTS_PER_DAY` (200) y 3 por IP/día; un email = un guion.
- **Nueva Task 1.13d — Cambios al guion**: `POST /api/story/:token/revise { instruction }` (máx. 200 caracteres, pasa por `moderation.checkInput`), regenera con la instrucción acumulada en el prompt, valida, guarda la versión; a partir de la tercera responde 409 con el mensaje de «completa el cuento». Tests: dos cambios pasan, el tercero no; la instrucción aparece en el prompt; una instrucción con URL se rechaza.
- **Nueva Task 1.13e — Aprobar guion → muestra**: `POST /api/story/:token/approve` cambia `stage` a `sample` y lanza el tramo `sample` (hoja + páginas 1 y una del medio, **nunca la 12**). Tope `MAX_SAMPLES_PER_DAY` (40). Test: la página 12 nunca se ilustra en `sample`.
- **Task 1.13b (visor)**: tres estados: `script` (solo texto + botones «Cambiar algo» / «Me gusta»), `sample` (2 ilustradas + marcos + «Completar el cuento»), `full` (todo + «Descargar PDF» + «Pedir un retoque» + «Quiero el libro impreso»).
- **Nueva Task 1.16b — Retoque**: `POST /api/story/:token/retouch { pages: [n…] | text_page: n }` una sola vez por pedido pagado; regenera hasta 3 ilustraciones (o reescribe 1 página de texto y la valida) y devuelve el job a `approval`. Test: el segundo retoque responde 409.
- **Task 1.16 (job)**: entradas `script`, `sample`, `full`, `retouch`; el techo de coste suma todos los tramos del mismo cuento.
- **Task 1.22 (E2E)**: formulario → email → guion → un cambio → aprobar → muestra con 2 ilustraciones → pago 12,90 € → full → retoque de 1 página → descarga.
