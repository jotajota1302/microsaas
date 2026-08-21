# Investigación A2 · cuentos personalizados — agosto 2026

Fecha: 2026-08-20. Cinco barridos en paralelo (competencia, POD, modelos de IA, cobros/legal, canales). Cifras con URL; **[nv]** = no verificado / estimación. Este documento alimenta `mvp.md` y el plan de implementación; no es la fuente de verdad del alcance.

## 0. Diez hallazgos que cambian el plan

1. **El PDF a 3,99-5 € ya es el precio de mercado en español** (Cuentoslandia 3,99 €, CuentosIA 5 €, Cuento con laIA 3,99 €), con primer cuento gratis en tres competidores y Gemini Storybook gratis. El PDF es entrada, no negocio.
2. **El dinero está en el impreso**: incumbentes humanos a 29,99-35 € (Wonderbly, Mumablue, MiCuento) con entregas de 10-18 días y quejas por retrasos en Navidad. Único indie con cifras reales: Selfarama, 12.000 $/mes vendiendo **impreso a abuelos con Facebook Ads**.
3. **Hueco**: impreso en España con entrega < 7 días y fecha límite de Reyes explícita; México casi vacío (Mumablue: 42 % de su tráfico es MX).
4. **La queja nº 1 de los productos IA es la inconsistencia del personaje**. `image-01` con `subject_reference` (1 imagen, pensada para caras humanas) no la resuelve; los modelos de edición multi-referencia (Nano Banana 2, Seedream 4.5, FLUX.2) sí, a 0,04-0,07 $/imagen.
5. **Coste de IA por cuento ≈ 0,7-1,5 $** con consistencia real (no 0,05 $). Sigue siendo < 25 % del PDF y < 4 % del impreso. El texto es despreciable (< 0,02 $).
6. **IVA 4 %** para el libro impreso y para el PDF (los cuentos infantiles son "libro" a efectos de IVA; e-books al 4 % desde 2020). Créditos de colorear: 21 %.
7. **Polar prohíbe en su AUP servicios "intended for minors"** y somete eBooks/IA a revisión → **Stripe Managed Payments** (ES elegible, e-books admitidos, 0,50 € en 4,99 €) como MoR, y la **misma cuenta Stripe** en directo para el libro físico.
8. **POD**: solo Gelato, Peecho, Cloudprinter y Prodigi tienen API de pedido unitario + producción UE + 24-32 pp color. Gelato 20×20 (mín. 30 pp, tapa dura desde ~12 $, white label, 4-6 días) 1º; Peecho (24 pp, dura desde 5,20 €) 2º. Ningún precio cerrado sin cuenta.
9. **Canales**: Etsy para las primeras 5 ventas, Pinterest para colorear (lento, gratis, inmune a AI Overviews), vídeo UGC de un niño real (no de marca). Ads a CPC 0,46 € y conversión 1-2 % → CPA 25-50 €: no rentable para PDF, solo para aprender.
10. **Google genera imágenes dentro de AI Overviews desde jul-2026** → la galería gratuita de colorear pierde valor SEO a 12-24 meses; debe nacer con captura de email y packs PDF.

## 1. Competencia

### Español (IA)

| Competidor | Oferta | Precio | Foto | Impreso | Tracción |
|---|---|---|---|---|---|
| [Cuentoslandia](https://www.cuentoslandia.com/) (ES) | PDF 24 pp, audio | 1.º gratis; 3,99 €; pack 3 = 9,99 €; audio +5 € | No (vende privacidad) | 35 € envío incl., 10 días | "+1.000 familias", © 2026 |
| [CuentosIA](https://cuentosia.ai/es/precios) (ES) | PDF ≤ 24 pp, audio | 1.º gratis; 5 €; blanda +17 € / dura +26 € (envío 9,3 € incl.); club 4 €/mes | Sí | 7-14 días | 20 reseñas Google |
| [Cuento con laIA](https://cuentoconlaia.com/) (Tarragona) | PDF 20 pp | 3,99 € | Sí | No | — |
| [Cuenti.to](https://cuenti.to/en) | Educativo, colorear | 9 $/mes | No | No | Región de Murcia, XTEC |
| [ToonyStory](https://toonystory.com/es) | Libro con foto | 9,99-19,99 €/mes; impreso vía Lulu Direct | Sí | Sí | Product Hunt |
| [ImaginaCuentos](https://imaginacuentos.com/es) (AR) | PDF 22/36 pp | 9,99-12,99 USD | ? | No | "+200 familias" |
| [La Cuentería](https://lacuenteria.cl/) (CL) | PDF + tapa dura 23×23 | 9.990 / 32.990 CLP | Sí | Impresión propia | Colegios |
| [Bookinest](https://bookinest.com/) (AR) | Impreso | 44-87 k ARS | No | Solo AR | — |

### Español (ilustración humana — el ancla del regalo)

| | Precio | Envío | Reseñas |
|---|---|---|---|
| [MiCuento](https://es.trustpilot.com/review/micuento.com) | 29-34,90 € dura | 10-15 días (21 en Navidad) | Trustpilot 4,1 (2.005) |
| [Mumablue](http://www.mumablue.com/esp/inicio) | 24,99-34,99 € | 35 países | Trustpilot 4,7 (809); ~32 k visitas/mes, 42 % MX |
| [Wonderbly ES](https://www.wonderbly.com/es/personalized-products/lost-my-name-book) | 29,99 € (A4 apaisado 22-24 pp) | Europa, 2-4 días prod. | 8 M libros; PRH desde jun-2025 |
| [Hurra Héroes](https://hurraheroes.com/) | ~29 € blanda [nv] | 12-18 días | Trustpilot 4,0 (6.630) |

### Inglés (referencia)

Tres capas: gratis (Gemini Storybook), 2,5-15 $ PDF con foto ([Childbook](https://www.childbook.ai/) 2,50 $, [KidzTale](https://kidztale.com/) 5,99 $, [Hekaya](https://magicalhekaya.com/) 4,99 $, [Lullaby.ink](https://lullaby.ink/pricing) 14,99 $), 25-50 $ impreso ([Magic Story](https://www.magicstory.com/) 24,99 $ + 29 $ dura, 4,9/5 con 7.392 reseñas; Wonderbly 28-45 $; Hooray Heroes 35-50 $). La consistencia por foto es estándar en EN.

### Ingresos publicados

| Caso | Cifra | Canal | Fuente |
|---|---|---|---|
| ColorBliss (1 persona) | 2.000 $ MRR a los 7 meses; hoy 153 k registros, 9 $/20 créditos | SEO long-tail + FB Ads a padres | [Starter Story](https://www.starterstory.com/color-bliss-breakdown), [blog](https://ben.robertson.is/notes/color-bliss-is-two-years-old/) |
| Selfarama (1 persona) | 12.000 $/mes (may-2024) con ~1.000 $/sem en ads | FB Ads a abuelos EE. UU., impreso | [Starter Story](https://www.starterstory.com/stories/selfarama) |
| Wonderbly | ~12 M$ online 2024; adquirida por PRH | Paid social + marca | [ecdb](https://ecdb.com/resources/sample-data/retailer/wonderbly) |
| Indies IA 2025-26 | Ningún MRR publicado | — | — |

### Quejas recurrentes

Inconsistencia del personaje (nº 1 en IA) · avatar genérico · texto plano · precio vs valor en impresos humanos · **retrasos de entrega del impreso** (la queja más dañina de MiCuento/Wonderbly/Hooray) · soporte solo email · rechazo de parte del público a "hecho con IA".

## 2. Demanda y estacionalidad

- Volúmenes ES sin cifra pública; estimación [nv]: "cuentos personalizados" 4-8 k/mes ES (15-30 k hispano); "dibujos para colorear" 150-300 k ES (1-2 M hispano); "dibujos para colorear de dinosaurios/unicornios" 8-15 k ES cada una. Validar en Keyword Planner.
- EN (datos Etsy, [RankHero](https://www.rankhero.com/keywords/coloring-pages)): "coloring pages" 823 k/mes, "unicorn coloring pages" 90 k, "dinosaur coloring pages" 74 k; "personalized childrens book" 22,7 k listings.
- Estacionalidad: pico nov-dic; **fecha límite de Reyes ≈ 17-dic** por los 10 días del impreso ([fuente](https://quehacerconlosninos.es/general/revista/educacion/cuentos-personalizados-se-sientan-unicos/)); secundarios Día del Padre (19-mar), Día de la Madre (mayo ES / 10-may MX), comuniones (may-jun). Colorear: pico sep-may en EE. UU.; en España el verano invierte el valle [nv]. **Agosto = CPM más barato del año** (3,6-7,6 €).
- Mercado libros personalizados 569 M$ (2025) → 1,05 B$ (2031) [informe de pago, nv].

## 3. POD con API (UE)

| Proveedor | API unitaria | Formato | Blanda desde | Dura desde | Imprenta UE | Plazo | White label |
|---|---|---|---|---|---|---|---|
| [Gelato](https://www.gelato.com/products/photo-books) (NO) | REST v4, sin mínimo; PDF + `custom_cover`; `cover-dimensions` | **20×20**, 21×28, 30×30; **mín. 30 pp**; 170 g | ~7-12 $ [nv] | ~12-20 $ [nv] | 32 países, página para España | 4-6 días | Sí, gratis |
| [Peecho](https://www.peecho.com/solutions/print-api) (NL) | REST gratis; PDF único (portada+interior), margen 10 mm, lomo automático | Cuadrado/apaisado; **24-300 pp** | 4,00 € | 5,20 € | Red 30 países, sede NL | 4-6 + 2-7 días | Sí |
| [Cloudprinter](https://www.cloudprinter.com/countries/local-printing-in-spain-with-global-print-api) (NL) | REST + SDK Node, `prices/lookup`, 20 webhooks | 40+ tamaños | lookup (+2,75 €/ítem plan gratis) | lookup | **Imprime en España** | 3-4 días + envío | [nv] |
| [Prodigi](https://www.prodigi.com/products/books-and-magazines/hardcover-photo-book/) (UK) | REST v4 + sandbox | **21×21**, A5, A4; 24-300 pp | cuenta | cuenta | Labs UE | 120 h | parcial |
| [Lulu](https://www.lulu.com/sell/sell-on-your-site/print-api) | REST, sandbox, webhooks | 21,6×21,6; dura ≥ 24 pp | calc. | calc. | FR/UK | 3-5 días + hasta 28 correo | albarán |
| [Podiprint](https://www.podiprint.com/tecnologia/bibliolink/) (Málaga) | Webservice B2B bajo contrato | Dura sin mínimo | presupuesto | presupuesto | **España** | 48-72 h | Sí |
| BookVault, Mixam, Blurb/RPI, Bookmundo, KDP, Printful/Printify, Saal, Pixart | Descartados: fuera de UE, sin API pública, o sin libros | | | | | | |

Referencia de formato del mercado: Wonderbly A4 apaisado 22-24 pp; Hooray Heroes 28 pp 30×21 o 26 pp 21×21. **Ningún proveedor publica precio cerrado para 20×20/32 pp a color**: obtener por API con cuenta.

## 4. Modelos de IA y coste

### Texto (JSON con schema; coste por cuento = 6 k tokens entrada + 5 k salida, 2 pasadas)

| Modelo (OpenRouter) | $/M ent / sal | $/cuento |
|---|---|---|
| [DeepSeek V4 Flash](https://openrouter.ai/deepseek/deepseek-v4-flash) | 0,068 / 0,168 | 0,0012 |
| [Gemini 2.5 Flash-Lite](https://openrouter.ai/google/gemini-2.5-flash-lite) | 0,10 / 0,40 | 0,0026 |
| [GPT-5 nano](https://openrouter.ai/openai/gpt-5-nano) | 0,05 / 0,40 | 0,0023 |
| [MiniMax M3](https://openrouter.ai/minimax/minimax-m3) | 0,23 / 0,96 | 0,0062 |
| [GPT-5 mini](https://openrouter.ai/openai/gpt-5-mini) | 0,25 / 2,00 | 0,0115 |
| [Gemini 2.5 Flash](https://openrouter.ai/google/gemini-2.5-flash) | 0,30 / 2,50 | 0,0143 |
| [Claude Haiku 4.5](https://openrouter.ai/anthropic/claude-haiku-4.5) | 1,00 / 5,00 | 0,031 |

OpenRouter: sin markup por token, **5,5 % al cargar créditos**, no registra prompts por defecto, ajuste "ZDR only", enrutamiento UE solo Enterprise ([FAQ](https://openrouter.ai/docs/faq), [ZDR](https://openrouter.ai/docs/guides/features/zdr)). Ventajas: failover entre proveedores (MiniMax directo nos dio 55-200 s en el RPG), probar 15 modelos con una factura. Aceptable para texto porque **no enviamos datos personales** (`{{NOMBRE}}`).

### Imagen

| Modelo | $/img ~1K | Ref. personaje | Multi-ref | Latencia | Datos |
|---|---|---|---|---|---|
| [MiniMax image-01](https://fal.ai/models/fal-ai/minimax/image-01/subject-reference) | 0,0035 | 1 img, pensada para cara humana | No | ~15 s | EE. UU., sin DPA |
| [Gemini 2.5 Flash Image (Nano Banana)](https://ai.google.dev/gemini-api/docs/pricing) | 0,039 | Sí | Sí | < 10 s | Pago: no entrena; UE solo vía Vertex |
| [Gemini 3.1 Flash Image (Nano Banana 2)](https://ai.google.dev/gemini-api/docs/image-generation) | 0,067 (1K); 2K [nv] | **Hasta 4 personajes** + 10 objetos | Sí | segundos | ídem |
| Gemini 3 Pro Image (Nano Banana Pro) | 0,134 (1K/2K) | Hasta 5 personajes | Sí | 10-30 s | ídem |
| [Seedream 4.5 (fal)](https://fal.ai/models/fal-ai/bytedance/seedream/v4.5/edit) | 0,04 (hasta 4K) | Sí | **Hasta 10** | 2-5 s | fal EE. UU., DPA |
| [FLUX.2 klein / pro](https://bfl.ai/blog/flux-2) | 0,015 / 0,03 por MP | Sí | Hasta 10 | 5-15 s | BFL (DE), DPA bajo petición |
| [gpt-image-1.5 medium](https://pricepertoken.com/gpt-image-pricing) | 0,034 | Sí (`/edits`) | Sí | 20-60 s | DPA, residencia UE [nv para imágenes] |
| [Recraft V3 vector](https://www.recraft.ai/docs/api-reference/pricing.md) | 0,08 (SVG) | No | No | segundos | EE. UU. |
| Midjourney | sin API oficial | — | — | — | descartar |

**Técnica 2026 para consistencia**: hoja de personaje en cuadrícula (frente/perfil/expresiones) generada una vez → recortes como referencias → cada página con modelo de edición multi-referencia + prompt anclado (atributos siempre en la misma posición). LoRA solo compensa para 50+ imágenes. Validar con VLM barato ("¿es el mismo niño?") y regenerar ([dev.to, 600 viñetas: 87,5 % acierto](https://dev.to/qcrao/character-consistency-in-ai-comics-3-tricks-that-beat-lora-training-for-me-3ad7)).

**Line-art para colorear**: umbralizar con sharp NO convierte una ilustración con sombras en contornos; el line-art lo genera el modelo (editar la página ilustrada → "clean black outlines, white background, no shading") y sharp solo limpia (`greyscale → median → threshold`). 0,015-0,04 $/página.

**Filtros con menores dibujados**: Google/OpenAI prohíben sexualizar menores y endurecen filtros con niños; ilustraciones infantiles sin foto no están prohibidas, pero hay riesgo de falsos positivos → **probar 50+ prompts antes de decidir proveedor**.

**Resolución de imprenta**: 20 cm a 250 dpi ≈ 2.000 px → necesitamos salida 2K (Seedream nativo; Nano Banana 2 [nv]) o upscale.

### Coste por cuento (hoja + 12 páginas + 4 colorear + portada ≈ 18 imágenes, +20 % reintentos)

| Config. | Imágenes | Total |
|---|---|---|
| Barata: DeepSeek + image-01 | 18 × 0,0035 | ≈ 0,08 $ (consistencia floja) |
| Barata+: DeepSeek + FLUX.2 klein | 18 × 0,015 × 1,2 | ≈ 0,33 $ |
| **Media: Flash-Lite + Seedream 4.5** | 18 × 0,04 × 1,2 | **≈ 0,87 $** |
| Media+: Flash-Lite + Nano Banana 2 | 18 × 0,067 × 1,2 | ≈ 1,45 $ |
| Premium: GPT-5 mini + Nano Banana Pro | 18 × 0,134 × 1,2 | ≈ 2,9 $ |

## 5. Cobros, IVA y legal

| MoR | Tarifa | En 4,99 € | En 24,90 € | Físico | ES | Riesgo |
|---|---|---|---|---|---|---|
| [Polar Starter](https://polar.sh/resources/pricing) | 5 % + 0,50 $ | 0,71 € (14 %) | 1,70 € | No | Sí | **AUP prohíbe servicios para menores; eBooks/IA bajo revisión** ([AUP](https://polar.sh/legal/acceptable-use-policy)) |
| **[Stripe Managed Payments](https://docs.stripe.com/payments/managed-payments/eligibility)** | 3,5 % + 1,5 % + 0,25 € | **0,50 € (10 %)** | 1,50 € | No | Sí (revisión previa) | Bajo: e-books admitidos; tax code Digital Books |
| [Creem](https://www.creem.io/pricing) | 3,9 % + 0,40 $ | 0,56 € | 1,34 € | [nv] | Sí | Joven; plan B |
| [Paddle](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle) | 5 % + 0,50 $ | 0,71 € | 1,70 € | No | Sí | Aprobación manual |
| Lemon Squeezy | — | — | — | — | — | Absorbido por Stripe MP: no construir |
| Stripe directo (ES) | 1,5 % + 0,25 € EEE | 0,32 € | 0,62 € | **Sí** | Sí | Tú eres vendedor (IVA/OSS) |

- **IVA**: libro impreso **4 %** (cuentos infantiles = libro, [AEAT/Iberley](https://www.iberley.es/practicos/iva-tipos-desde-1-9-2012-publicaciones-material-escolar-publicaciones-cuentos-infantiles-r1460653)); PDF **4 %** ([DGT V3388-20](https://www.iberley.es/resoluciones/resolucion-vinculante-dgt-v3388-20-19-11-2020-1531959)); créditos de colorear 21 % (conservador). Personalizado con nombre: sin consulta DGT específica → pedir consulta vinculante. OSS a partir de 10.000 €/año UE (solo cuenta el físico si el digital va por MoR).
- **Desistimiento**: PDF/créditos → checkbox no premarcado art. 103 m + repetir en el email; impreso → aviso art. 103 c (bien personalizado) junto al botón de pago + vista previa obligatoria.
- **RGPD**: nombre + rasgos + email = datos de menor identificable indirectamente; base art. 6.1.b; declarar que quien introduce los datos es progenitor/tutor; `{{NOMBRE}}` antes del LLM; retención contenido 90 días, facturas 4-6 años; RAT obligatorio (Facilita_RGPD); DPAs: Stripe, Supabase, Vercel, POD.
- **Facturación**: con MoR, el MoR factura al consumidor y tú facturas al MoR por payout; Verifactu autónomos **1-jul-2027**.
- **Moderación**: DSA no aplica (no es servicio de alojamiento); responsabilidad contractual/penal → campos cerrados, texto libre corto, filtro previo (lista + LLM barato), validador de salida, cola de revisión humana para lo impreso, transparencia "hecho con IA".

## 6. Canales

| Canal | Evidencia | Uso |
|---|---|---|
| Etsy | 22,7 k listings de cuento personalizado; bestseller PDF 26,77 $ con > 1.000 reseñas; listings ES 4,8★ | **Primeras 5 ventas** con tráfico incluido |
| Pinterest | mondaymandala 1,9 M visitas/3 m con Pinterest 1.ª fuente social; pin vive 3-6 meses | **Nº 1 para colorear**, lento y gratis |
| TikTok/Reels UGC | Flip-throughs 50-500 k vistas sin pagar; vídeos de marca: decenas de vistas | Vídeo de madre/padre real con niño real |
| Meta Ads ES | CPM mediana 7,6 € (mín. 3,6 € en agosto), CPC 0,46 €; MX CPM 3,9 $ ([Superads](https://www.superads.ai/facebook-ads-costs/cpc-cost-per-click/spain)) | Solo para aprender el mensaje; CPA 25-50 € |
| Nano-influencers crianza | story 50-100 € (1-10 k); micro 100-400 € | Producto gratis + código de afiliado |
| SEO colorear ES | Líder hispano < 100 k visitas/mes; ya entraron esle.io y coloringbook.ai; AI Overviews genera imágenes desde jul-2026 | Apuesta 6-12 meses con captura de email |

**Modelo 14 días (50 € ads + orgánico)**: pesimista 135 visitas/1 venta · base 400/6 · optimista 1.000/25. El caso base roza el umbral "doblar" (≥ 5) solo con Etsy + 1 vídeo UGC que funcione.

## 7. Fuentes adicionales

Competencia: [comparativa Little Hero 2026](https://www.little-hero.app/guides/ai-childrens-books-compared-2026), [Hekaya price comparison](https://magicalhekaya.com/es/blog/best-personalized-childrens-books-2026-price-comparison), [13 editoriales ES](https://www.julianmarquina.es/proyectos-editoriales-especializados-en-la-creacion-libros-y-cuentos-personalizados-para-peques/). POD: [Gelato API](https://dashboard.gelato.com/docs/orders/v4/create/), [Peecho guía PDF](https://support.peecho.com/hc/en-us/articles/19731377793564-Softcover-books-File-set-up-guideline), [Cloudprinter webhooks](https://docs.cloudprinter.com/client/cloudsignal-webhooks), [KDP sin API](https://kdpcommunity.com/s/question/0D58V00007VNEoISAX/api?language=en_US). IA: [Gemini image docs](https://ai.google.dev/gemini-api/docs/image-generation), [BFL pricing](https://docs.bfl.ml/quick_start/pricing), [sharp](https://sharp.pixelplumbing.com/api-operation/), [consistencia miraflow](https://miraflow.ai/blog/consistent-ai-characters-multiple-images-step-by-step). Legal: [art. 103 LGDCU](https://www.iberley.es/legislacion/articulo-103-ley-defensa-consumidores-usuarios), [AEPD menores](https://www.aepd.es/preguntas-frecuentes/10-menores-y-educacion/FAQ-1002-se-puede-recabar-y-tratar-datos-personales-de-menores), [Verifactu](https://www.infoautonomos.com/blog/hacienda-retrasa-entrada-vigor-verifactu/), [Stripe MP pricing](https://support.stripe.com/questions/managed-payments-pricing). Canales: [Similarweb supercoloring](https://www.similarweb.com/website/supercoloring.com/), [ColorBliss](https://colorbliss.com/), [AI Overviews imágenes](https://www.digitalapplied.com/blog/google-ai-overviews-image-generation-brand-visuals-2026), [tarifas influencers ES](https://thekingofcontent.agency/blog/cuanto-cuesta-campana-influencers-espana-2026).


## 8. Venta de PDF personalizado en Etsy (añadido 2026-08-21)

Barrido tras el giro a solo digital. Etsy bloquea el scraping, así que los listings vienen de snippets de buscadores; **reseñas por listing sin verificar**. Comprobar 10 minutos a mano antes de publicar.

### Precios observados (digital-only)

| Tramo | Precio | Qué es |
|---|---|---|
| IA commodity | 5-7 $ | nombre + aspecto, descarga digital ([ej.](https://www.etsy.com/listing/4328278483/personalized-storybook-for-kids-baby) 6,99 $, 4,9★) |
| **Medio** | **15-20 $** | eBook 24 págs con nombre y cara 14,99 $; «custom adventure» 19,56 £ (4,9★); 16 págs «based on your child's personality» |
| Con foto, alto | 27-28 $/€ | foto → personaje, PDF o impreso |
| Ilustración humana | 100-285 $ | encargo |

Mediana de los seis con precio visible ≈ 15-20 $. En español hay listings de cuento PDF (25 págs, 8 escenas), de **momento vital** («llegada de un hermanito», «dejar el chupete») y con «mamá y papá como personajes»: confirma que la personalización por familia y momento ya tiene compradores. Fuera de Etsy, en español, las webs propias tiran el precio a la baja (cuentosia «primer cuento gratis», tucuentito 48 h).

### Reglas de Etsy

- **Made-to-order digital** ([ayuda](https://help.etsy.com/hc/en-us/articles/115015628347-How-to-Manage-Your-Digital-Listings)): el archivo se adjunta al completar el pedido desde Shop Manager; **5 archivos × 20 MB máx.** → el PDF debe pesar < 20 MB. La personalización se recoge con el formulario de personalización de Etsy o por mensaje.
- **IA**: obligatorio marcar «I used AI-generative technology» + atributo «Designed by» + frase en la descripción; desde el **14-ene-2026** lo no declarado se filtra de búsqueda ([ShieldMyShop](https://www.shieldmyshop.com/blog/2026-07-03-do-you-have-to-disclose-ai-art-etsy-made-by-designed-by-rules)). Las fotos del listing deben mostrar **ejemplos reales personalizados**, no plantillas ([Listadum](https://www.listadum.com/blog/etsy-creativity-standards)).
- **Comisiones España**: listing 0,20 $ · transacción 6,5 % · procesamiento 4 % + 0,30 € · regulatory fee 0,88 % (desde 22-jun-2026) · Offsite Ads 15 % solo si la venta viene de su anuncio · **+ IVA 21 % sobre las comisiones** sin NIF-IVA ([fees](https://help.etsy.com/hc/en-us/articles/115014483627-What-are-the-Fees-and-Taxes-for-Selling-on-Etsy), [calculadora](https://sellerfees.eu/spain/)).

| Precio | Comisiones (+IVA) | Neto | Neto vía Offsite Ads |
|---|---|---|---|
| 9,90 € | 1,93 € (19,5 %) | 7,97 € | 6,17 € |
| **12,90 €** | 2,35 € (18,2 %) | **10,55 €** | 8,21 € |
| 14,90 € | 2,62 € (17,6 %) | 12,28 € | 9,58 € |

- **IVA**: Etsy recauda y remite el IVA de los digitales al comprador de la UE ([VAT digital](https://help.etsy.com/hc/en-us/articles/115015587567-How-VAT-Works-on-Digital-Items)). **Matiz [nv]**: el artículo habla de descarga automática; que cubra también los made-to-order con intervención humana no está confirmado → consultar con el gestor y probar con el primer pedido UE.

### Otros canales sin envío

Gumroad (10 % + 0,50 $, MoR), Payhip (5 % free, recauda IVA UE), Ko-fi (5 %/0 % Gold). Ninguno trae tráfico de intención «regalo personalizado»; sirven como respaldo de la web propia, no sustituyen a Etsy. TPT (55-80 % payout) solo para colorear genérico en inglés.

### Qué valoran las reseñas

Hermanos («personalize with both children's names», «becoming a big brother was perfect»), **familia y mascotas como personajes** («preguntando personas a incluir: yaya, padres, primos, tíos, mascotas»), **momento vital** (nacimiento, cole, chupete, emociones), reconocerse («easy for smaller kids to pick the character out») y la **dedicatoria** («the personal message made it even more special»). Fuentes: Trustpilot de [Wonderbly UK](https://uk.trustpilot.com/review/wonderbly.com) y [ES](https://es.trustpilot.com/review/wonderbly.com), [Hooray Heroes](https://www.trustpilot.com/review/hoorayheroes.com), [Librio](https://www.trustpilot.com/review/librio.com).

### Recomendación

**12,90 € en ES, 14,90 € en EN**; si la prueba de 2 semanas da ≥ 5 ventas, subir ES a 14,90 €. Ancla: pack 19,90 € (cuento + versión en inglés + páginas extra). Declarar IA, fotos con ejemplos reales, entrega ≤ 24 h, PDF < 20 MB.
