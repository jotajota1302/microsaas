# Portafolio micro-SaaS — decisiones comunes a los tres proyectos

Repo `microsaas` (github.com/jotajota1302/microsaas): **una carpeta por proyecto**. Este fichero es la **autoridad compartida** de `viajeros/`, `cuentos/` y `kit-local/` y se carga en cualquier sesión abierta dentro del repo. Las tres sesiones de Claude trabajan en paralelo: lo que esté aquí no se rediscute en cada carpeta; si un proyecto necesita cambiar algo común, se anota aquí y se avisa a los otros. Investigación completa con fuentes: `docs/portfolio-2026.md`. Cada proyecto tiene su propio `CLAUDE.md` y `docs/mvp.md`: léelos antes de tocar esa carpeta.

```
microsaas/
├── CLAUDE.md                 Este fichero: decisiones comunes
├── docs/portfolio-2026.md    Investigación y ranking (fuentes)
├── docs/backlog.md           Ideas a futuro con su disparador; descartes razonados
├── viajeros/                 A1 · partes de viajeros SES.Hospedajes (B2B, pago por uso)
├── cuentos/                  A2 · cuentos y colorear personalizados (B2C + impreso)
└── kit-local/                A3 · placa QR 3D + página dinámica (físico + suscripción)
```

## Regla de juego del portafolio

- Cada proyecto tiene una **prueba de 2 semanas y < 100 €** con umbrales escritos antes de construir (en su `docs/mvp.md`). Primero validación, luego código.
- Precio visible y cobro vivo desde el día 1. **Nunca "gratis para siempre"**, nunca lifetime deals, nunca anuncios como modelo.
- Umbrales de decisión (acumulado a 14 días): matar si 0 pagos **y** < 3 % de altas con ≥ 300 visitas; iterar si 1-4 pagos; doblar si ≥ 5 pagos. Para lo físico la señal es Etsy/MakerWorld (descargas, favoritos, primera venta).
- Un producto muerto deja vivos dominio y página SEO (coste ≈ 0).
- Una sola persona "builder" en Reddit/TikTok que publica varias cosas; nunca cuentas falsas por producto.

## Stack (decidido, no reabrir)

- **Front**: HTML/JS vanilla, sin frameworks ni build (igual que RPG y CRIME). Landing bilingüe **EN + ES** con `hreflang`, precio visible, demo de 20 s.
- **Hosting**: **Vercel Pro** (un asiento, 20 $/mes; Hobby prohíbe uso comercial). Un proyecto Vercel por producto, dominio propio, **Spend Management activado**. El PC de casa solo para OpenClaw y procesos internos (lotes, pruebas), nunca para lo que ve un cliente.
- **Datos**: Supabase. `cuentos` y `kit-local` comparten el proyecto Supabase existente (el del RPG, compartido con otras apps; ref en `.env`, nunca en el repo) con **un schema por producto** (`cuentos`, `kit`), RLS en todas las tablas, grants por schema, nunca `GRANT ALL` a `anon`. `viajeros` (documentos de identidad) va en **proyecto propio en región UE** — decisión por sensibilidad de datos. Login anónimo permitido; magic link para clientes de pago.
- **IA**: pago por uso, **siempre detrás de un adaptador conmutable por variable de entorno** (nunca un proveedor cableado). Texto: **OpenRouter** con structured outputs (sin markup por token, 5,5 % al cargar créditos, failover entre proveedores, no registra prompts por defecto; ajustar "ZDR only"); modelos de referencia: Gemini Flash-Lite 0,10/0,40 $, DeepSeek V4 Flash 0,068/0,168 $, GPT-5 mini 0,25/2,00 $ por M tokens. Imagen: elegir por necesidad — MiniMax `image-01` 0,0035 $ para ilustración suelta sin consistencia; **Seedream 4.5 (fal.ai) 0,04 $ o Nano Banana 2 0,067 $ cuando haga falta consistencia de personaje** con imágenes de referencia (`image-01` solo admite una referencia y está pensada para caras humanas). La suscripción Coding Plan es solo para nuestro agente de código. **Regla de oro heredada del RPG: la IA genera datos con JSON schema, el código valida y decide.** Todo output de IA pasa por un validador antes de usarse.
- **Privacidad con la IA (obligatorio)**: MiniMax no tiene DPA público y aloja datos en EE. UU./Singapur → **nunca enviarle datos personales** (ni nombre real con apellidos, ni email, ni IDs, ni fotos de personas, ni documentos). Si un producto necesita procesar datos personales con IA (OCR de DNI, fotos de niños), usa un proveedor con DPA en la UE (Anthropic/OpenAI con DPA, Azure/Google Document AI región UE) o proceso local sin salida, y se documenta en el registro de tratamientos.
  - ⚠️ **OpenRouter tampoco vale para datos personales** (verificado por `viajeros` 2026-08-20): el **DPA firmado solo existe para cuentas Enterprise**, la política de privacidad declara transferencias a EE. UU. y el enrutado solo-UE (`eu.openrouter.ai`) es también Enterprise. El flag `provider.zdr: true` reduce la retención pero **no sustituye a un contrato del art. 28 RGPD**. OpenRouter sí es la opción por defecto para todo lo que **no** lleve datos personales.
  - **Texto seudonimizado** (reseña con los nombres quitados, comentario de un cliente): **sigue siendo dato personal** — EDPB, Directrices 01/2025: la seudonimización no saca el dato del ámbito del RGPD aunque el receptor no tenga la clave, y un texto libre identifica por contexto ("la camarera del martes"). Regla derivada (`kit-local` 2026-08-21): limpiar nombres/emails/teléfonos **y** enviarlo solo a un proveedor con **DPA propio en la UE** (Mistral La Plateforme), nunca por OpenRouter aunque lleve `zdr: true`.
  - ⚠️ **AEPD, decálogo "Cuidado con lo que le confIAs" (27-01-2026)**: no introducir en herramientas de IA nombre, dirección, teléfono, DNI/NIE **ni imágenes de personas**. Afecta directamente a `cuentos` (fotos de niños): o proveedor con DPA en la UE y base jurídica documentada, o no se envía la foto — se describe al personaje con texto y se genera sin la imagen real.
  - ⚠️ **AEPD, nota de 17-06-2025**: prohibido pedir copia, foto o escaneo del DNI/pasaporte en hospedajes; ya hay multa de 5.400 € por escanearlo (hotel de Girona, 30-07-2025). Por eso `viajeros` lee la MRZ **en el dispositivo del huésped** y no sube ninguna imagen.
- **Cobros**: digital global → **Stripe Managed Payments** como MoR (más barato que Polar en tickets pequeños: 0,50 € sobre 4,99 € frente a 0,71 €; España elegible; e-books admitidos). **Polar descartado** desde 2026-08-20: su AUP prohíbe servicios "intended for minors" y somete eBooks/IA generativa a revisión — riesgo de cierre de cuenta tras lanzar (investigado por `cuentos`, detalle en `cuentos/docs/research-2026-08.md` §5). Plan B: **Creem**. Lemon Squeezy NO (absorbido por Stripe). B2B España y físico → Stripe directo (**los MoR no admiten producto físico**), con el tipo de IVA que corresponda (libros 4 %, resto 21 %) o Etsy. Webhooks a la tabla `billing` del schema del producto.
- **Nunca cobrar tickets pequeños de uno en uno** (verificado por `viajeros` 2026-08-20): Stripe cobra **1,5 % + 0,25 €** por tarjeta EEE, con un **mínimo de 0,50 € por cargo**. Un cobro de 0,95 € pierde el **27,8 %** en comisión; uno de 10 €, el 4 %; uno de 39 €, el 2,1 %. Todo consumo por unidad se vende en **bonos prepago** o se agrega en **una factura mensual** (Stripe Billing metered, +0,7 %), que además es lo que encaja con Verifactu.
- **Facturación propia**: software compatible Verifactu (obligatorio para autónomos desde **1-jul-2027**; sociedades 1-ene-2027; 2026 es voluntario). Stripe Invoicing **no** cumple Verifactu: sirve para cobrar, no para facturar legalmente. App gratuita de la AEAT mientras haya pocas facturas; Billin 6,6 €/mes o Quipu 8,5 €/mes (con API) al automatizar.
- **Analítica**: sin cookies de terceros (Umami/Plausible o Vercel Analytics) → sin banner de cookies. UTM en todo enlace que salga.
- **Operaciones**: OpenClaw en el PC como capa interna: alertas de pagos/errores por Telegram, triaje de soporte, cola de contenido, informe semanal por producto.

## Quién vende (decidido 2026-08-23)

Los tres productos los vende **la sociedad**, no una persona física:

    4 Bits Engineering S.L.
    CIF B27563725
    Calle José Luis Navarro Campello 1, esc. 3, 3º 1ª · 03202 Elx/Elche (Alicante)
    info@4bitsengineering.com

Esto es lo que exige la **LSSI art. 10** en el aviso legal, y no es cosmética: tiene que estar
publicado y encontrarse sin registrarse. «Elche (Alicante)» no vale — hace falta domicilio a efectos
de notificaciones, con calle, número y código postal.

**Cómo se pone, y por qué así**: en variables de entorno (`LEGAL_NAME`, `LEGAL_NIF`,
`LEGAL_ADDRESS`, `LEGAL_EMAIL`), servidas por un endpoint público y pintadas en la página en tiempo
de ejecución. Nunca escritas en el HTML. Dos motivos: es dato fiscal real y **estos repos son
públicos**; y un dato que vive en un sitio se cambia una vez en vez de en nueve ficheros.

`comic/` ya lo tiene así (`api/config.js` + `assets/js/legal.js` + `push-env.js`). Se puede copiar
tal cual.

### ⚠️ Estado a 2026-08-23

- `comic/` — puesto y verificado en producción.
- `cuentos/` — **PUBLICADO CON EL AVISO LEGAL VACÍO**. Su `legal/index.html` conserva los
  marcadores `[[NIF]]`, `[[DOMICILIO]]` y `[[EMAIL]]`, y un cliente lee hoy «Titular:» sin nada
  detrás. Es exposición legal en un sitio que ya está sirviendo.
- `viajeros/` y `kit-local/` — sin código todavía, no aplica.

## Suelo legal (una vez, sirve para los tres)

1. Alta en Hacienda **modelo 036** antes de la primera venta (el 037 ya no existe). Con la sociedad
   ya constituida (ver «Quién vende»), lo que aplica es el alta censal de la sociedad en el epígrafe
   correspondiente, no el de una persona física.
2. **RETA con tarifa plana** (~89 €/mes) en cuanto haya ingresos recurrentes (STS 941/2025: "no llego al SMI" ya no protege con suscripciones).
3. Web: aviso legal LSSI (nombre, NIF, domicilio, email), privacidad + registro de actividades (**Facilita_RGPD** de la AEPD), condiciones con desistimiento (descargas: checkbox de inicio inmediato + email; suscripción: 14 días con prorrata), botón "desistir".
4. DPAs: Supabase (región UE), Vercel, MoR, proveedor de IA con datos personales.
5. Físico: inserto **GPSR** en cada pieza (nombre, dirección, email, lote, advertencias), dossier técnico de 1 página por modelo, sección "EU product compliance" en Etsy, registro de envases (RPP + Ecoembes Comerciales, < 20 €/año). Evitar diseños con aspecto de juguete.

## Convenciones

- Código y comentarios en inglés; textos de producto en español (y en inglés donde la landing sea bilingüe).
- Cada proyecto: `CLAUDE.md` (instrucciones de sesión) + `docs/mvp.md` (alcance, precio, arquitectura, prueba de validación con umbrales) + `schema/` si hay JSON de IA.
- **Git**: el repo es esta carpeta (`microsaas/`), una carpeta por proyecto. No crear repos anidados en los proyectos y **nunca `git init` en la raíz de `IDEAS/`** (hay `.env` con credenciales de otros proyectos). El repo es **público**: ningún secreto, ref de proyecto ni dato de cliente real en él.
- Secretos en `.env` del proyecto (gitignored) y en las env vars de Vercel.
- Al terminar una fase, actualizar el checklist del `CLAUDE.md` del proyecto. Lo que afecte a los tres, aquí.

## Componentes reutilizables (quién los construye, quién los usa)

| Componente | Lo construye | Lo reutiliza |
|---|---|---|
| Host de QR/enlaces dinámicos con analítica de escaneos (`q.<dominio>/<id>`) | `kit-local` | cuentos (QR en el libro impreso), futuros Tier B |
| Plantilla de landing EN/ES con precio + checkout MoR + UTM | el primero que la necesite (previsiblemente `cuentos`) | los otros dos |
| Generador STL/3MF de placas con QR (tamaño de módulo por boquilla) | `kit-local` | Tier B (placa de canción, tarjeta CV) |
| Pipeline "JSON validado → imágenes con estilo fijo" | ya existe en `../rpg-narrativo/` (fuera del repo) | `cuentos` |
| Adaptador de imagen multi-proveedor con consistencia de personaje (`lib/images.js`) | `cuentos` | Tier B (litofanías, photo wall) |
| Máquina de estados de jobs largos en Supabase (cobro → generación por pasos → entrega, con cron de barrido) | `cuentos` | `viajeros` (lotes de partes), Tier B |
| Render de PDF de imprenta (sangrado, dpi, lomo) + pedido a POD por API | `cuentos` | `kit-local` (inserto GPSR), Tier B |
| ~~Extracción estructurada de PDF/imagen con validador~~ — **cancelado**: `viajeros` ya no procesa imágenes (ver privacidad con la IA). Si Tier C lo necesita, lo construye Tier C | — | — |
| Lectura de documentos **on-device** (MRZ ICAO 9303 TD1/TD3, checksums, letra de NIF/NIE) en `viajeros/lib/identity.js` | `viajeros` | cualquier producto que deba identificar sin subir imágenes |
| Cliente SOAP + validador contra esquemas de la Administración (XML→ZIP→Base64, truststore FNMT) en `viajeros/lib/` | `viajeros` | Tier C (Verifactu, huella) |
| Webhooks de cobro → tabla `billing` + alertas OpenClaw | el primero que cobre | los otros dos |

Cuando un proyecto termine un componente reutilizable, lo anota aquí con la ruta.
