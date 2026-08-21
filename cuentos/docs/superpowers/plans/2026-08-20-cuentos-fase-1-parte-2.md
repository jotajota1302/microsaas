# Cuentos personalizados — Plan de implementación (fase 1, parte 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cerrar el circuito comercial: guardar el pedido, cobrarlo, generarlo por pasos con reintento, revisarlo, entregarlo por email y publicarlo en Vercel.

**Architecture:** continuación directa de [`2026-08-20-cuentos-fase-0-1.md`](2026-08-20-cuentos-fase-0-1.md), que deja listas las librerías de generación (`collection`, `validate-story`, `llm`, `prompt-story`, `moderation`, `images`, `character`, `lineart`, `pdf`). Aquí se añaden la persistencia, el cobro, la orquestación y el front.

**Tech Stack:** el mismo. **Spec:** [`../specs/2026-08-20-cuentos-design.md`](../specs/2026-08-20-cuentos-design.md)

## Global Constraints

Los mismos del plan anterior, y además:

- El **nombre del niño nunca sale de Supabase**: no viaja a Stripe (que solo recibe `order_id`), ni a la IA, ni a los logs.
- Todo endpoint que escribe comprueba idempotencia: reintentar la misma petición no cobra dos veces ni duplica un job.
- El cliente **ya ha pagado**: ante cualquier duda, `needs_review` y un email honesto, nunca un producto malo entregado en silencio.
- Reembolso automático si el job muere sin entregable en 24 h.

---

### Task 1.11: Esquema de datos y acceso

**Files:**
- Create: `supabase/migrations/0001_cuentos_schema.sql`, `lib/db.js`, `test/db.test.js`

**Interfaces:**
- Produces: `createOrder(input)`, `getOrder(id)`, `updateOrder(id, patch)`, `createJob(orderId)`, `claimStaleJobs(limit)`, `saveStep(jobId, step, payload)`, `recordBilling(row)`, `paidOrdersWithoutJob()`.

- [ ] **Step 1: Escribir la migración**

```sql
create schema if not exists cuentos;

create table cuentos.orders (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  product text not null check (product in ('pdf','hardcover','softcover','credits')),
  personalization jsonb not null,
  locale text not null default 'es',
  price_cents int not null,
  vat_rate numeric not null,
  status text not null default 'draft'
    check (status in ('draft','paid','generating','needs_review','delivered','refunded','failed')),
  created_at timestamptz not null default now()
);

create table cuentos.jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references cuentos.orders(id) on delete cascade,
  state text not null default 'pending',
  steps jsonb not null default '{}'::jsonb,
  attempts int not null default 0,
  cost_cents int not null default 0,
  error text,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
create index jobs_state_idx on cuentos.jobs (state, locked_until);

create table cuentos.stories (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references cuentos.orders(id) on delete cascade,
  story jsonb not null,
  character_sheet_path text,
  page_paths jsonb,
  pdf_screen_path text,
  pdf_print_path text
);

create table cuentos.billing (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references cuentos.orders(id),
  provider text not null,
  provider_id text not null unique,
  amount_cents int not null,
  currency text not null,
  vat_rate numeric,
  status text not null,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table cuentos.print_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references cuentos.orders(id),
  provider text not null,
  provider_order_id text,
  status text not null default 'pending',
  tracking_url text,
  cost_cents int,
  created_at timestamptz not null default now()
);

create table cuentos.credits (
  email text primary key,
  balance int not null default 0,
  updated_at timestamptz not null default now()
);

create table cuentos.coloring_pages (
  slug text primary key,
  theme text not null,
  locale text not null,
  title text not null,
  image_path text not null,
  created_at timestamptz not null default now()
);

create table cuentos.blocked_inputs (
  id uuid primary key default gen_random_uuid(),
  reason text not null,
  input_hash text not null,
  created_at timestamptz not null default now()
);

alter table cuentos.orders enable row level security;
alter table cuentos.jobs enable row level security;
alter table cuentos.stories enable row level security;
alter table cuentos.billing enable row level security;
alter table cuentos.print_orders enable row level security;
alter table cuentos.credits enable row level security;
alter table cuentos.coloring_pages enable row level security;
alter table cuentos.blocked_inputs enable row level security;

-- Only the gallery is world-readable. Everything else is service-role only.
grant usage on schema cuentos to anon, authenticated;
grant select on cuentos.coloring_pages to anon, authenticated;
create policy coloring_public_read on cuentos.coloring_pages for select to anon, authenticated using (true);
```

- [ ] **Step 2: Aplicar la migración** en el proyecto Supabase compartido y comprobar que los advisors no señalan nada nuevo. **No tocar los esquemas de las otras apps.**

- [ ] **Step 3: Escribir los tests que fallan** — con un doble del cliente de Supabase: `createOrder` rechaza un producto desconocido; `claimStaleJobs` solo devuelve jobs cuyo `locked_until` ha pasado y renueva el bloqueo; `saveStep` fusiona en `steps` sin pisar los pasos anteriores; `recordBilling` es idempotente por `provider_id`.

- [ ] **Step 4: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 5: Implementar `lib/db.js`** con `createClient(url, serviceRoleKey, { db: { schema: "cuentos" } })` y una única instancia reutilizada entre invocaciones.

- [ ] **Step 6: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add cuentos/supabase/migrations/0001_cuentos_schema.sql cuentos/lib/db.js cuentos/test/db.test.js
git commit -m "feat(cuentos): add cuentos schema with RLS and typed data access"
```

### Task 1.12: Productos, precios e IVA

**Files:**
- Create: `lib/money.js`, `test/money.test.js`

**Interfaces:**
- Produces: `PRODUCTS: { [id]: { priceCents, vatRate, shippingCents, kind: 'digital'|'physical', taxCode } }` y `totalCents(productId)`.

- [ ] **Step 1: Escribir los tests que fallan** — el PDF cuesta 499 con IVA 0,04 y es digital; el tapa dura cuesta 3.490 + 490 de envío y es físico; los créditos llevan IVA 0,21; un id desconocido lanza error.

- [ ] **Step 2: Ejecutar y ver que falla** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar `lib/money.js`** con el objeto congelado.

- [ ] **Step 4: Ejecutar y ver que pasa** — Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cuentos/lib/money.js cuentos/test/money.test.js
git commit -m "feat(cuentos): centralise products, prices and VAT rates"
```

### Task 1.13: Alta del pedido con moderación previa

**Files:**
- Create: `api/order.js`, `test/api-order.test.js`

**Interfaces:**
- Consumes: `db.js`, `moderation.js`, `money.js`, `collection.js`.
- Produces: `POST /api/order` → `{ orderId }` (201) o `{ error: "blocked", reason }` (422).

- [ ] **Step 1: Escribir los tests que fallan** — un cuerpo válido crea el pedido en estado `draft` y devuelve el id; un campo cerrado con valor fuera de la lista se rechaza con 400; una entrada bloqueada por moderación devuelve 422, **no crea pedido** y registra en `blocked_inputs` solo un hash; el email se normaliza a minúsculas.

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar `api/order.js`.** Valida contra las listas cerradas de `collection.js`, llama a `checkInput`, guarda y devuelve. Moderar **antes** de cobrar es deliberado: no queremos reembolsar entradas que nunca debieron pasar.

- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cuentos/api/order.js cuentos/test/api-order.test.js
git commit -m "feat(cuentos): create orders behind input moderation"
```

### Task 1.14: Checkout de Stripe

**Files:**
- Create: `api/checkout.js`, `test/api-checkout.test.js`

**Interfaces:**
- Produces: `POST /api/checkout { orderId }` → `{ url }`.

- [ ] **Step 1: Escribir los tests que fallan** — un producto digital crea la sesión con el tax code de libros digitales; un producto físico añade `shipping_address_collection` restringido a los países servidos y la línea de envío; **la sesión solo lleva `order_id` en `metadata`, nunca el nombre del niño ni la dedicatoria**; un `orderId` ya pagado devuelve 409.

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar `api/checkout.js`** con `stripe.checkout.sessions.create`, `success_url` a `/pedido/{orderId}` y `cancel_url` a `/crear/`. Managed Payments es un ajuste de cuenta, no un parámetro: **verificar en el panel** que la cuenta está en modo MoR antes de dar la tarea por buena.

- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 5: Probar con una tarjeta de test** — Run: `stripe listen --forward-to localhost:3000/api/webhook-stripe` en una terminal y completar un pago con `4242 4242 4242 4242`. Expected: sesión completada.

- [ ] **Step 6: Commit**

```bash
git add cuentos/api/checkout.js cuentos/test/api-checkout.test.js
git commit -m "feat(cuentos): create Stripe checkout sessions without personal data"
```

### Task 1.15: Webhook de pago

**Files:**
- Create: `api/webhook-stripe.js`, `test/api-webhook.test.js`

**Interfaces:**
- Produces: `POST /api/webhook-stripe` → 200 siempre que la firma sea válida.

- [ ] **Step 1: Escribir los tests que fallan** — una firma inválida devuelve 400 y no escribe nada; `checkout.session.completed` marca el pedido como `paid`, escribe en `billing` y crea el job; **recibir el mismo evento dos veces no crea dos jobs**; un evento de un pedido inexistente se registra y devuelve 200 (para que Stripe no reintente eternamente).

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar** con `stripe.webhooks.constructEvent` sobre el cuerpo **crudo** (`export const config = { api: { bodyParser: false } }` o su equivalente en la runtime de Vercel), y disparar `/api/job` sin esperar la respuesta.

- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cuentos/api/webhook-stripe.js cuentos/test/api-webhook.test.js
git commit -m "feat(cuentos): handle Stripe webhooks idempotently"
```

### Task 1.16: Máquina de estados del job

**Files:**
- Create: `api/job.js`, `lib/steps.js`, `test/steps.test.js`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `runJob(jobId): Promise<{ state }>` y `STEPS: { name, run(ctx): Promise<patch> }[]` con los pasos `text`, `review`, `character`, `pages`, `lineart`, `pdf`, `approval`, `deliver`.

- [ ] **Step 1: Escribir los tests que fallan**

```js
test("runs steps in order and stores each result", async () => { /* ... */ });
test("a completed step is not run again on resume", async () => { /* ... */ });
test("a failing step increments attempts and leaves the job resumable", async () => { /* ... */ });
test("three failures on the same step move the job to needs_review", async () => { /* ... */ });
test("a job whose cost exceeds 150 cents stops before the next paid step", async () => { /* ... */ });
test("TooManyFallbacksError sends the job to needs_review, not to delivery", async () => { /* ... */ });
test("physical orders always stop at approval, even after the first 50", async () => { /* ... */ });
```

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar `lib/steps.js`** como una lista de pasos puros que reciben el contexto acumulado y devuelven un parche, y `api/job.js` como el bucle que los recorre, persiste tras cada uno, respeta el bloqueo (`locked_until` a 5 minutos) y contabiliza el coste.

- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 5: Ejecutar un job completo de verdad**

Run: `node scripts/run-job-local.js` (crea un pedido de prueba, salta el cobro y ejecuta el job)
Expected: PDF de 32 páginas en Storage, coste total registrado por debajo de 150 céntimos, y el pedido en `needs_review`.

- [ ] **Step 6: Commit**

```bash
git add cuentos/api/job.js cuentos/lib/steps.js cuentos/test/steps.test.js cuentos/scripts/run-job-local.js
git commit -m "feat(cuentos): orchestrate story generation as a resumable job"
```

### Task 1.17: Cron de barrido

**Files:**
- Create: `api/cron.js`, `test/api-cron.test.js`

- [ ] **Step 1: Escribir los tests que fallan** — reanuda jobs cuyo bloqueo ha expirado; crea el job de un pedido pagado que no lo tiene; **reembolsa** y avisa cuando un job lleva más de 24 h sin entregable; no toca jobs en `needs_review`.

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar `api/cron.js`** protegido por la cabecera `Authorization: Bearer $CRON_SECRET` que envía Vercel.

- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cuentos/api/cron.js cuentos/test/api-cron.test.js
git commit -m "feat(cuentos): sweep stale jobs and orphaned paid orders"
```

### Task 1.18: Entrega por email

**Files:**
- Create: `lib/email.js`, `test/email.test.js`

**Interfaces:**
- Produces: `sendReady({ email, orderId, locale })`, `sendDelayed({...})`, `sendRefunded({...})`.

- [ ] **Step 1: Escribir los tests que fallan** — el email lleva un enlace firmado que caduca en 30 días; el texto de confirmación repite la renuncia al desistimiento del art. 103 m; existe versión en español y en inglés; no aparece ningún dato del niño en el asunto.

- [ ] **Step 2: Ejecutar y ver que fallan** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar** con Resend y `createSignedUrl` de Supabase Storage.

- [ ] **Step 4: Ejecutar y ver que pasan** — Run: `npm test` → PASS.

- [ ] **Step 5: Enviar uno real a JJ y abrirlo en el móvil.**

- [ ] **Step 6: Commit**

```bash
git add cuentos/lib/email.js cuentos/test/email.test.js
git commit -m "feat(cuentos): deliver the story by email with a signed link"
```

### Task 1.19: Cola de revisión

**Files:**
- Create: `api/admin.js`, `admin/index.html`

- [ ] **Step 1: Escribir el test que falla** — sin `ADMIN_TOKEN` correcto todo devuelve 401; `GET` lista los pedidos en `needs_review` con las URLs firmadas de sus páginas; `POST {action:'approve'}` continúa el job desde `deliver`; `POST {action:'regenerate', page:5}` rehace solo esa página.

- [ ] **Step 2: Ejecutar y ver que falla** — Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar `api/admin.js` y una página HTML sin dependencias** que muestre las 12 páginas en cuadrícula con el texto debajo y tres botones.

- [ ] **Step 4: Ejecutar y ver que pasa** — Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cuentos/api/admin.js cuentos/admin/index.html
git commit -m "feat(cuentos): add token-protected human review queue"
```

### Task 1.20: Front — landing, muestra y formulario

**Files:**
- Create: `index.html`, `en/index.html`, `crear/index.html`, `pedido/index.html`, `assets/css/app.css`, `assets/js/app.js`, `api/sample.js`, `chapters/sample-story.json`

- [ ] **Step 1: Generar el cuento de muestra** con el pipeline (`node scripts/run-job-local.js --sample`), revisarlo a mano, pulir el texto y guardarlo en `chapters/sample-story.json` con sus imágenes en `assets/img/sample/`.

- [ ] **Step 2: Escribir el test que falla** — `api/sample.js` devuelve el PDF con el nombre sustituido, **sin llamar a ninguna IA** (el doble de `llm` falla el test si se le invoca) y en menos de 2 segundos.

- [ ] **Step 3: Ejecutar y ver que falla** — Run: `npm test` → FAIL.

- [ ] **Step 4: Implementar `api/sample.js`** reutilizando `renderPdf` en modo `preview`.

- [ ] **Step 5: Ejecutar y ver que pasa** — Run: `npm test` → PASS.

- [ ] **Step 6: Escribir la landing** en español y en inglés con `hreflang`: promesa, precio visible, «escribe el nombre de tu hijo y mira la muestra» como primer elemento, tres fotos del libro físico, plazo de entrega, aviso de generación con IA, aviso legal, privacidad y condiciones. Sin banner de cookies (analítica sin cookies).

- [ ] **Step 7: Escribir el formulario** (`crear/`) con los campos cerrados de `collection.js`, la vista previa antes de pagar, el checkbox no premarcado del art. 103 m para lo digital y el aviso del art. 103 c para lo físico.

- [ ] **Step 8: Escribir la página de pedido** (`pedido/`) que consulta el estado cada 5 segundos y muestra un progreso honesto.

- [ ] **Step 9: Comprobar el diseño en móvil** con las herramientas de desarrollo a 390 px de ancho.

- [ ] **Step 10: Commit**

```bash
git add cuentos/index.html cuentos/en cuentos/crear cuentos/pedido cuentos/assets cuentos/api/sample.js cuentos/chapters/sample-story.json
git commit -m "feat(cuentos): add bilingual landing, instant sample and order flow"
```

### Task 1.21: Galería de colorear y captura de email

**Files:**
- Create: `colorear/index.html`, `colorear/[slug].html` (generadas), `scripts/gen-coloring-gallery.js`, `api/subscribe.js`

- [ ] **Step 1: Escribir `scripts/gen-coloring-gallery.js`** que genere 20 páginas (dinosaurios, unicornios, princesas, coches, gatos, dragones, sirenas, espacio, piratas, granja, mariposas, robots, hadas, tiburones, fútbol, navidad, halloween, flores, tren, superhéroes), las suba a Storage y las registre en `coloring_pages`.

- [ ] **Step 2: Ejecutarlo** — Run: `node scripts/gen-coloring-gallery.js` → Expected: 20 filas y 20 PNG. Coste ≈ 0,80 $.

- [ ] **Step 3: Escribir la galería** con una página por tema, título y descripción optimizados, descarga directa del PDF y un formulario de email que entrega un pack de 5 páginas extra.

- [ ] **Step 4: Implementar `api/subscribe.js`** con doble opt-in y borrado a petición.

- [ ] **Step 5: Commit**

```bash
git add cuentos/colorear cuentos/scripts/gen-coloring-gallery.js cuentos/api/subscribe.js
git commit -m "feat(cuentos): publish free colouring gallery with email capture"
```

### Task 1.22: Despliegue y verificación de extremo a extremo

- [ ] **Step 1: Crear el proyecto en Vercel** apuntando a `cuentos/`, con dominio propio, Spend Management activado y todas las variables de entorno.

- [ ] **Step 2: Configurar el webhook de Stripe** contra el dominio de producción y guardar el secreto.

- [ ] **Step 3: Comprar un cuento real con una tarjeta real** (JJ, 4,99 €) y cronometrar todo el recorrido.

- [ ] **Step 4: Verificar**: pedido en `paid`, job recorrido entero, PDF de 32 páginas sin marcadores, coste registrado bajo 150 céntimos, email recibido, enlace funcionando, y el pedido esperando en la cola de revisión.

- [ ] **Step 5: Anotar los números reales** (latencia total, coste, intentos del validador, páginas con fallback) en `docs/fase-0-resultados.md` y actualizar el checklist de `CLAUDE.md`.

- [ ] **Step 6: Commit**

```bash
git add cuentos/CLAUDE.md cuentos/docs/fase-0-resultados.md
git commit -m "chore(cuentos): record phase 1 end-to-end verification"
```

---

## Lo que queda fuera de este plan

- **Fase 2 (impreso)**: `lib/pod-gelato.js`, PDF de imprenta enviado a producción tras la aprobación, webhook de estado, email con tracking, QR al PDF. Plan propio cuando la fase 1 esté verificada y el spike 0.3 haya dado precio y plazo.
- **Fase 3 (colorear por créditos)**: generador personalizado, saldo de créditos, galería a 50 temas.
- **Fases 4 y 5**: campaña de Navidad y SEO programático. No son de ingeniería.
