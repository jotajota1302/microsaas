# Proyecto: Cuentos personalizados en PDF

Micro-SaaS B2C, español primero (y en inglés): cuentos infantiles personalizados **en PDF**, generados como JSON validado + ilustraciones de estilo fijo. El diferencial no es el aspecto del niño sino **su vida**: su familia y amigos como personajes, el momento que está viviendo y el tono. El gancho es una **vista previa personalizada en una URL temporal** generada antes de cobrar. Sin imprenta ni envíos en el MVP (decisión 2026-08-21). Reutiliza el motor del RPG (`../../rpg-narrativo/`): IA que genera datos bajo schema, validador como única puerta, catálogo de estilo fijo.

**Lee antes de nada**: `docs/mvp.md` (alcance y precios, **v2**), `docs/superpowers/specs/2026-08-20-cuentos-design.md` (diseño técnico; **la revisión del 21-08 al final prevalece**), `docs/fase-0-resultados.md` (lo medido contra las API reales), `docs/research-2026-08.md` (investigación con ~60 fuentes) y `../CLAUDE.md` (stack, privacidad con IA, legal: autoridad compartida con `viajeros/` y `kit-local/`).

## Decisiones ya tomadas (no reabrir sin preguntar)

### Modelo de negocio (2026-08-21)

- **Solo PDF en el MVP, a 12,90 € en español y 14,90 € en inglés** (fijado con la investigación de Etsy: el tramo de 5-7 $ es «IA commodity»; el medio, 15-20 $). Si la prueba da ≥ 5 ventas, ES sube a 14,90 €. Cero envíos, cero logística; el único trabajo manual son ~5 minutos de revisión por pedido pagado. El impreso **no se construye**: un botón «Quiero el libro impreso» mide la demanda; con ≥ 25 % de compradores se reabre (fase 5).
- **Embudo en dos puertas, generado antes de cobrar, en una URL temporal** (`/c/<token>`, misma app de Vercel, sin despliegue por cliente): (1) **guion** — el texto completo (≈ 0,01 €), con **hasta 2 rondas de «cambiar algo»** (instrucción corta moderada; el modelo reescribe, el validador decide); (2) **muestra ilustrada** — solo tras aprobar el guion: portadilla + ficha + **2 escenas, nunca la resolución** (≈ 0,21 €); (3) **pago** — el resto + colorear + PDF + **1 retoque incluido** (3 ilustraciones o 1 página). Enlace por email; caduca a 7 días (30 pagado); recordatorios días 5 y 7. El curioso cuesta un céntimo.
- **Techos de gasto, de fuera adentro**: guardrail de OpenRouter **5 $/día** en la clave; `MAX_SCRIPTS_PER_DAY` 200, `MAX_SAMPLES_PER_DAY` 40; Turnstile; 3 guiones por IP y día. Al tocar techo, lista de espera. La web **nunca se apaga**. Métricas: guion → muestra y muestra → pago; si muestra → pago < 3 %, la muestra pasa a pago simbólico.
- **El diferencial es la historia, no la cara**: hasta 2 personas (nombre + relación + edad), momento vital (7 opciones cerradas) y tono (3). Los nombres viajan como `{{NOMBRE}}`, `{{PERSONA1}}`, `{{PERSONA2}}`; la relación («su abuela») sí va al modelo porque no identifica a nadie.
- **Sin foto, aparcada con condiciones**: el decálogo de la AEPD (27-01-2026, recogido en `../CLAUDE.md`) prohíbe meter imágenes de personas en herramientas de IA sin encargado en la UE. Solo se reabre con tracción demostrada, Vertex AI en región UE, consentimiento expreso y registro de actividades. Además no diferencia (la usan CuentosIA, ToonyStory, Lullaby, Hekaya) y concentra las peores reseñas del sector.
- **Sin anuncios**: con un margen de 9-11 € y un CPA de 25-50 €, no cuadran. Canales: Etsy (principal), web propia, vídeo real, Pinterest, grupos de crianza.
- **Cobro: Stripe Managed Payments lo integra Edu más adelante** (decisión 2026-08-21): `api/checkout.js` y `api/webhook-stripe.js` son la costura, el resto del sistema no sabe nada de Stripe. Hasta entonces la web cobra **vía Etsy** (el botón «Completar el cuento» lleva a la ficha de Etsy con el token del cuento en la personalización) y el estado `full` se activa a mano desde la cola de revisión al ver el pedido de Etsy. Después, **solo Stripe Managed Payments** en la web (MoR; IVA 4 % del PDF como libro, 21 % los créditos) y **Etsy** como canal paralelo (18 % de comisión con IVA; declarar IA obligatoriamente; PDF < 20 MB; archivo adjunto al completar el pedido). **Polar descartado**: su AUP prohíbe servicios dirigidos a menores. Plan B: Creem.

### Producto

- **Formato**: 18 páginas cuadradas 20×20 cm — portadilla + 12 escenas de una página (ilustración arriba, texto de 60-90 palabras abajo) + 4 colorear con escenas del propio cuento + ficha de personajes y colofón con aviso de IA. Imágenes a 1K: basta para pantalla e impresión en casa. Sin sangrado ni lomo.
- **Estilo visual**: colección «Acuarela» — acuarela infantil suave, línea de tinta ligera, paleta cálida limitada, papel visible, sin texto en la imagen. Sufijo de prompt inmutable (`STYLE` en `lib/collection.js`). Cambiarlo = colección nueva.
- **Estructura narrativa fija y validada por código**: setup → problem → ≥ 2 attempt → resolution; la afición del niño resuelve el conflicto; el momento fija el problema; la moraleja se muestra, nunca se enuncia. **Género del protagonista obligatorio** (el español concuerda; sin el dato el modelo lo inventa — medido). **«herida» fuera de la lista negra** (un ala herida es el argumento más común de la literatura infantil).
- **Muestra gratuita genérica**: además de la vista previa personalizada, la landing enseña un cuento de demostración con el nombre insertado al instante (coste cero, sin IA).

### Técnica

- **Texto**: OpenRouter con structured outputs (modelo por elegir en la fase 0). El prompt incluye **la forma exacta del JSON**: medido que un modelo que no aplica el schema (MiniMax) falla el 100 % sin ella y 0 % con ella. Coste < 0,02 $/cuento; se elige por español y fiabilidad, no por precio.
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
- [ ] Fase 0 — spikes (motor: 123 tests ✅; MiniMax medido y descartado; **Nano Banana 2 vía OpenRouter elegido**; modelo de texto en curso; Stripe MP pendiente de JJ)
- [ ] Fase 1 — mínimo que cobra (prueba: __ vistas previas / __ % conversión a pago / __ pagos / __ % interés impreso)
- [ ] Fase 2 — colorear por créditos
- [ ] Fase 3 — campaña Navidad/Reyes
- [ ] Fase 4 — SEO y LatAm
- [ ] Fase 5 — impreso (condicionada al botón de interés)

Al completar una fase, actualiza este checklist. Lo que afecte a los tres proyectos va en `../CLAUDE.md`.

## Vercel

- Proyecto `cuentos` (`prj_uYO3eSPFwizuU0QuIIofr86nqW2g`, equipo «Jose Juan Jimenez's projects», `team_KYUeymJfHRERJG11yR7W6qoF`), enlazado a `jotajota1302/microsaas` con `cuentos/` como raíz. Cada push a `main` despliega a producción. Alias de rama: `cuentos-git-main-jose-juan-jimenezs-projects.vercel.app`.
- **El equipo está en Hobby** (2026-08-21). `vercel.json` lleva por eso cron **diario** (`0 6 * * *`) y `maxDuration: 60`. El diseño necesita **Pro**: cron cada minuto (reanudar jobs, recordatorios) y 300 s en `order`/`approve`/`admin` (el tramo `full` son ~14 imágenes + PDF). Al pasar a Pro: cron `* * * * *` y `maxDuration: 300`. Hobby además prohíbe el uso comercial: no se vende desde Hobby.
- Variables de entorno necesarias en Vercel: `OPENROUTER_API_KEY`, `TEXT_MODEL`, `IMAGE_PROVIDER=openrouter`, `OPENROUTER_IMAGE_MODEL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `PUBLIC_BASE_URL`, `ADMIN_TOKEN`, `CRON_SECRET`, `ETSY_LISTING_URL` (cuando exista), `IP_SALT`.

## Convenciones

- Código y comentarios en inglés; textos del producto en español e inglés.
- `npm test` (Node 22, `node --test "test/**/*.test.js"`; en Windows `--test test/` no funciona). Nada entra sin su test.
- Esquema JSON del cuento en `schema/`; `lib/validate-story.js` es la **única** puerta hacia el visor y el PDF.
- Ningún dato personal en los prompts, ninguna foto, borrado al caducar.
- El repo git es el padre (`microsaas/`); no crear repos anidados. Repo público: nada de secretos ni datos reales. `out/` (imágenes y PDF generados) y `.env` están ignorados.
