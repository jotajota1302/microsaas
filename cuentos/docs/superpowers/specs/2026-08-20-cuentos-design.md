# Diseño — Cuentos personalizados (A2)

Fecha: 2026-08-20 · Estado: aprobado por JJ (formato, estilo, proveedor de imagen y cobros decididos en sesión).
Investigación que lo sostiene: [`../../research-2026-08.md`](../../research-2026-08.md). Alcance y validación: [`../../mvp.md`](../../mvp.md). Autoridad compartida: [`../../../../CLAUDE.md`](../../../../CLAUDE.md).

## 1. Qué construimos y por qué así

Un cuento infantil personalizado (nombre, edad, rasgos, mascota, afición) generado con IA bajo schema validado, entregado como **PDF** (4,99 €) y como **libro impreso tapa dura 20×20 cm** (34,90 € + 4,90 € envío), más un generador de **páginas para colorear** por créditos (4,99 €/20).

Tres decisiones estratégicas que salen de la investigación y que el diseño debe honrar:

1. **El negocio es el impreso.** El PDF a 4,99 € es entrada: en español ya hay tres competidores a 3,99-5 € con primer cuento gratis, y Gemini Storybook es gratis. El único indie con ingresos verificados del nicho (Selfarama, 12.000 $/mes) vende impreso. Todo el diseño prioriza que el libro físico salga bien y rápido.
2. **La consistencia del personaje es el diferenciador.** Es la queja nº 1 de todos los productos IA de este nicho. Por eso el pipeline tiene una fase explícita de *hoja de personaje* + generación multi-referencia + verificación con VLM, en vez de un prompt repetido.
3. **La entrega rápida es el segundo diferenciador.** Todos los incumbentes tardan 10-18 días y acumulan quejas por retrasos en Navidad. Prometemos 7 días en España y publicamos la fecha límite de Reyes.

Lo que **no** hay en el MVP: fotos del niño, audio, vídeo, app, cuenta de usuario, más de 2 idiomas, múltiples protagonistas con parecido real, suscripción.

## 2. El producto, página a página

**Libro 20×20 cm, 32 páginas** (mínimo de Gelato es 30; 32 es el número par superior):

| Páginas | Contenido |
|---|---|
| 1 | Portadilla: «Un cuento para {{NOMBRE}}» + dedicatoria libre (máx. 140 caracteres) |
| 2-25 | 12 dobles páginas: ilustración a sangre en la par, texto de 60-90 palabras en la impar |
| 26-29 | 4 páginas para colorear derivadas de escenas del propio cuento (line-art) |
| 30 | «Así es {{NOMBRE}}»: la hoja de personaje como ficha ilustrada |
| 31 | Colofón: hecho para {{NOMBRE}} en {{FECHA}} + QR al PDF + aviso de generación con IA |
| 32 | Contraportada interior en blanco (sangrado) |

Las 4 páginas de colorear son el diferenciador barato: cuestan 0,16 $ en total, rellenan el mínimo de páginas de Gelato y ningún competidor las incluye en el libro.

**Estructura narrativa obligatoria** (la valida el validador, no la IA): planteamiento → problema → dos intentos fallidos → resolución en la que el niño usa su rasgo/afición → moraleja suave sin moralina. Edad objetivo 3-8, 60-90 palabras por página, español neutro con ortografía completa.

**Estilo visual fijo de la colección "Acuarela"**: sufijo de prompt inmutable — acuarela infantil suave, línea de tinta ligera, paleta cálida limitada, papel visible, sin texto en la imagen. Igual que el `STYLE` de `rpg-narrativo/lib/asset-catalog.js`, se define una vez y no se toca; si cambia, cambia la colección entera y se renumera.

**Personalización**: nombre, **género (niña / niño / prefiero no decirlo)**, edad (3-5 / 6-8), pelo (color + tipo), piel, gafas sí/no, mascota (lista + «ninguna»), afición (lista de 12), acompañante opcional (hermano/amigo, solo nombre y edad), tema de la colección (mar, bosque, espacio, dinosaurios, princesas y caballeros, fútbol), dedicatoria libre. Todo campos cerrados salvo nombre, nombre del acompañante y dedicatoria.

El género es obligatorio y no es un adorno: el español obliga a concordar («al niño le gustaba dibujar»), y sin el dato el modelo lo inventa — con nombre de niña, el cuento sale mal (medido en la fase 0). Cuando el comprador prefiere no decirlo, el prompt **prohíbe** los sustantivos y adjetivos con género referidos al protagonista en vez de elegir uno por su cuenta.

## 3. Precios y economía unitaria

| Producto | PVP | IVA | Coste directo | Margen |
|---|---|---|---|---|
| PDF (incluye las 4 de colorear) | 4,99 € | 4 % | Stripe MP 0,50 € + IA ~0,90 € | **~3,3 € (66 %)** |
| Tapa dura 20×20 + envío ES | 34,90 + 4,90 € | 4 % | POD 13-17 € **[verificar]** + Stripe 0,85 € + IA 0,90 € | **~14-19 € (40-50 %)** |
| Colorear, 20 créditos | 4,99 € | 21 % | Stripe MP 0,50 € + IA ~0,75 € | ~2,9 € |

Coste de IA por cuento (Seedream 4.5 a 0,04 $/imagen, 18 imágenes, +20 % de reintentos, texto despreciable): **≈ 0,87 $ ≈ 0,80 €**. Techo duro que el código debe respetar: **1,50 € por cuento**; si un pedido lo supera, se marca y se revisa a mano.

Costes fijos atribuibles: ~7 €/mes (parte del Vercel Pro compartido + dominio). Break-even: 2 PDFs/mes.

## 4. Arquitectura

### 4.1 Componentes y responsabilidades

Cada unidad tiene un propósito y se puede probar sola. Ninguna llama a la IA salvo las marcadas.

| Unidad | Responsabilidad | Depende de |
|---|---|---|
| `lib/collection.js` | Define la colección: estilo fijo, temas, plantilla del prompt, catálogo de ilustraciones de respaldo | — |
| `lib/prompt-story.js` | Construye los mensajes para el modelo de texto a partir de la personalización **anonimizada** | `collection.js` |
| `lib/llm.js` (IA) | Cliente de OpenRouter: structured outputs, reintentos, timeouts, contabilidad de coste | — |
| `lib/validate-story.js` | **Puerta única** hacia el render. Verifica schema, longitudes, estructura, marcadores, lista negra, nombres inventados | `schema/story.schema.json` |
| `lib/moderation.js` (IA) | Filtro de entrada (lista de bloqueo + clasificador barato) y segunda pasada sobre el texto generado | `llm.js` |
| `lib/character.js` (IA) | Genera la hoja de personaje (cuadrícula de 4 vistas) y la recorta en referencias | `images.js` |
| `lib/images.js` (IA) | Adaptador de proveedor (`seedream` \| `nanobanana` \| `flux` \| `minimax`): generación multi-referencia, 2K, reintentos, verificación VLM, fallback al catálogo | `llm.js` |
| `lib/lineart.js` | Convierte una ilustración en página de colorear (edición por IA + limpieza con sharp) | `images.js` |
| `lib/pdf.js` | Maqueta el PDF: pantalla (RGB, ligero) y imprenta (sangrado 3 mm, 250+ dpi, lomo) | pdf-lib, fuente OFL |
| `lib/pod-gelato.js` | Cotiza, crea y sigue pedidos en Gelato | — |
| `lib/db.js` | Acceso a Supabase con service role; todas las escrituras pasan por aquí | supabase-js |
| `lib/email.js` | Plantillas y envío (Resend) | — |
| `api/job.js` | **Máquina de estados** del pedido: orquesta todo lo anterior, idempotente por paso | todas |
| `api/sample.js` | Muestra gratis: coge el cuento de demostración ya generado y sustituye `{{NOMBRE}}` al vuelo. **Cero llamadas a IA** | `pdf.js` |
| `admin/` | Cola de revisión humana: ver el cuento, regenerar una página, aprobar o rechazar. Protegida por clave en variable de entorno | `db.js` |

Regla de oro heredada: **la IA genera datos, el código valida y decide**. Nada llega al PDF ni a la imprenta sin pasar por `validate-story.js`.

### 4.2 Flujo de datos

```
Formulario  ──► POST /api/order        (guarda personalización en Supabase, devuelve order_id)
                     │  moderación de entrada (bloquea aquí, antes de cobrar)
                     ▼
            POST /api/checkout         (Stripe MP si es digital, Stripe directo si es físico;
                     │                  Stripe recibe SOLO order_id, nunca los datos del niño)
                     ▼
            webhook-stripe  ──► billing + jobs(estado='pending')
                     │
                     ▼
            /api/job  (invocado por el webhook y por el cron cada minuto)
              1 text        → llm.js → validate-story.js → (≤3 reintentos)
              2 review      → moderation.js segunda pasada
              3 character   → hoja de personaje + recortes
              4 pages       → 12 ilustraciones en paralelo (multi-ref) + verificación VLM
              5 lineart     → 4 páginas de colorear
              6 pdf         → PDF de pantalla + PDF de imprenta
              7 approval    → cola de revisión humana (primeros 50 pedidos; siempre si es impreso)
              8 deliver     → email con enlace firmado 30 días
              9 print       → pod-gelato.js (solo pedidos físicos) → webhook → email con tracking
```

Cada paso escribe su resultado en `jobs.steps` y avanza el estado. Un fallo reintenta **solo ese paso**; el cron barre los atascados. Esto es lo que aprendimos del RPG (`api/generate.js` con `MAX_ATTEMPTS`), pero persistido, porque aquí hay dinero cobrado detrás.

El nombre del niño **nunca** sale hacia la IA: el prompt lleva `{{NOMBRE}}` y `{{AMIGO}}`, y la sustitución ocurre en `pdf.js`. La descripción física sí viaja (pelo, gafas) porque sin ella no hay ilustración, pero desligada del nombre.

### 4.3 Datos (Supabase, schema `cuentos`)

| Tabla | Campos clave | Notas |
|---|---|---|
| `orders` | id, email, product (`pdf`\|`hardcover`\|`softcover`\|`credits`), personalization (jsonb), locale, price_cents, status, created_at | La personalización vive aquí, no en Stripe |
| `jobs` | id, order_id, state, steps (jsonb), attempts, cost_cents, error, updated_at | Máquina de estados; índice por `state` para el cron |
| `stories` | id, order_id, story (jsonb validado), character_sheet_url, page_urls (jsonb), pdf_screen_url, pdf_print_url | |
| `billing` | id, order_id, provider, provider_id, amount_cents, currency, vat_rate, status, raw (jsonb) | Convención compartida del portafolio |
| `print_orders` | id, order_id, provider, provider_order_id, status, tracking_url, cost_cents | |
| `credits` | email, balance, updated_at | Solo para colorear |
| `coloring_pages` | slug, theme, locale, title, image_url, created_at | Galería SEO, **única tabla con lectura pública** |
| `blocked_inputs` | id, reason, hash, created_at | Sin datos personales; para afinar filtros |

RLS en todas. Todo es service-role salvo `coloring_pages` (SELECT público). Los PDFs y las imágenes van a Supabase Storage con buckets privados y URLs firmadas de 30 días; la galería de colorear, a un bucket público.

### 4.4 Consistencia del personaje (el corazón del producto)

1. **Hoja de personaje**: una sola imagen en cuadrícula 2×2 (frente, perfil, cuerpo entero, expresión alegre) generada desde la descripción; se recorta en 4 referencias. Generar en cuadrícula reduce la varianza facial frente a generar poses sueltas. **Ojo**: en la fase 0 se midió que un generador puede ignorar la maqueta (figura grande a la izquierda ocupando dos filas), con lo que recortar en cuartos da referencias inservibles. El código debe comprobar la maqueta antes de recortar y, si no cuadra, pasar la hoja entera como una sola referencia.
2. **Prompt anclado**: plantilla fija donde los atributos ocupan siempre la misma posición; solo cambian acción y fondo.
3. **Generación multi-referencia**: cada página recibe las 4 referencias + la página anterior ya aprobada (Seedream 4.5 admite hasta 10 imágenes de referencia).
4. **Verificación**: un VLM barato (Gemini Flash-Lite) responde bajo schema `{same_character: bool, style_matches: bool, issues: []}`. Si falla, se regenera una vez; si vuelve a fallar, se usa la ilustración del catálogo de la colección y se marca el pedido para revisión. **`style_matches` es tan obligatorio como `same_character`**: en la fase 0 se midió que el estilo deriva entre páginas (una acuarela suave seguida de una vectorial saturada) aunque el personaje se reconozca, y un libro así no se puede vender.
5. **Salida a 2K** (≈2.048 px): 20 cm a 250 dpi necesitan ~1.970 px. Sin esto el libro sale pixelado.

`lib/images.js` expone `generate({prompt, refs, size})` y esconde el proveedor tras una variable de entorno, para poder cambiar de Seedream a Nano Banana 2 sin tocar el pipeline. Esto es obligatorio: el riesgo de falsos positivos de los filtros de contenido con niños dibujados es real y aún no está medido.

### 4.5 Validador (`lib/validate-story.js`)

Es la única puerta hacia el PDF. Rechaza si:

- No cumple `schema/story.schema.json` (12 páginas, campos obligatorios).
- Alguna página se sale de 60-90 palabras, o el total baja de 800.
- `{{NOMBRE}}` no aparece en al menos 6 páginas, o aparece un nombre propio que no sea marcador.
- Falta alguna fase de la estructura narrativa (marcada por la IA en `page.beat` y contrastada por posición).
- Hay palabras de la lista negra (violencia, miedo intenso, muerte, marcas registradas, religión, política).
- Falta `image_hint` en alguna página, o el `image_hint` menciona texto/carteles (la IA no sabe escribir en imágenes).
- La moraleja es explícita en forma de sermón (heurística: frases que empiezan por «la moraleja», «aprendió que debía»).

Igual que en el RPG: hasta 3 reintentos con los errores del validador en el prompt; si no valida, el pedido va a la cola humana, nunca al cliente.

### 4.6 Render del PDF

`pdf.js` produce dos ficheros del mismo `story`:

- **Pantalla**: 20×20 cm, RGB, imágenes a 150 dpi, < 15 MB, con marca de agua si es vista previa.
- **Imprenta**: 3 mm de sangrado por lado, imágenes a 250+ dpi, portada generada aparte con las dimensiones que devuelve `cover-dimensions` de Gelato para 32 páginas, márgenes de seguridad de 10 mm en el texto.

Tipografía: fuente con licencia OFL legible para primeros lectores (Andika, diseñada para alfabetización) — se incrusta, sin dependencia de licencias comerciales.

### 4.7 Cobros

- **Digital** (PDF, créditos): Stripe Managed Payments, tax code «Digital Books», IVA 4 % español. Checkbox no premarcado del art. 103 m antes de pagar, repetido en el email de confirmación.
- **Físico** (libro): Stripe Checkout directo, IVA 4 %, aviso del art. 103 c junto al botón + vista previa obligatoria antes de pagar. OSS cuando el físico UE se acerque a 10.000 €/año.
- Un solo webhook escribe en `billing` y crea el job. Plan B si Stripe MP no aprueba: Creem (nunca Polar: su AUP prohíbe servicios dirigidos a menores).

### 4.8 Manejo de errores

| Fallo | Respuesta |
|---|---|
| Texto no valida tras 3 intentos | Job a `needs_review`, aviso por Telegram (OpenClaw), cliente recibe «tu cuento necesita un repaso, mañana lo tienes» |
| Una imagen falla o el VLM la rechaza dos veces | Ilustración del catálogo de la colección; pedido marcado |
| ≥ 3 imágenes con fallback | Job a `needs_review`: no se entrega un cuento con un tercio de relleno |
| Proveedor de imagen caído | `images.js` cambia al proveedor de respaldo (variable de entorno) |
| Gelato rechaza el PDF | Job a `needs_review` + reintento manual; nunca se cobra dos veces |
| Coste del job > 1,50 € | Se detiene y va a revisión |
| Pago sin job (webhook perdido) | El cron detecta `orders` pagadas sin job y lo crea |
| Cliente insatisfecho | Reimpresión gratis si el error es nuestro (garantía de 3 años por defectos, aunque no haya desistimiento) |

Principio: **el cliente ya ha pagado**; ante la duda, revisión humana y un email honesto, nunca un producto malo entregado en silencio.

### 4.9 Pruebas

- **Unitarias**: `validate-story.js` con un corpus de cuentos buenos y de los fallos reales que veamos (cada bug encontrado añade un caso); `pdf.js` con un `story` fijo comprobando número de páginas, dimensiones y dpi; máquina de estados de `jobs` con proveedores simulados.
- **De integración con dinero simulado**: pedido completo con Stripe en modo test y proveedores de IA simulados, verificando que el email sale y el PDF tiene 32 páginas.
- **De calidad (manual, con presupuesto)**: los spikes de la fase 0 y una revisión a ojo de los 20 primeros cuentos generados.
- Nada de mocks en las pruebas de validador: se prueba contra JSON reales guardados de los modelos.

## 5. Fases y criterios de aceptación

| Fase | Termina cuando… | Duración | Coste |
|---|---|---|---|
| **0 · Spikes** | (a) 3 personajes × 12 escenas × 3 proveedores comparados: sabemos tasa de consistencia, rechazos de filtro y si el 2K es real; (b) cuentas Gelato y Peecho creadas, quote de API para 20×20/32 pp a un CP español obtenida, **1 muestra impresa pedida**; (c) solicitud de Stripe MP enviada; (d) 10 cuentos de 3 modelos de texto pasados por un validador provisional | 3-4 días | ~8 $ IA + ~20 € muestra |
| **1 · Mínimo que cobra** | Un desconocido puede pagar 4,99 € y recibir por email un PDF de 32 páginas correcto, generado por el pipeline con revisión humana; landing ES/EN con precio y muestra con su nombre al instante; 20 páginas de colorear gratis con captura de email; listing en Etsy | 1 semana | dominio 12 € |
| **2 · Impreso** | Un pedido de tapa dura llega a casa de JJ en ≤ 7 días, sin marca de Gelato, con la calidad esperada y el tracking enviado por email | 4-5 días | coste del libro |
| **Prueba 14 días** | Medido contra los umbrales de `mvp.md` §6 | 14 días | 50 € ads |
| **3 · Colorear por créditos** | Generador personalizado + créditos + galería a 50 temas | 3-4 días | ~5 $ |
| **4 · Campaña Navidad/Reyes** | 2-3 colecciones más, cut-off 17-dic visible, afiliación 20 % | nov-dic | según señal |
| **5 · SEO programático y LatAm** | ES/EN por tema × edad, precios en MXN/USD, envío a México | — | — |

La fase 1 fusiona las antiguas fases 1 y 2 del `CLAUDE.md`: no tiene sentido escribir un cuento de muestra a mano si el pipeline lo produce, y el cuento de muestra debe ser exactamente lo que recibe el cliente.

## 6. Puntos abiertos que resuelve la fase 0

1. Precio real de Gelato para 20×20 tapa dura 32 pp + envío a España (si supera 18 €, se pasa a Peecho 24 pp o el PVP sube a 39,90 €).
2. Tasa de consistencia real de Seedream 4.5 y frecuencia de falsos positivos del filtro con escenas infantiles.
3. Si Seedream entrega 2K con nitidez suficiente para 250 dpi o hace falta upscale.
4. Aprobación de Stripe Managed Payments para una cuenta española con este producto.
5. Qué modelo de texto da mejor español infantil con menos reintentos del validador.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Filtros de contenido con niños dibujados | Medido en fase 0; adaptador de proveedor con respaldo |
| POD más caro o más lento de lo previsto | Dos proveedores evaluados en paralelo; el PVP se ajusta antes de lanzar |
| Percepción negativa de «hecho con IA» | Transparencia en el colofón, calidad de acuarela, énfasis en el objeto físico |
| Gemini Storybook gratis comprime el PDF | El producto es el impreso; el PDF es el gancho |
| Estacionalidad (septiembre es flojo) | La prueba de septiembre valida el mensaje; la validación económica real es nov-dic |
| Un cuento inapropiado impreso y enviado | Campos cerrados + filtro de entrada + segunda pasada + revisión humana obligatoria en todo pedido físico |

---

## Revisión 2026-08-21 — MVP solo digital

Aprobada por JJ en sesión. Esta sección **prevalece** sobre lo anterior donde se contradigan; el resto del documento sigue vigente. Motivos y alternativas descartadas en [`../../mvp.md`](../../mvp.md) §7.

### Qué cambia

| Antes | Ahora |
|---|---|
| Libro impreso 34,90 € como producto principal; PDF a 4,99 € como gancho | **Solo PDF a 12,90 € (ES) / 14,90 € (EN)**. El impreso no se construye: se mide con un botón de interés |
| 32 páginas (mínimo de Gelato), dobles páginas, sangrado 3 mm, lomo | **18 páginas, una escena por página** (ilustración arriba, texto abajo), sin sangrado ni lomo |
| Imágenes a 2K para 250 dpi | **1K basta**: pantalla e impresión doméstica |
| Seedream 4.5 vía fal.ai como proveedor de imagen | **Nano Banana 2 (`google/gemini-3.1-flash-image`) vía OpenRouter**: medido el 21-08 con dos personajes — mismo personaje, misma acuarela, 0 bloqueos, 14 s, 0,07 $/imagen. Una sola clave para texto e imagen |
| Diferencial: consistencia del personaje | Diferencial: **la historia es sobre la vida del niño** — familia y amigos como personajes, momento vital, tono. La consistencia sigue siendo requisito, no argumento de venta |
| Stripe MP para digital + Stripe directo para físico | **Solo Stripe MP** |
| `print_orders`, `lib/pod-gelato.js`, paso `print` del job | No existen. Se añaden `print_interest (email, order_id, created_at)` y `waitlist (email, locale, created_at)` |
| Cobrar → generar → entregar por email | **Guion → muestra ilustrada → cobrar → completar**, todo en la misma URL temporal: ver la sección siguiente |
| Personalización: nombre, rasgos, mascota, afición, 1 acompañante | Se añaden **hasta 2 personas** (nombre + relación + edad aproximada), **momento** y **tono** (listas cerradas) |
| Marcadores `{{NOMBRE}}`, `{{AMIGO}}` | `{{NOMBRE}}`, `{{PERSONA1}}`, `{{PERSONA2}}`. La relación («su abuela», «su hermano mayor») viaja al modelo como texto; el nombre nunca |
| Foto del niño: fuera del MVP | Foto **aparcada con condiciones explícitas**: solo con encargado del tratamiento en la UE (Vertex AI región UE), consentimiento expreso del progenitor, borrado inmediato y anotación en el registro de actividades. No antes de tener tracción |

### Embudo en dos puertas: guion → muestra ilustrada → pago (revisión 2026-08-21, tarde)

Propuesta de JJ, acotada en sesión. Sustituye a la «vista previa parcial» anterior: el coste del curioso baja de 0,15 € a **0,01 €**, porque las imágenes solo se generan para quien ya ha leído y aprobado su guion.

| Puerta | Cuándo | Qué ve el usuario | Coste IA | Límite |
|---|---|---|---|---|
| **1 · Guion** | al enviar el formulario (email obligatorio) | las 12 páginas de **texto** en el visor, sin imágenes. Botones: «Cambiar algo» y «Me gusta, ver cómo quedaría» | ≈ 0,01 € por versión | **2 rondas de cambios** gratis; a la tercera: «completa el cuento y podrás pedir un retoque más» |
| **2 · Muestra ilustrada** | al aprobar el guion | portadilla + ficha del personaje (la hoja) + **2 escenas ilustradas**: la página 1 y una del medio. **Nunca la resolución.** Las demás, con marco «se ilustra al completar el cuento» | ≈ 0,21 € (hoja + 2 escenas a 0,07 $) | una por guion aprobado |
| **3 · Pago 12,90 €** | botón «Completar el cuento» | las 10 escenas restantes + 4 colorear + PDF, tras revisión humana | ≈ 0,95 € | **1 ronda de retoque** incluida: hasta 3 ilustraciones regeneradas o 1 página de texto reescrita (≈ 0,20 €) |

**«Cambiar algo»**: un campo corto (máx. 200 caracteres, moderado) con la instrucción del usuario («que la abuela tenga más protagonismo», «menos miedo en la página 6»). Se regenera el guion entero con la instrucción añadida al prompt y se vuelve a validar. **No es edición libre del texto**: el usuario dirige, el modelo escribe, el validador decide. La instrucción pasa por el mismo filtro que la dedicatoria.

**URL**: `/c/<token>` (token de 22 caracteres, aleatorio), servida por la misma app de Vercel — **no hay un despliegue por cliente**. `stories.stage` es `script` → `sample` → `full`; `stories.expires_at` son 7 días desde la creación y 30 desde el pago. Tras el pago la misma URL pasa a `full` y añade «Descargar PDF», «Pedir un retoque» y «Quiero el libro impreso».

**Email como llave**: el enlace se envía por email (no se muestra en pantalla): verifica el correo, limita a un guion por email y habilita los recordatorios (día 5: «tu cuento caduca en 2 días»; día 7: «ha caducado; puedes crearlo de nuevo»). Sin cuenta de usuario.

**Protección del gasto**, de fuera adentro: guardrail de OpenRouter (**5 $/día** en la clave, externo a nuestro código); `MAX_SCRIPTS_PER_DAY` (200; a 0,01 € son 2 €) y `MAX_SAMPLES_PER_DAY` (40; a 0,21 € son 8,4 €); Turnstile en el formulario; 3 guiones por IP y día. Al tocar techo, lista de espera. La web **no se apaga nunca**; caducan los cuentos.

**Caducidad y borrado**: un cron diario borra del Storage las imágenes y el PDF de los cuentos caducados y sustituye los datos personales por `null`, conservando solo lo necesario para la factura en los pagados.

**Métricas que deciden**: (1) guion → muestra (cuántos aprueban el texto: mide si la historia engancha); (2) muestra → pago (mide si las ilustraciones convencen). Coste de IA por venta = 0,01/c₁c₂ + 0,21/c₂ + 0,95. Con c₁ = 50 % y c₂ = 20 %: 0,10 + 1,05 + 0,95 = **2,1 €** → margen ≈ 9 €. El modelo aguanta hasta c₂ ≈ 3 %; por debajo, la muestra ilustrada pasa a ser de pago simbólico (1 €) o desaparece y se cobra tras el guion.

### Cambios en el job

Tres puntos de entrada sobre la misma máquina de estados persistida: `script` (pasos `text → validate`; se repite en cada «cambiar algo» con la instrucción acumulada), `sample` (`review-light → character → pages[1, mid]`) y `full` (`pages[resto] → lineart → pdf → approval → deliver`; `retouch` regenera hasta 3 páginas y vuelve a `approval`). `full` reutiliza la hoja y las 2 páginas ya hechas. El techo `MAX_AI_COST_CENTS` (150) se aplica a la suma de todos los tramos de un mismo cuento.

### Lo que se archiva (no se borra)

El trabajo de imprenta hecho en la fase 0 — `scripts/spike-pod.js`, la geometría de sangrado de `pdf.js`, la investigación de POD — queda en el repo y se reactiva si el botón de interés supera el 25 % de los compradores.
