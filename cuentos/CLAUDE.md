# Proyecto: Familia de cuento — cuentos personalizados en PDF

**Marca (decidida 2026-08-21)**: «Familia de cuento» en español, «Storybook Family» en inglés — el juego de palabras se conserva en los dos idiomas («de cuento» = idílico y a la vez hecho cuento; «storybook» significa lo mismo). «Fairytale» queda descartado: promete hadas y fantasía, que es justo lo que este producto no es. Eslogan: «el cuento de su vida» / «the story of their life». Una marca, dos idiomas, **un solo dominio** (`familiadecuento.com`, pendiente de comprar): el inglés vive en `/en/` con su `hreflang`. Todo en `lib/brand.js`; el logotipo (un libro cuyas páginas abiertas son el tejado de una casa) en `assets/img/logo.svg`. La carpeta del repo sigue llamándose `cuentos/`.

Micro-SaaS B2C, español primero (y en inglés): cuentos infantiles personalizados **en PDF**, generados como JSON validado + ilustraciones de estilo fijo. El diferencial no es el aspecto del niño sino **su vida**: su familia y amigos como personajes, el momento que está viviendo y el tono. El gancho es una **vista previa personalizada en una URL temporal** generada antes de cobrar. Sin imprenta ni envíos en el MVP (decisión 2026-08-21). Reutiliza el motor del RPG (`../../rpg-narrativo/`): IA que genera datos bajo schema, validador como única puerta, catálogo de estilo fijo.

**Lee antes de nada**: `docs/mvp.md` (alcance y precios, **v2**), `docs/superpowers/specs/2026-08-20-cuentos-design.md` (diseño técnico; **la revisión del 21-08 al final prevalece**), `docs/fase-0-resultados.md` (lo medido contra las API reales), `docs/research-2026-08.md` (investigación con ~60 fuentes) y `../CLAUDE.md` (stack, privacidad con IA, legal: autoridad compartida con `viajeros/` y `kit-local/`).

## Decisiones ya tomadas (no reabrir sin preguntar)

### Modelo de negocio (2026-08-21)

- **Solo PDF en el MVP, a 11,99 € en español y 13,99 € en inglés** (decidido 2026-08-21). Empezó en 12,90 (tramo medio de Etsy); se bajó porque es un producto **solo digital** y porque el **impreso (20-25 €, pendiente de presupuesto de imprenta)** será donde viva el margen. **9,99 se descartó**: regala 2,64 € por venta y tendría que convertir un 40 % mejor para empatar; 11,99 está bajo la misma barrera psicológica, regala 0,82 € y necesita un 10 %. Margen por venta ≈ **8,58 €** (IVA 4 % dentro, comisión 5 % + 0,25 €, y ~2,10 € de IA repartida: 0,57 € cuesta el libro, el resto son los guiones y muestras de quien no compra). Cero envíos, cero logística; el único trabajo manual son ~5 minutos de revisión por pedido pagado. El impreso **no se construye**: un botón «Quiero el libro impreso» mide la demanda; con ≥ 25 % de compradores se reabre (fase 5).

### El impreso, después del presupuesto de la imprenta (22-08)

La imprenta local dice que **un libro suelto no sale rentable** y pide juntar ~20. Investigado en `docs/impresion-2026-08-22.md`; tres conclusiones que no se reabren sin datos nuevos:

- **La cola de 20 no se hace.** Cobrar y fabricar cuando se llene incumple el art. 66 bis TRLGDCU (entrega en **30 días naturales** máximo) y, a 1-3 pedidos impresos al mes, tardaría 7-18 meses. La forma legítima de la misma idea es un **lote con fecha de cierre** («pedidos hasta el 30-nov, en casa antes del 22-dic»), que además encaja con el pico de Navidad. **Una cola por cantidad es una promesa rota; una cola por fecha es una campaña.**
- **El proveedor no es esa imprenta, es POD unitario**: Gelato, Peecho, Cloudprinter, Prodigi (API de pedido unitario, producción UE) y **Podiprint** (Málaga, tapa dura sin mínimo, 48-72 h). Antes de decidir hacen falta tres precios reales — y a la imprenta hay que preguntarle por **20 *distintos* con dato variable**, no por una tirada de 20 iguales.
- **A 20-25 € no sale**: en el extremo malo del rango deja menos que el PDF a 11,99 € y trae envíos, devoluciones, Stripe **directo** (los MoR no admiten físico) e IVA propio. El precio del impreso es **29,90 €, quizá 34,90**. Y hay un bloqueo sin presupuestar: las ilustraciones son **1024×1024 ≈ 130 dpi a 20 cm**; imprenta quiere 250-300, así que el impreso exige generar a 2K (dobla el coste de IA por libro), sangre de 3 mm y crecer de 18 a 24-32 páginas (mínimo de todos los POD).

**Lo que sí está hecho y desplegado**: `/imprimir/` y `/en/print/` («cómo tenerlo en papel»), con los tres caminos reales — casa, copistería e imprenta que acepta PDF — y una **tabla de qué pide cada imprenta y qué elegir con nuestro fichero**, comprobada en sus webs el 22-08:

| Imprenta | Qué pide | Qué elegir |
|---|---|---|
| **Blurb** | Sube un PDF. Cuadrados 13×13, 18×18, 30×30 cm. **Páginas múltiplo de 4**. | Cuadrado pequeño 18×18 |
| **Lulu** | Interior y portada por separado. Cuadrado 21,6×21,6 cm tapa dura, desde ~14,76 $. | 8,5×8,5 in tapa dura |
| **Pixartprinting** (ES) | Sube el PDF; corrige sangre y escala solo. **«Desde un ejemplar»**. | El cuadrado más cercano, tal cual |

Los álbumes tipo **Hofmann/Fotoprix/Photobox** solo funcionan con su editor: **no admiten un PDF hecho** (comprobado). La salida ofrecida es mandar las páginas sueltas en imagen a quien lo pida.

Las dos páginas recogen correo para la futura edición impresa (`waitlist`, `reason: "print"`) y el botón «Quiero el libro impreso» ya promete un aviso por email, no un «si hay suficientes familias». `test/pages.test.js` impide que la página diga un número de páginas distinto del que tiene el libro.
- **Embudo en dos puertas, generado antes de cobrar, en una URL temporal** (`/c/<token>`, misma app de Vercel, sin despliegue por cliente): (1) **guion** — el texto completo (≈ 0,01 €), con **hasta 2 rondas de «cambiar algo»** (instrucción corta moderada; el modelo reescribe, el validador decide); (2) **muestra ilustrada** — solo tras aprobar el guion: portadilla + ficha + **2 escenas, nunca la resolución** (≈ 0,21 €); (3) **pago** — el resto + colorear + PDF + **1 retoque incluido** (3 ilustraciones o 1 página). Enlace por email; caduca a 7 días (30 pagado); recordatorios días 5 y 7. El curioso cuesta un céntimo.
- **Techos de gasto, de fuera adentro**: guardrail de OpenRouter **5 $/día** en la clave; `MAX_SCRIPTS_PER_DAY` 200, `MAX_SAMPLES_PER_DAY` 40; Turnstile; 3 guiones por IP y día. Al tocar techo, lista de espera. La web **nunca se apaga**. Métricas: guion → muestra y muestra → pago; si muestra → pago < 3 %, la muestra pasa a pago simbólico.
- **El diferencial es la historia, no la cara**: hasta 2 personas (nombre + relación + edad), momento vital (7 opciones cerradas) y tono (3). Los nombres viajan como `{{NOMBRE}}`, `{{PERSONA1}}`, `{{PERSONA2}}`; la relación («su abuela») sí va al modelo porque no identifica a nadie.
- **Sin foto, aparcada con condiciones**: el decálogo de la AEPD (27-01-2026, recogido en `../CLAUDE.md`) prohíbe meter imágenes de personas en herramientas de IA sin encargado en la UE. Solo se reabre con tracción demostrada, Vertex AI en región UE, consentimiento expreso y registro de actividades. Además no diferencia (la usan CuentosIA, ToonyStory, Lullaby, Hekaya) y concentra las peores reseñas del sector.
- **Sin anuncios**: con un margen de 9-11 € y un CPA de 25-50 €, no cuadran. Canales: Etsy (principal), web propia, vídeo real, Pinterest, grupos de crianza.
- **Cobro: Stripe Managed Payments lo integra Edu más adelante** (decisión 2026-08-21): `api/checkout.js` y `api/webhook-stripe.js` son la costura, el resto del sistema no sabe nada de Stripe. Hasta entonces la web cobra **vía Etsy** (el botón «Completar el cuento» lleva a la ficha de Etsy con el token del cuento en la personalización) y el estado `full` se activa a mano desde la cola de revisión al ver el pedido de Etsy. Después, **solo Stripe Managed Payments** en la web (MoR; IVA 4 % del PDF como libro, 21 % los créditos) y **Etsy** como canal paralelo (18 % de comisión con IVA; declarar IA obligatoriamente; PDF < 20 MB; archivo adjunto al completar el pedido). **Polar descartado**: su AUP prohíbe servicios dirigidos a menores. Plan B: Creem.

### Producto

- **Formato**: **20 páginas** cuadradas 20×20 cm — portadilla + dedicatoria («Este cuento es de X», página propia) + 12 escenas de una página (ilustración arriba, texto de 60-90 palabras abajo) + 4 colorear con escenas del propio cuento + ficha de personajes + colofón con aviso de IA. **20 y no 18 porque es múltiplo de cuatro** (22-08): un libro encuadernado se hace con pliegos de cuatro páginas y las imprentas lo exigen — Blurb lo dice explícitamente. Las dos páginas que cierran el hueco no son relleno: la dedicatoria sale de debajo del título, y la ficha deja de compartir hoja con el colofón. `C.BOOK_PAGE_COUNT` es la única fuente y un test exige `% 4 === 0`. Imágenes a 1K: basta para pantalla e impresión en casa. Sin sangrado ni lomo. **Los textos propios del libro** (dedicatoria, «Así es X», colofón) van por `words(locale)` en `lib/pdf.js`: eran literales en español, así que el libro en inglés se entregaba con el colofón en español.
- **Reparto imagen/texto de la página de escena (27-08)**: **el cuerpo de letra se decide antes que
  la lámina, y es uno solo para todo el libro**. Se entregó un libro con la ilustración ocupando el
  **68 % del alto** y las doce páginas al suelo de **11 pt**, porque la búsqueda arrancaba en la
  lámina más grande posible y solo la encogía hasta que el texto cupiera *con la letra más pequeña
  permitida*: el texto nunca era un pretendiente, era el resto. Ahora `bookBodySize()` elige el
  cuerpo mayor (17 → 10 pt) con el que **todas** las páginas conservan lámina, y `sceneLayout()` le
  da a cada página la lámina que le sobre (44-58 % del alto). Mismo libro: **14 pt y lámina al 52 %**.
  Un cuerpo por libro y no por página, porque una página de cuatro líneas a 17 pt junto a otra de
  nueve a 13 pt parecen dos libros distintos; lo que varía de página a página en un álbum es cuánto
  ocupa el dibujo, no el tamaño de la letra.
  **La lámina encoge de ancho también.** Tres cosas no pueden ser ciertas a la vez con ilustraciones
  cuadradas: medida completa, recorte suave y sitio para leer. A medida completa y 1,32:1 hacen falta
  el 68 % del alto (el libro entregado); a medida completa y media altura sale un **1,73:1**, y un
  letterbox sobre estas acuarelas es lo que cortó cabezas en un libro anterior; una lámina cuadrada
  no recorta nada pero es el **22 % de la página** y el dibujo deja de ser el asunto. Así que la
  lámina mantiene su proporción (`ART_ASPECT` 1,32) y se hace más pequeña, centrada. **Lo que quita
  este peaje del todo no es maquetación: es dejar de generar arte cuadrado para un hueco que no lo
  es** — `lib/images.js` ya pasa un `aspect_ratio` al modelo.
- **Estilo visual**: colección «Acuarela» — acuarela infantil suave, línea de tinta ligera, paleta cálida limitada, papel visible, sin texto en la imagen. Sufijo de prompt inmutable (`STYLE` en `lib/collection.js`). Cambiarlo = colección nueva.
- **Listas del formulario (revisadas 2026-08-21)**: los *sitios* son sitios (fuera «fútbol», que era una afición colada entre lugares; dentro «El desierto»), ordenados del mundo del niño hacia afuera; las *aficiones* son cosas que un niño hace, porque la afición es lo que resuelve el conflicto en la página 12 (fuera «las plantas» y «las estrellas», dentro cantar, baloncesto, patinar, manualidades); las *relaciones* incluyen tío y tía. Todo sale de `lib/collection.js` → `scripts/build-options.js` → `assets/js/options.js`: **el formulario no se edita a mano**.
- **Edad del lector = longitud de la página**: cuatro bandas (`2-3`, `4-5`, `6-8`, `9-12`), cada una con `words` (lo que exige el validador), `target` (lo que se le pide al modelo, más estrecho para que un fallo pequeño no tire el cuento entero), `reading_hint` (registro) y `visual` (la edad que se dibuja). `C.ageBand(id)` nunca devuelve `undefined`: una banda desconocida cae a `6-8` y la antigua `3-5` se mapea a `4-5`, para que un pedido viejo se pueda revisar. El validador recibe el rango en `options.words`.
- **Estructura narrativa fija y validada por código**: setup → problem → ≥ 2 attempt → resolution; la afición del niño resuelve el conflicto; el momento fija el problema; la moraleja se muestra, nunca se enuncia. **Género del protagonista obligatorio** (el español concuerda; sin el dato el modelo lo inventa — medido). **«herida» fuera de la lista negra** (un ala herida es el argumento más común de la literatura infantil).
- **Muestra gratuita genérica**: además de la vista previa personalizada, la landing enseña un cuento de demostración con el nombre insertado al instante (coste cero, sin IA).

### Técnica

- **Galería de colorear (hecha 2026-08-21)**: 20 temas fijos en `lib/coloring.js`, dibujados una sola vez con `scripts/gen-coloring-gallery.js` (0,71 $ en total, modelo lite) y **servidos como estáticos** — `colorear/img/<slug>.png` (A4 300 dpi en blanco y negro puro), `-thumb.webp` y `colorear/pdf/<slug>.pdf`. Las 42 páginas HTML (ES + EN) las escribe `scripts/build-coloring-gallery.js` desde el catálogo, junto con `sitemap.xml` y `robots.txt`; se commitean. Sin base de datos y sin coste de ejecución. La captura de correo va a `/api/waitlist` con `reason: "gallery"`.

- **Texto**: OpenRouter con structured outputs (modelo por elegir en la fase 0). El prompt incluye **la forma exacta del JSON**: medido que un modelo que no aplica el schema (MiniMax) falla el 100 % sin ella y 0 % con ella. Coste < 0,02 $/cuento; se elige por español y fiabilidad, no por precio.
- ⚠️ **MiniMax `image-01` reexaminado y descartado otra vez (22-08, `docs/spike-minimax-2026-08-22.md`)**: el refuerzo de prompt de `../comic` (ancla al principio, negativos con nombre, paleta nombrada) **sí arregla la deriva de estilo**, pero la API rechaza más de una referencia (`image_reference must be one`), así que padres y abuelas solo existen como texto y cambian de cara en cada página. Probados y fallidos: bloque de personaje escrito por código desde el formulario, y encadenar cada página con la anterior (esto empeora, el error se acumula). Ahorro que se deja pasar: 0,42 € por libro, 4 % del margen. Se reabre solo si admite varias referencias.
- **Imagen: Nano Banana 2 (`google/gemini-3.1-flash-image`) vía OpenRouter**, medido el 21-08 con dos personajes: mismo personaje, misma acuarela, 0 bloqueos, 14 s, 0,07 $/imagen, cuadrado con `image_config.aspect_ratio: "1:1"`. La hoja de personaje entera va como única referencia (no se recorta). **MiniMax `image-01` descartado**: 1024 px, 40-65 s y la referencia se comía el estilo. **Seedream/fal.ai ya no hacen falta.** `lib/images.js` sigue escondiendo el proveedor tras `IMAGE_PROVIDER`; el VLM verifica personaje y estilo como red de seguridad.
- **Generación asíncrona por jobs** en tres tramos sobre la misma máquina de estados persistida en Supabase: `script` (texto → validar, repetible con la instrucción del usuario), `sample` (hoja → 2 escenas) y `full` (resto → line-art → PDF → revisión humana → email), más `retouch`. Reintento por paso y cron de barrido. Techo de coste por cuento: **1,50 €** sumando los dos tramos.
- **Contenido**: campos cerrados salvo nombres y dedicatoria; filtro local + modelo **antes de generar**; lista negra; segunda pasada del modelo; revisión humana en todo pedido pagado.
- **Colorear**: el line-art lo genera el modelo editando la ilustración; sharp solo limpia y umbraliza. Galería gratuita por tema como activo SEO **con captura de email**.
- **Privacidad**: ningún nombre viaja a la IA; sin fotos; datos personales a `null` al caducar el cuento (7 días sin pagar, 30 pagado); facturas 4-6 años.
- Stack: vanilla + Vercel Pro + Supabase compartido (schema `cuentos`) + **OpenRouter para texto e imagen** (una clave, guardrail de 5 $/día). Sin frameworks.
- **En local, `.env` manda sobre el entorno heredado** (`lib/env.js`): una clave vieja en las variables globales de Windows enmascaró la del proyecto el 21-08. En Vercel no hay fichero, así que allí mandan las variables de la plataforma.

## Fases (cada una termina usable)

0. **Spikes**: consistencia de imagen **y de estilo** en Seedream y Nano Banana, comparativa de modelos de texto por OpenRouter, solicitud de Stripe MP. (El POD sale del camino crítico; su script queda.)
1. **El mínimo que cobra**: formulario con personas/momento/tono → guion en `/c/<token>` (con cambios) → muestra ilustrada → pago → libro completo en la misma URL (con retoque); revisión humana; web ES/EN con muestra instantánea; tope diario; botón de interés por el impreso; 20 páginas de colorear gratis; ficha en Etsy.
2. **Colorear por créditos**: generador personalizado, créditos, galería a 50 temas, Pinterest.
3. **Campaña Navidad/Reyes**: 2-3 colecciones más, afiliación 20 %, vídeo real.
4. **SEO programático y LatAm**: temas × edades en ES/EN, precios en MXN/USD.
5. **Impreso** (solo si el botón de interés ≥ 25 %): PDF de imprenta, Gelato/Peecho, tracking. Todo lo investigado y los scripts quedan en el repo.

## Estado

- [x] Investigación de mercado y ranking (2026-08-20)
- [x] Investigación profunda: competencia, POD, modelos de IA, cobros/legal, canales (`docs/research-2026-08.md`)
- [x] Diseño aprobado y plan de 22 tareas (`docs/superpowers/`)
- [x] Giro a solo PDF con vista previa en URL temporal (mvp.md v2, revisión del spec y del plan, 2026-08-21)
- [x] Fase 0 — spikes (235 tests ✅; MiniMax descartado; **`gemini-3.1-flash-lite-image` para imagen y `gemini-2.5-flash-lite` para texto**, ambos medidos; prueba de extremo a extremo completa el 21-08: **53 céntimos de IA por libro**. Stripe MP sigue pendiente de JJ y no bloquea, porque el MVP cobra por Etsy)
- [ ] Fase 1 — mínimo que cobra (prueba: __ vistas previas / __ % conversión a pago / __ pagos / __ % interés impreso)
- [ ] Fase 2 — colorear por créditos
- [ ] Fase 3 — campaña Navidad/Reyes
- [ ] Fase 4 — SEO y LatAm
- [ ] Fase 5 — impreso (condicionada al botón de interés)

Al completar una fase, actualiza este checklist. Lo que afecte a los tres proyectos va en `../CLAUDE.md`.

## Nunca perder a quien ha pagado (22-08)

Un cliente que teclea mal su correo se perdía entero: ni libro, ni enlace, ni recordatorios. Tres redes, de automática a manual:

1. **Stripe sabe una dirección buena.** En `checkout.session.completed`, `customer_details.email` es donde acaba de llegar el recibo. Si no coincide con la nuestra, se guarda en `orders.paid_email` (migración `0003_paid_email`) y **la entrega va a las dos** (`recipientsOf` en `lib/email.js`). Automático, sin que el cliente haga nada.
2. **El panel repara y reenvía**: acciones `set_email` (cambia la dirección y reenvía el enlace que toque según el estado) y `resend` (reenvía a todas las que tengamos). Es el mostrador donde se arregla «no me ha llegado».
3. **Formulario de contacto** (`POST /api/contact` → `sendContact` → `CONTACT_EMAIL`, por defecto info@4bitsengineering.com) en el pie del visor, en todas las etapas. Lleva el token del cuento, que es lo que identifica el pedido sin preguntárselo. Un fallo al retransmitir se registra en los logs y al cliente se le dice que sí: contestar «algo ha fallado» a quien escribe porque algo ha fallado es la peor respuesta posible.

**El panel** (`/admin/`) tiene menú de secciones: **Hoy** (atascados + cola de revisión, con contador), **Cuentos** (todos, con filtro y ficha por pedido), **Dinero** (embudo y márgenes) y **Sistema** (integraciones y cobro manual). La sección elegida se recuerda en localStorage.
En pantalla estrecha la tabla de **Cuentos** deja de ser tabla: cada fila es una tarjeta con las
cabeceras convertidas en etiquetas (`data-label` + CSS), porque nueve columnas en un móvil eran una
barra de desplazamiento con lo interesante fuera de la pantalla.

## Cuando un libro se atasca (27-08)

Un libro pagado se quedó a medias durante una hora y **nada lo dijo**. Tres cosas se arreglaron, y las
tres importan por separado:

- **El montaje del PDF se pasaba de los 60 s.** No eran las imágenes (medido: 30 s con ellas y 30 s
  sin ellas). Era el maquetado: `sceneLayout` prueba ~30 alturas de ilustración y para cada una
  `fitSize` prueba 7 cuerpos de letra, así que **una página pedía el mismo salto de línea más de
  doscientas veces**, y cada vez se moldeaba el párrafo palabra a palabra con fontkit sobre una fuente
  **sin subset**. `wrap()` ahora se memoiza por fuente (`WRAP_CACHE`, un `WeakMap`): misma salida,
  30 s → 4 s. `test/pdf.test.js` pone un techo de 20 s para que la búsqueda cuadrática no vuelva.
- **Una ejecución que muere no dice nada, así que ahora se cuenta.** Vercel mata la función y no da
  tiempo a escribir el error: la fila queda en `running` con `error` vacío, fuera de la cola de
  revisión, y **cada visita del cliente pagaba otro intento condenado**. `runJob` lee el job *antes*
  de reclamarlo: si estaba en `running` con el candado caducado, la ejecución anterior murió → suma
  un intento, y a los tres el job pasa a `needs_review` con un error legible.
- **El panel era ciego a la mitad del problema.** Solo veía `needs_review`. Ahora `db.stuckJobs()`
  (pending/running, sin candado vivo, sin tocar en 5 min) alimenta una sección **«Atascados»** en
  *Hoy* con **Continuar** (empuja `/api/resume` con el token, igual que hace la página del cliente),
  **Empezar el paso de cero** y **Redibujar las que faltan**.

**`redraw` no es el retoque del cliente.** El retoque es uno, va incluido en el precio y es suyo.
`redraw` es la reparación de la tienda para una página que salió del catálogo (el proveedor caído, el
crédito agotado): olvida esos índices de `steps.pages.attempted` —que es justo lo que impedía volver
a intentarlos—, borra el PDF y la aprobación, y descuenta el fallback de `stories.fallbacks` para que
el guardián de «más de 2 páginas sin dibujar» no salte al reanudar.

**`retry` ya no ejecuta el trabajo dentro de la petición.** `/api/admin` tiene el mismo reloj de 60 s
que el paso que se atascó; ahora limpia el candado y devuelve el token para que el panel lo empuje
por lotes.

## Medición de audiencia (22-08)

El embudo se conocía **solo desde que existe un pedido**. Faltaba la mitad de arriba: si 300 visitas dan 3 cuentos, el problema es la landing y nada en la base de datos lo diría.

- **Propia, no Vercel Analytics**: ya hay base de datos y panel, y así los clics se **cruzan con los pedidos reales** en la misma tabla de conversión. Tabla `cuentos.events` (migración `0004_events`), `POST /api/track`, `assets/js/track.js` en las páginas públicas (nunca en `/admin`).
- ⚠️ **Toda tabla nueva necesita su `grant`**: el `grant all on all tables in schema` de la migración 0001 es una foto, no una regla, así que `events` nació sin permisos y fallaba con «permission denied» — que el 204 de `/api/track` esconde a propósito. La 0004 añade `alter default privileges` para que la próxima tabla no repita el viaje. Si algo escribe y no aparece: **mira los logs de Vercel, no la respuesta HTTP**.
- **Sin cookies, primera parte**: id de visita aleatorio en `sessionStorage` (muere con la pestaña), IP solo cifrada con `IP_SALT` y para frenar abusos, **referente reducido al dominio** (la búsqueda que trajo a alguien es texto que escribió), UTM limitado a source/medium/campaign, y `/c/<token>` se guarda como `/c` — el token es la llave del libro de alguien. Está descrito en la página legal.
- **Cuatro eventos y solo cuatro**: `view`, `cta`, `form_start`, `checkout_click`. El resto del embudo (piden guion → aprueban → pagan) sale de `orders`, que es un hecho y no un clic que ojalá se disparase.
- `lib/analytics.js` tiene la aritmética como funciones puras y testeadas; el panel lo pinta en la sección **Tráfico** (hoy / 7 / 30 días) con fuentes, páginas y dispositivos. `/api/track` responde **204 siempre**: medir no puede ser algo que el cliente note.

## Supabase (aplicado 2026-08-21)

- Proyecto compartido `rgpzrbwpyaewughahpgo` (el mismo del RPG y de otras apps). **Todo vive en el schema `cuentos`**: 9 tablas con RLS activo en todas y sin políticas salvo `coloring_pages`, que es la única de lectura pública. Migraciones aplicadas: `0001_cuentos_schema` y `0002_claim_job`.
- Bucket privado **`stories`** (25 MB por fichero) para hojas de personaje, páginas, líneas de colorear y PDF; se sirven por URL firmada. La galería gratuita **no usa bucket**: son ficheros estáticos en `colorear/`.
- ⚠️ **`cuentos` tuvo que añadirse a los *exposed schemas* de PostgREST** (`public, storage, ai_agents, falm, cuentos`). Si alguien reescribe esa lista desde el panel y lo quita, todas las funciones devuelven «Invalid schema: cuentos». Es aditivo: no afecta a las otras apps.
- `claimJob` va por la función `cuentos.claim_job(uuid,int)`, no por un UPDATE con filtros — ver el comentario de la migración 0002 y `docs/fase-0-resultados.md` §0.6.

## Vercel

- Proyecto `cuentos` (`prj_uYO3eSPFwizuU0QuIIofr86nqW2g`, equipo «Jose Juan Jimenez's projects», `team_KYUeymJfHRERJG11yR7W6qoF`), enlazado a `jotajota1302/microsaas` con `cuentos/` como raíz. Cada push a `main` despliega a producción. Alias de rama: `cuentos-git-main-jose-juan-jimenezs-projects.vercel.app`.
- ⚠️ **Máximo 12 funciones por despliegue en Hobby.** Con 13 ficheros en `api/` el despliegue falla entero (`exceeded_serverless_functions_per_deployment`) — pasó del 12 al 21-08 sin que nadie lo viera. Hay **7 funciones**: `order`, `story`, `admin`, `cron`, `webhook-stripe` y dos enrutadores, `flow.js` (revise/approve/checkout/resume) y `misc.js` (config/waitlist/print-interest/recover/job). Las URLs públicas no cambian: los `rewrites` de `vercel.json` mandan `/api/<nombre>` a la función que lo lleva con `?fn=<nombre>`, y `scripts/devserver.js` **lee esos mismos rewrites** para que local y producción no diverjan. `test/routes.test.js` falla si un rewrite apunta a un fichero que no existe o a un `fn` que nadie sirve.
- **Trabajo por lotes** (`lib/steps.js`): 12 ilustraciones no caben en una función. Los pasos `pages` (4 páginas) y `lineart` (2 dibujos) hacen un lote, lo persisten y devuelven `partial`; el job queda `pending` sin candado. Quien mire empuja: el visor hace *polling* de `POST /api/resume` con barra de progreso, el panel igual tras marcar pagado, y el cron empuja cada job hasta agotar su presupuesto (`CRON_BUDGET_MS`, 45 s). El webhook de Stripe **encola y responde al instante** (si tarda, Stripe reintenta y cada reintento rehace el libro).
- **El equipo está en Hobby** (2026-08-21). Por eso cron **diario** (`0 6 * * *`) y `maxDuration: 60`. Con Pro: cron `* * * * *` (el cliente que cierra la pestaña espera minutos en vez de hasta un día) y `maxDuration: 300`. Hobby además prohíbe el uso comercial: no se vende desde Hobby.
- ⚠️ **Los despliegues van por `git push`, nunca por `vercel --prod` desde esta carpeta.** El *Root Directory* del proyecto es `cuentos` **relativo a la raíz del repo**, así que lanzar la CLI desde dentro de `cuentos/` falla en 3 s con `NOW_SANDBOX_WORKER_ROOTDIR_NOT_EXIST` ("Root Directory does not exist") y deja un despliegue en rojo aunque producción esté perfectamente. Pasó dos veces el 21-08. `vercel env` sí funciona desde aquí (no construye nada).
- **Variables de entorno**: `node scripts/push-env.js` (simulacro) y `--apply` las copia de `.env` a producción; requiere `vercel login` una vez. Nunca imprime valores, y `PUBLIC_BASE_URL` la pone al dominio de producción a propósito (en `.env` apunta a localhost). Lista: `OPENROUTER_API_KEY`, `TEXT_PROVIDER`, `TEXT_MODEL`, `IMAGE_PROVIDER=openrouter`, `OPENROUTER_IMAGE_MODEL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `PUBLIC_BASE_URL`, `ADMIN_TOKEN`, `CRON_SECRET`, `IP_SALT`, `MAX_SCRIPTS_PER_DAY`, `MAX_SAMPLES_PER_DAY`, `MAX_SCRIPTS_PER_IP`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ETSY_LISTING_URL` (cuando exista), `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` (filtro de bots; sin ellas no se exige y los topes son la única defensa).
- **Stripe**: sin `STRIPE_WEBHOOK_SECRET` el botón de tarjeta no aparece (`canPayByCard` exige las dos claves): cobrar sin poder entregar sería lo peor que puede pasar. El secreto sale de dar de alta el endpoint `https://<dominio>/api/webhook-stripe` con el evento `checkout.session.completed`. Las claves de prueba actuales son de **4 Bits Engineering (Edu)**: quien cobra es quien factura y declara el IVA — para vender de verdad hacen falta claves de la cuenta de JJ.

## Convenciones

- Código y comentarios en inglés; textos del producto en español e inglés.
- `npm test` (Node 22, `node --test "test/**/*.test.js"`; en Windows `--test test/` no funciona). Nada entra sin su test.
- Esquema JSON del cuento en `schema/`; `lib/validate-story.js` es la **única** puerta hacia el visor y el PDF.
- Ningún dato personal en los prompts, ninguna foto, borrado al caducar.
- El repo git es el padre (`microsaas/`); no crear repos anidados. Repo público: nada de secretos ni datos reales. `out/` (imágenes y PDF generados) y `.env` están ignorados.
