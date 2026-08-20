# Portafolio de micro-SaaS — investigación y plan (2026-08-20)

Objetivo: lanzar **muchos micro-SaaS pequeños en paralelo**, de coste casi nulo, con ingresos recurrentes (no pelotazos), aprovechando lo que ya tenemos: IA (MiniMax/Claude con structured outputs, imagen, música), Vercel, Supabase, QR, impresión 3D, gusto por música/imagen, y un OpenClaw operativo en un PC. Mercado: mundo entero en EN+ES, con sede en España.

Este documento resume cinco investigaciones con fuentes (infra, ideas con ingresos reales, distribución, cobros/legal, Verifactu/huella de carbono). Etiquetas: **[V]** verificado en fuente oficial/primaria · **[P]** prensa/vendor 2025-26 · **[?]** sin verificar.

---

## 0. Resumen ejecutivo

1. **La infra no es el problema; la distribución sí.** 10 micro-SaaS con 50k visitas y 5k llamadas de IA al mes cuestan **25-35 $/mes** (Vercel Pro + Supabase Free + IA PAYG + dominios). Pero el 70 % de los micro-SaaS no pasa de 500 $/mes y la mediana hasta 1.000 $/mes es de 12-18 meses.
2. **Vercel Hobby prohíbe expresamente el uso comercial** (incluso "anunciar la venta de un producto"). Hace falta **Pro (20 $/mes)**; un solo asiento sirve para todo el portafolio. [V]
3. **La publicidad no es el modelo.** Ningún caso de éxito encontrado vive de ads; todos cobran 29-49 $/mes (B2B) o un pago único de 5-70 $ (B2C) y con plan anual. Ads solo en landings SEO de herramientas gratuitas como gancho.
4. **Cobrar al mundo con mínima administración = Merchant of Record** (Polar.sh o Stripe Managed Payments, ~5 % + 0,50 $). Te quita OSS, IVA británico y sales tax. Alta en Hacienda (036) desde el primer euro; RETA con tarifa plana en cuanto haya ingresos recurrentes.
5. **Ranking de apuestas** (detalle en §3): (A1) registro de viajeros SES.Hospedajes con IA, pago por parte · (A2) cuentos/colorear personalizados ES-first con libro impreso · (A3) "kit negocio local": placa QR impresa en 3D + página dinámica + embudo de reseñas, puerta de entrada al agente de soporte · Tier B: canción-regalo + placa, photo wall de eventos, relieves/litofanías IA, CV→tarjeta 3D · Tier C (regulatorio): checker Verifactu, informe de huella 1+2 por PDF.
6. **Evitar con datos**: generador de QR genérico, tarjeta digital NFC suelta, carta digital suelta, retratos IA genéricos, lifetime deals, "free forever", y **no ser productor de software Verifactu** (150.000 € de sanción por versión, responsabilidad personal).
7. **OpenClaw**: capa de operaciones interna (soporte, avisos, contenido) desde el día 1; como servicio a clientes solo en instancias aisladas por cliente y con herramientas de solo lectura.
8. **Noticia que condiciona**: la API de música de MiniMax **deja de admitir nuevos usuarios el 20-08-2026** (solo siguen cuentas que ya hayan pagado llamadas de música). Comprobar nuestra cuenta antes de apostar por la canción-regalo. [V]

---

## 1. Restricciones verificadas

### 1.1 Infraestructura

| Pieza | Hecho | Implicación |
|---|---|---|
| **Vercel Hobby** | "Restricted to non-commercial personal use only… Advertising the sale of a product or service; The inclusion of advertisements" cuentan como comercial (Fair Use, 2026-07-29). Al exceder límites: esperar 30 días o pausa del deployment. [V] | Portafolio → **Pro obligatorio**. |
| **Vercel Pro** | 20 $/asiento/mes con 20 $ de crédito de uso; 1 TB transferencia, 10 M edge requests, 1 M invocaciones; proyectos y dominios **ilimitados**; wildcard `*.dominio` en todos los planes; **Spend Management** con pausa automática al 100 %. [V] | Un Pro, 20 proyectos, `u.dominio.com/<cliente>` o `<cliente>.dominio.com`. |
| **Cloudflare Workers/Pages** | Free: 100k peticiones/día, estáticos ilimitados, 100 proyectos; uso comercial tolerado; 5 $/mes el plan de pago. Zona gris: cláusula que prohíbe "procesar o recoger datos de tarjeta" en plan gratuito → usar Checkout alojado del MoR. [V/P] | Alternativa a 5-15 $/mes si Vercel Pro molesta. Netlify Free (300 créditos, pausa todo) no sirve. |
| **Supabase** | Free: 2 proyectos activos, **pausa tras 1 semana sin uso**, 500 MB, 50k MAU, login anónimo incluido. Pro 25 $/mes (8 GB, 100k MAU, sin pausa, spend cap). Cada proyecto extra en Pro ≥10 $/mes. [V] | **Un proyecto compartido, un schema por producto** (como ya hacemos). RLS en todo, grants por schema, región UE. Pasar a Pro cuando haya ingresos. |
| **MiniMax PAYG** | M3: 0,30 $/M entrada, 1,20 $/M salida; image-01: 0,0035 $/imagen; speech 60-100 $/M chars. Límites: M3 200 RPM, image 10 RPM. [V] | Céntimos por usuario. |
| **MiniMax Coding/Token Plan** | FAQ oficial: "designed for individual, interactive developer use… recommended to use pay-as-you-go for production use"; throttling dinámico en picos. [V] | La suscripción para nuestro agente de código; **los productos van por PAYG**. |
| **MiniMax música** | "Starting August 20, 2026, the paid APIs (Music Generation and Lyrics Generation) will no longer be available to new users; existing paying users can continue". [V] | Verificar si nuestra cuenta conserva acceso; si no, alternativa (Suno API no pública; open-source MiniMax Music 3 en HF) o descartar la canción-regalo. |
| **Coste total** | 10 productos, 50k visitas, 5k llamadas/mes: **25-35 $/mes** austero; 80-100 $/mes con Supabase Pro + imágenes. | La infra no decide nada; el tiempo y la distribución sí. |

### 1.2 Legal y fiscal (España → mundo) — informativo, no asesoramiento

- **Hacienda**: alta censal **modelo 036** (el 037 desapareció en feb-2025) antes de la primera venta. Gratis. Trimestrales 303 + 130, anual 390 + Renta. [V]
- **RETA**: sin umbral legal de euros; la **STS 941/2025** (10-jul-2025) fija que ingresos < SMI no excluyen por sí solos la habitualidad. Suscripciones recurrentes = continuidad → posición defendible: **tarifa plana 80 €/mes (~89 con MEI) 12 meses**, prorrogable si rendimientos < SMI. Compatible con estar asalariado (pluriactividad, excluyente con tarifa plana: elegir). Cooperativas de facturación: no recomendables (caso Factoo, STS 2022). [V/INCIERTO]
- **IVA digital**: umbral 10.000 €/año intracomunitario → OSS (035/369). Reino Unido exige registro desde la primera venta B2C. **Con Merchant of Record el MoR es el vendedor legal**: tú le facturas B2B y te olvidas de OSS/UK/US sales tax. [V]
- **Pagos**: Polar.sh (Starter gratis, 5 % + 0,50 $; alta rápida; orientado a devs) o **Stripe Managed Payments** (MoR de Stripe, España elegible, ≈5 % + 0,25 €, solo digital, solo Checkout/Payment Links, revisión de elegibilidad). Lemon Squeezy en "modo mantenimiento" migrando a Stripe MP → evitar altas nuevas. Paddle rechaza indies sin historial y no acepta productos < 10 $. Gumroad ~13 %. **Ningún MoR cubre objetos físicos** → Stripe normal/Etsy con IVA español. [V/P]
- **Web**: aviso legal LSSI art. 10 (nombre, NIF, domicilio, email); privacidad + registro de actividades (**Facilita_RGPD** de la AEPD, gratis); cookies solo si hay analítica/ads de terceros, con "Rechazar" al mismo nivel; AdSense en EEE exige **CMP certificada TCF**. DPAs con Supabase (región UE), Vercel, MoR. [V]
- **MiniMax y RGPD**: datos en EE. UU./Singapur, **sin DPA público localizado**. Mitigación obligatoria: **no enviar datos personales al modelo** (ni email ni IDs; solo contenido anonimizado), documentarlo y listar a MiniMax como encargado. [INCIERTO]
- **Desistimiento 14 días**: descargas → checkbox no premarcado "consiento el inicio inmediato y pierdo el derecho" + email de confirmación; SaaS por suscripción → el consumidor conserva los 14 días (prorrata si pidió empezar). Botón "desistir" visible desde 19-06-2026 (Directiva 2023/2673; transposición española pendiente). Con MoR, su checkout lo gestiona. [V/INCIERTO]
- **Físico (3D) a la UE**: **GPSR** desde 13-12-2024: tú eres el operador responsable (sin coste extra); inserto con nombre, dirección, email, lote, advertencias en el idioma del comprador; dossier técnico de 1 página por modelo; sección "EU product compliance" en Etsy. Sin CE para llaveros/placas de adulto; **evitar diseños con apariencia de juguete** (<14 años → Directiva juguetes). Envases: inscripción RPP (MITECO) + Ecoembes Comerciales + declaración anual simplificada (<20 €/año, 2-3 h de trámite). [V]
- **Verifactu**: aplazado por RD-ley 15/2025 → **sociedades 1-ene-2027, autónomos 1-jul-2027**. Elegir ya software compatible para nuestra propia facturación. [V]
- **Coste año 1**: ≈1.100-1.500 € (casi todo RETA) + 5-6 % de comisiones.

### 1.3 Distribución — qué funciona de verdad en 2026

- **Product Hunt**: solo ~10 % de lanzamientos "Featured"; sirve para backlink y badge, no para usuarios. [P]
- **Reddit** (r/SideProject, r/microsaas, r/IMadeThis, r/AlphaAndBetaUsers; r/SaaS 1 post/60 días): el único canal gratuito con 1.000+ visitas realistas por lanzamiento, en formato historia. Una sola persona "builder" que publica muchas cosas (build in public), nunca cuentas falsas por producto. [P]
- **Show HN**: solo herramientas de desarrollador usables sin registro. [P]
- **Vídeo corto** (TikTok/Reels/Shorts): demo de 20-30 s resolviendo un problema, 2-5 posts/semana mínimo, 30-60 días de rampa. Tenemos el stack de MoneyPrinterTurbo para faceless; HeyGen (29 $/mes) para doblar EN/ES. Español: 350 M usuarios TikTok en LatAm + España con poca oferta SaaS. [P]
- **SEO de herramienta gratuita** (+ programmatic, EN y `/es/` con hreflang): el canal que **compone** entre productos, pero no da señal hasta el mes 4-6. Publicar la página el día 1, juzgarla en el mes 4. Los AI Overviews bajan el CTR (15 % → 8 %): no construir nada que dependa solo de tráfico de búsqueda. [P]
- **Afiliados**: 30 % recurrente es el estándar; Polar/Lemon tienen hub integrado sin cuota; Rewardful 49 $/mes. Es infraestructura, no canal: no hace nada hasta reclutar afiliados. Nano-creadores: 5-25 € por post en España (80-150 € realista); mejor ofrecerles acceso gratis + afiliación. [P]
- **Ads**: CPC España 0,8-2,5 € (Google), Meta ~0,5-1,1 €; mitad que EE. UU. Con precio < 10 €/mes no salen. Solo 50 € en Meta/TikTok ES/LatAm para leer conversión de landing con tráfico frío. [P]
- **Lifetime deals / AppSumo**: se quedan el 70 %, ingresos del marketplace −50 % 2024-25, y cada cliente LTD es soporte a 0 € para siempre. Evitar. [P]
- **Físico**: Etsy ~14 % en comisiones para un vendedor español (+15 % offsite ads), 86 M compradores pero GMS plano; **MakerWorld** (Bambu) paga en efectivo por descargas (Exclusive Program, 0,066 $/punto) y Printables da filamento; ambos son distribución gratuita y páginas que rankean → el embudo más barato para cualquier producto QR+3D. [P]

---

## 2. Tesis del portafolio

**Chasis común** (se construye una vez, lo usan todos):

- Vercel Pro (un asiento) + Supabase compartido (schema por producto, `auth.users` común) + MoR (Polar o Stripe MP) con webhooks → tabla `billing` común.
- **Host de enlaces/QR dinámicos** (`q.dominio.com/<id>` con analítica de escaneos): componente reutilizado por A3, B1, B2, B4 y la placa de reseñas.
- Pipelines de IA con **validador primero** (la regla de oro del RPG: la IA genera datos, el código decide), sin datos personales hacia MiniMax.
- Landing bilingüe EN/ES con plantilla, precio visible, checkout desde el día 1, UTM en todo, PostHog/umami.
- **OpenClaw como capa de operaciones** (§4): alertas de pagos, triaje de soporte, cola de contenido, informe semanal por producto.

**Reglas del portafolio** (sacadas de los datos):

1. Nunca "free forever": hard paywall o pago único; la prueba gratis, si la hay, con tarjeta (31 % vs 9 % de conversión).
2. Precio B2B 29-49 €/mes con anual; B2C pago único 5-70 € o créditos. Nunca < 10 €/mes sin plan anual.
3. Máximo **2-3 tests simultáneos** (las cuentas de Reddit/TikTok se queman si publicas 10 productos distintos).
4. Cada producto sale con **una página de herramienta gratuita** (activo SEO) aunque el producto muera.
5. Ciclo de 2 semanas y < 100 € por producto (§5), decisión con umbrales escritos antes de lanzar.
6. Producto muerto = dominio y página SEO vivos (coste ≈ 0), código archivado.

---

## 3. Ranking de apuestas

### Tier A — lanzar primero (evidencia de ingresos + encaje con lo que tenemos)

**A1. Partes de viajeros SES.Hospedajes con IA (B2B, pago por uso)**
- Qué: el gestor de apartamentos turísticos fotografía el DNI/pasaporte (o el huésped hace check-in desde un enlace/QR), la IA extrae los campos con structured output, se genera el XML del RD 933/2021 y se envía al Ministerio en < 24 h. iCal para reservas.
- Por qué: **obligatorio desde 2-dic-2024 con multas**; competidor a **0,95 €/parte sin cuota** con ~380 alojamientos (≈11k €/mes estimado [?]); PMS grandes cobran 15-30 €/mes por el conector. Es exactamente nuestro músculo (extracción estructurada + validador). Churn bajo, pago por uso evita fatiga de suscripción.
- Precio: 0,95-1,20 €/parte o 5 €/alojamiento/mes. Validación: 50 emails fríos a gestores pequeños (no a hosts en PMS grandes).
- Riesgos: endpoints regionales (Mossos, Ertzaintza, Policía Foral), exactitud legal, que los PMS lo incluyan gratis. Datos personales sensibles → **el OCR de documentos no puede ir a MiniMax sin DPA**: usar Claude/OpenAI con DPA UE o OCR local; RGPD impecable (encargado de tratamiento del alojamiento).

**A2. Cuentos y páginas para colorear personalizados, ES-first, con libro impreso**
- Qué: reutiliza el generador de capítulos (JSON validado + imágenes con personaje consistente) para cuentos infantiles con el nombre/foto del niño; páginas para colorear por créditos; upsell **libro impreso por POD europeo** (24-35 €).
- Por qué: ColorBliss 4k $/mes en solitario con SEO de cola larga (9 $/20 créditos); Wonderbly (libro personalizado) vendido por 99 M€, 85 % internacional; el español de cola larga ("dibujos para colorear de…") está poco disputado [?]. Margen altísimo (imagen a 0,0035 $).
- Precio: 4,99 € digital, 24,90 € impreso, créditos; una vista previa gratis, nada más.
- Riesgos: competencia alta en digital-only en inglés; calidad del POD; contenido infantil → moderación.

**A3. "Kit negocio local": placa QR impresa en 3D + página dinámica + embudo de reseñas (entrada al B2B local)**
- Qué: el bar/peluquería/clínica compra una **placa o soporte 3D** (reseñas Google, WiFi, Bizum, carta con alérgenos) a 20-35 €; el QR apunta a una página dinámica nuestra (editable para siempre, analítica de escaneos); la versión Pro (9-19 €/mes) añade embudo de reseñas (los descontentos van a un formulario privado, los contentos a Google) con **respuestas a reseñas redactadas por IA**; la carta digital con alérgenos OCR de la carta en papel es un módulo, no el producto.
- Por qué: es la idea original QR+3D reencuadrada para no competir con 5 generadores gratuitos de QR→STL ni con 200 vendedores de tarjetas NFC; el hardware vende (Amazon/Etsy llenos de soportes NFC/QR a 15-30 $), lo recurrente es la página + el embudo; y es la **puerta natural al agente de atención** (§4) a 49 €/mes, que es el ingreso de verdad.
- Canal: Etsy/Amazon Handmade + MakerWorld/Printables con el modelo gratis (QR que apunta a nuestro configurador) + puerta a puerta en el barrio (validación más barata que existe).
- Riesgos: commodity en hardware; hay que ganar por diseño, tiempo de entrega en España/UE y por el software.

### Tier B — validar con landing/Etsy antes de construir

- **B1. Canción-regalo + placa QR/onda sonora 3D** (cumpleaños, bodas, San Valentín, Día de la Madre). Letra en español como foso; Songfinch cobra 29,99 $ la instantánea y 249-399 $ la humana; Suno 300 M$ ARR demuestra la categoría; ingresos indie **sin verificar**. Pago único 19-39 € + placa 29-49 €. **Condicionado a la API de música** (§1.1). Validar listando la placa en Etsy y midiendo.
- **B2. Photo wall de eventos por QR + vídeo-resumen IA** (bodas, comuniones, bautizos). Reutiliza QR + Storage + imagen/música. 39-79 € por evento, álbum impreso de upsell. 8+ competidores, nadie domina comunión/bautizo en España; matar si < 10 eventos pagados en 60 días.
- **B3. Foto → relieve/litofanía "diseño original" para vendedores de Etsy** (suscripción 5-50 $/mes tipo ItsLitho). Etsy exige diseños originales desde jun-2025 (los STL descargados no valen) → la generación IA cobra valor; tiendas de litofanías facturan 1,8-9k $/mes. Nuestra impresora hace fulfilment España/UE.
- **B4. Perfil/CV → página dinámica → tarjeta 3D** (la idea de la conversación inicial). Mantenerla como **SKU de A3/B3**, no como producto: la tarjeta digital es un mercado con 200+ vendedores y 22 % de churn; el IA-parseo del CV (PDF de LinkedIn → página) es el único diferencial. El CV no cabe en el QR; LinkedIn no tiene API de perfil.

### Tier C — regulatorio/oportunista (España)

- **C1. "¿Estoy obligado a Verifactu?" — checker + asistente IA + comparador de software** (afiliación a Billin/Contasimple/Holded, leads a gestorías). Confusión masiva documentada (ATA, Fedepesca, el "agujero Excel"), cero responsabilidad de productor, coste nulo, pico natural ene-jul 2027. Monetización débil y caduca tras 2027: hacerlo como activo SEO, no como producto principal.
- **C2. Informe de huella de carbono alcances 1+2 a partir de facturas PDF (luz/gas/gasóleo) con factores MITECO + plan de reducción + VSME básico, pago por informe 49-149 €.** Único hueco de precio bajo Manglai (cientos €/mes) y Zeolos (4.400 € el proceso). El comprador micro llega **empujado por un pliego, un banco (Eco-Track) o un cliente grande**: compra puntual, no suscripción. Declarar siempre "estimación con factores oficiales, no verificada".
- **C3. Migración Excel/Word → SIF certificado** (IA parsea facturas históricas, clientes y productos y los carga por API en Billin/Holded). No emite registros fiscales (el SIF destino es el productor). Zona gris si el flujo se acerca a "emitir" facturas: no cruzar esa línea.
- **Descartado**: ser productor de SIF Verifactu (declaración responsable por versión, 150.000 € por ejercicio y sistema, responsabilidad personal; mercado ya a 6-10 €/mes y app gratuita de la AEAT); generar QR Verifactu para facturas manuales (**prohibido**); etiquetas/sellos propios de "sostenible"/"neutro en carbono" (práctica desleal desde 27-09-2026 sin certificación de tercero); badge "web carbono neutral" (saturado y ahora ilegal por compensación).

### Evitar (con evidencia)

Generador de QR genérico (Hovercode: 5.000 visitas/día → ~150 $/mes) · tarjeta digital NFC suelta · carta digital suelta (10-30 €/mes, competencia española masiva) · retratos IA genéricos (Lensa, copias) · wrappers horizontales de IA (Jasper −60 %) · herramientas solo con ads (AI Overviews) · LTD/AppSumo · mensajes cifrados por QR para WhatsApp (WhatsApp ya cifra; fricción; ads + privacidad no casan) · Kit Digital como dependencia (cerrado 31-10-2025; sin categoría de huella) · overlays de accesibilidad (la Comisión los rechaza; micro-empresas exentas de la EAA).

---

## 4. OpenClaw en el negocio

**Uso 1 — operaciones internas (desde el día 1, recomendado).** OpenClaw fue diseñado para un usuario y muchos canales: exactamente nuestro caso. Webhooks del MoR/Supabase → aviso por Telegram de altas, bajas, pagos fallidos con respuesta propuesta; buzón de soporte de todos los productos → triaje + borrador con contexto del usuario (lee Supabase), aprobación con un "ok"; cola de contenido diario por producto (vídeo/post EN+ES); informe semanal de métricas por producto para decidir matar/seguir. Esto es lo que hace sostenible un portafolio para una persona sola.

**Uso 2 — agente de atención para clientes (el upsell de A3, con reglas).** Compartir la instancia personal con desconocidos es un fallo de seguridad por diseño (prompt injection, skills, tus credenciales; avisos de seguridad recientes en plugins). Reglas: **una instancia aislada por cliente** (VPS 5 €/mes), un solo canal, credenciales propias, cero acceso a nuestra infra; **Telegram o API oficial de WhatsApp Business** para clientes (los puentes no oficiales arriesgan baneo del número); **herramientas de solo lectura** (horarios, reservas, FAQ, estado de pedido); cualquier acción que escribe pasa por nuestro backend con validación, como el validador del RPG. Precio 49-99 €/mes. Esto conecta con el estudio de julio (`business/mavis-deep-research/`): oferta B2B productizada de automatización, con los micro-SaaS como puerta de entrada barata.

---

## 5. Playbook por producto: 2 semanas, < 100 €

Presupuesto: dominio ~10 €, Vercel Pro ya pagado, MoR por uso, opcional 30-50 € Meta/TikTok ES/LatAm, opcional 39 € BetaList.

- **Días 1-2 — la cuña**: landing EN+ES (hreflang), una promesa, demo de 20 s grabada, **precio visible** (oferta de fundador anual/única, reembolsable), checkout vivo, analítica + UTM, una página de herramienta gratuita en el mismo dominio, sitemap.
- **Días 3-5 — lanzamientos-historia (gratis)**: 1 post en r/SideProject (qué/por qué/stack/pregunta) y 1 en r/microsaas con números; 2-3 comentarios útiles/día en hilos del nicho; Uneed, Peerlist, Fazier, Microlaunch (Dev Hunt si es dev tool); PH "Coming soon" para el día 10; 1 vídeo corto/día EN y ES en TikTok+Reels+Shorts (sembrado, no esperar nada).
- **Días 6-9 — outreach directo (el canal que encuentra pagadores)**: 30-50 DMs/emails a gente con el problema visible (Reddit, X, LinkedIn, grupos de Facebook ES, Discords) con oferta de fundador + llamada de 15 min; 10-20 nano-creadores del nicho con acceso gratis + 30 % de afiliación.
- **Días 10-12 — sonda de pago (opcional, ≤ 50 €)**: Meta/TikTok ES/LatAm, 10 €/día × 5 días, creatividad de demo, 2 ganchos; solo para medir conversión de landing con tráfico frío. Show HN solo si es dev tool sin registro. PH en vivo.
- **Días 13-14 — decidir** (acumulado):

| Métrica | Matar | Iterar | Doblar |
|---|---|---|---|
| Visitantes únicos | < 300 | 300-1.000 | > 1.000 |
| Visita → email/alta (tráfico templado) | < 3 % | 3-10 % | > 10 % (frío: > 15 %) |
| Alta → activación (acción central) | < 20 % | 20-40 % | > 40 % |
| **Clientes de pago** | 0 | 1-4 | ≥ 5, o ≥ 3 "¿puede hacer también X?" de pagadores |
| Respuesta al outreach | < 5 % | 5-15 % | > 15 % |
| Canal con tráfico repetido sin empujar | ninguno | uno | uno + menciones orgánicas |

Reglas: 0 pagadores **y** < 3 % de altas con ≥ 300 visitas → archivar (dominio + página SEO vivos). Altas bien pero 0 pagadores → problema de precio/empaquetado/ICP, un ciclo más con otra oferta y luego matar. Físico: la señal es Etsy/MakerWorld (descargas, favoritos, 1.ª venta), no la landing.

---

## 6. Checklist legal mínimo (en orden)

1. Alta en Hacienda, **modelo 036** (IAE 763 programadores / 659.x comercio; estimación directa simplificada; IVA general). 0 €.
2. **MoR** para digital (Polar Starter o Stripe Managed Payments). ~5 % + 0,50 $/venta.
3. Textos web: aviso legal LSSI, privacidad + registro de actividades (Facilita_RGPD), cookies solo si hay analítica/ads de terceros (CMP TCF si AdSense), condiciones con desistimiento (checkbox 103.m para descargas; prorrata en suscripción) y botón "desistir". 0-150 €.
4. DPAs: Supabase (región UE), Vercel, MoR. MiniMax: minimización de datos documentada; pedir DPA. 0 €.
5. **RETA con tarifa plana** en cuanto el ingreso sea recurrente; comunicar pluriactividad. ~1.060 €/año el 1.º.
6. Trimestrales 303 + 130, anual 390 + Renta; software de facturación compatible Verifactu (1-jul-2027). Gestoría opcional 360-720 €/año.
7. Físico: inserto GPSR + dossier técnico 1 página/modelo + "EU product compliance" en Etsy; evitar diseños-juguete. 0 € (tiempo).
8. Físico: RPP envases + Ecoembes Comerciales + declaración anual simplificada. < 20 €/año.
9. Revisión a 12 meses: ¿> 10.000 € intracomunitarios fuera del MoR? → OSS. ¿Renovar tarifa plana?

---

## 7. Calendario propuesto (90 días)

- **Semana 0 (esta)**: comprobar acceso a la API de música de MiniMax; Vercel Pro; alta en Polar o solicitud de Stripe MP; 036; dominio paraguas + dominios de producto; chasis (host de QR dinámico, plantilla de landing, webhooks de billing a Supabase, OpenClaw con alertas).
- **Semanas 1-2**: **A3** físico primero (modelo gratis en MakerWorld/Printables con QR al configurador; 2 listados en Etsy; 10 negocios del barrio) + **A1** outreach (landing + 50 emails a gestores de apartamentos; construir solo si ≥ 5 respuestas con interés de pago).
- **Semanas 3-4**: **A2** (reutiliza el motor del RPG; landing ES/EN con preview gratis, cobro por créditos, POD conectado).
- **Semanas 5-8**: primeras decisiones matar/iterar/doblar; segunda hornada con lo que haya sobrevivido + 1 de Tier B (B1 si hay música; si no, B2 o B3).
- **Semanas 9-12**: C1 como activo SEO barato (pico 2027); agente de atención (Uso 2) solo si A3 tiene ≥ 5 negocios pagando la página.
- **Mes 4-6**: juzgar SEO de las páginas de herramientas gratuitas; Supabase Pro si hay ingresos; valorar C2 si aparece demanda de pliegos.

---

## 8. Fuentes principales

- Vercel: [Fair Use](https://vercel.com/docs/limits/fair-use-guidelines) · [Pricing](https://vercel.com/pricing) · [Limits](https://vercel.com/docs/limits) · [Spend Management](https://vercel.com/docs/spend-management) · [Wildcard domains](https://vercel.com/docs/multi-tenant/limits)
- Cloudflare: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) · [Terms §2.2.1](https://www.cloudflare.com/terms/)
- Supabase: [Pricing](https://supabase.com/pricing) · [Custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas) · [DPA](https://supabase.com/legal/dpa)
- MiniMax: [PAYG pricing](https://platform.minimax.io/docs/guides/pricing-paygo.md) · [Token Plan FAQ](https://platform.minimax.io/docs/token-plan/faq.md) · [Music API notice](https://platform.minimax.io/docs/api-reference/music-generation) · [Rate limits](https://platform.minimax.io/docs/guides/rate-limits) · [Privacy policy](https://www.minimax.io/platform/protocol/privacy-policy)
- Ideas/ingresos: [ColorBliss](https://www.starterstory.com/color-bliss-breakdown) · [HeadshotPro](https://www.starterstory.com/stories/headshotpro-breakdown) · [PhotoAI](https://www.indiehackers.com/post/photo-ai-by-pieter-levels-complete-deep-dive-case-study-0-to-132k-mrr-in-18-months-3a9a2b1579) · [Wonderbly→PRH](https://www.publishersweekly.com/pw/by-topic/industry-news/industry-deals/article/97944-prh-buys-u-k-based-wonderbly.html) · [Suno ARR](https://www.billboard.com/pro/suno-2-million-paid-subscribers-300m-arr-revenue/) · [Songfinch Instant](https://support.songfinch.com/hc/en-us/articles/23772530571931-Instant-Songs-Pricing-Refunds-Access-Policies) · [Liinks](https://superframeworks.com/blog/liinks) · [QR business stories](https://www.starterstory.com/ideas/qr-code-business/success-stories) · [partesdeviajeros](https://partesdeviajeros.com/) · [SES.Hospedajes guía](https://net2rent.com/guia-completa-ses-hospedajes/) · [ItsLitho](https://itslitho.com/) · [Etsy 3D items](https://www.insightagent.app/guides/best-selling-3d-printed-items-etsy) · [Micro-SaaS reality](https://saasranger.com/blog/micro-saas-revenue-reality-what-1000-founders-actually-earn/) · [RevenueCat 2026](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026/) · [Freemius 2025](https://freemius.com/blog/state-of-micro-saas-2025/) · [AppSumo LTD math](https://www.indiehackers.com/post/4-years-into-an-appsumo-lifetime-deal-the-unvarnished-math-and-a-question-i-m-stuck-on-4dd2b262ac)
- QR→STL existentes: [QRCode2STL](https://qrcode2stl.printer.tools/) · [PrintPal](https://printpal.io/tools/qr-code-generator) · [GenQRCode](https://genqrcode.com/generator/stl) · [PrivQR](https://privqr.com/3d) · [Omnvert](https://omnvert.com/en/tools/qr-code-to-stl) · [Etsy 3D cards](https://www.etsy.com/market/3d_printed_business_cards)
- Distribución: [PH traffic 2026](https://hub.causo.ai/guides/product-hunt-traffic-data-2026) · [Reddit rules](https://redship.io/blog/reddit-self-promotion-rules) · [Buffer TikTok cadence](https://buffer.com/resources/how-often-should-you-post-on-tiktok/) · [AppSumo revenue share](https://appsumo.com/blog/breaking-down-appsumo-revenue-share) · [Influencers España 2026](https://thekingofcontent.agency/blog/cuanto-cuesta-campana-influencers-espana-2026) · [Etsy fees](https://blog.marmalead.com/etsy-fees-explained/) · [Etsy GPSR](https://help.etsy.com/hc/en-us/articles/28211364687383-What-is-the-General-Product-Safety-Regulation-GPSR) · [MakerWorld Exclusive](https://blog.bambulab.com/exclusive-model-program-cash-rewards-and-copyright-support) · [Google Ads España](https://azur360.com/blog/cuanto-cuesta-google-ads-en-espana-en-2026/) · [Meta CPC España](https://www.superads.ai/facebook-ads-costs/cpc-cost-per-click/spain)
- Legal/fiscal: [Stripe ES pricing](https://stripe.com/es/pricing) · [Stripe Managed Payments](https://docs.stripe.com/payments/managed-payments/eligibility) · [Polar fees](https://polar.sh/docs/merchant-of-record/fees) · [Lemon Squeezy 2026](https://www.lemonsqueezy.com/blog/2026-update) · [Paddle pricing](https://www.paddle.com/pricing) · [AEAT OSS](https://sede.agenciatributaria.gob.es/Sede/iva/iva-comercio-electronico/cuestiones-generales.html) · [Modelo 036](https://sede.agenciatributaria.gob.es//Sede/procedimientoini/G322.shtml) · [STS 941/2025](https://www.iberley.es/noticias/el-ts-aclara-ingresos-smi-alta-reta-autonomos-pensionistas-35716) · [Tarifa plana](https://www.infoautonomos.com/seguridad-social/tarifa-plana-autonomos/) · [Pluriactividad 2026](https://www.autonomosyemprendedor.es/articulo/seguridad-social/autonomos-pluriactividad-seguridad-social-eleva-17323-euros-limite-devolverles-cuotas-2026/20260224113234052143.html) · [AEPD pymes](https://www.aepd.es/derechos-y-deberes/cumple-tus-deberes/directrices-de-aplicacion/pymes) · [AdSense CMP](https://support.google.com/adsense/answer/13554116?hl=en) · [GPSR](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R0988) · [MITECO RPP envases](https://www.miteco.gob.es/en/calidad-y-evaluacion-ambiental/temas/prevencion-y-gestion-residuos/prevencion-y-gestion-residuos/registro-productores-producto-seccion-envases.html)
- Verifactu/huella: [RD-ley 15/2025 aplazamiento](https://www.fiscal-impuestos.com/aplazamiento-entrada-vigor-Verifactu-2027) · [KPMG alert](https://assets.kpmg.com/content/dam/kpmgsites/es/pdf/2025/12/tax-alert-el-real-decreto-ley-15-2025-amplia-plazos-adaptacion-reglamento-verifactu.pdf.coredownload.inline.pdf) · [AEAT FAQ ámbitos](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/cuestiones-generales-ambitos-aplicacion.html) · [AEAT declaración responsable](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/certificacion-sistemas-informaticos-declaracion-responsable.html) · [AEAT app gratuita](https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/aplicacion-gratuita-verifactu-aeat/acceso-identificacion.html) · [Sanciones 201 bis](https://verifactool.com/verifactu/sanciones) · [RD 214/2025 huella](https://www.boe.es/buscar/doc.php?id=BOE-A-2025-7439) · [Registro MITECO](https://www.miteco.gob.es/en/cambio-climatico/temas/registro-huella/huella-de-carbonoinscripcion.html) · [Directiva 2024/825](https://www.boe.es/buscar/doc.php?id=DOUE-L-2024-80326) · [Retirada Green Claims](https://gorrissenfederspiel.com/en/the-european-commission-withdraws-the-green-claims-directive-proposal/) · [Eco-Track](https://www.lamoncloa.gob.es/serviciosdeprensa/notasprensa/economia-comercio-empresa/Paginas/2026/120226-cuerpo-consejo-finanzas-sostenibles-pymes.aspx) · [Manglai pricing](https://www.manglai.io/pricing)
- OpenClaw: [Security](https://docs.openclaw.ai/gateway/security) · [Multi-agent](https://docs.openclaw.ai/concepts/multi-agent) · [Multi-user deployment](https://c3.unu.edu/blog/from-laptop-to-organization-deploying-openclaw-at-scale-without-forking-it)
- Contexto previo: `business/mavis-deep-research/20260723_203341_nichos-hiperautomatizacion-ia/` (agencia de automatización vertical, jul-2026); [Lovable micro-SaaS 2026](https://lovable.dev/guides/micro-saas-ideas-for-solopreneurs-2026) (marco de validación de 30 días; 70 % < 1.000 $/mes).
