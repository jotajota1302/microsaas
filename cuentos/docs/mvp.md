# MVP — Cuentos personalizados en PDF

Versión 2 · 2026-08-21 · fuente de verdad del alcance. **[verificar]** = pendiente de comprobar.
Investigación con fuentes: [`research-2026-08.md`](research-2026-08.md). Diseño técnico: [`superpowers/specs/2026-08-20-cuentos-design.md`](superpowers/specs/2026-08-20-cuentos-design.md) (con la revisión del 21-08 al final). Medidas reales: [`fase-0-resultados.md`](fase-0-resultados.md).

> **Cambio de dirección (2026-08-21).** El MVP es **solo digital**: nada de imprenta, envíos ni logística hasta que el PDF demuestre tracción. Con ello cambian cuatro cosas: el precio sube (el PDF deja de ser gancho y pasa a ser el producto), el formato se acorta (18 páginas, una escena por página, en vez de un libro de 32 atado al mínimo de la imprenta), el gancho pasa a ser una **vista previa personalizada generada antes de cobrar** en una URL temporal, y el diferencial se traslada de la consistencia del personaje a **la personalización de la historia**: la familia y los amigos del niño como personajes, y el momento vital que está viviendo. La foto del niño queda **aparcada** (ver §7). El impreso no se descarta: se mide su demanda con un botón antes de construirlo.

## 1. Problema y cliente

- **Quién compra**: padres, abuelos y tíos buscando un regalo con el nombre del niño — y, sobre todo, un cuento que hable de **su** vida: el hermanito que viene, la mudanza, el primer día de cole, el miedo a la oscuridad, la abuela que vive lejos.
- **Evidencia**: ColorBliss 2.000 $ MRR a los 7 meses con SEO de cola larga; Wonderbly, 8 M de libros sin una sola foto (avatar por rasgos); en Etsy el tramo medio de cuentos personalizados en PDF está en 15-20 $ (eBook de 24 páginas a 14,99 $; «custom adventure» a 19,56 £ con 4,9★) y ya existen listings en español de **momento vital** («llegada de un hermanito») y con «mamá y papá como personajes» (§8 de la investigación).
- **Lo que nadie hace bien**: los competidores de IA personalizan el *aspecto* del niño (nombre, pelo, foto) pero cuentan historias genéricas. Nadie pregunta quién es su hermana, cómo se llama su abuelo ni qué le pasa este mes. Eso es texto puro, cuesta cero en infraestructura y es lo que emociona a quien compra.

## 2. Propuesta y precio

- **Promesa**: «Un cuento sobre tu hijo y su mundo: su familia, sus amigos, su mascota y lo que está viviendo ahora. Listo en 24 horas.»
- **Precio**: **11,99 € en español, 13,99 € en inglés** (21-08). Salió de 12,90 (tramo medio de Etsy, §8 de `research-2026-08.md`) porque el producto es **solo digital** y el **impreso (20-25 €, a falta de presupuesto)** será donde esté el margen. 9,99 se valoró y se descartó: −2,64 € por venta y un umbral de +40 % de conversión; 11,99 cuesta −0,82 € y necesita +10 %. Margen ≈ 8,58 € por venta. Incluye 12 páginas ilustradas, 4 páginas para colorear con las escenas del cuento, y versión para imprimir en casa.
- **Embudo en dos puertas en una URL temporal (el gancho)**: (1) **el guion**: al enviar el formulario se genera el texto completo del cuento (≈ 0,01 €) y se lee en `/c/<token>`; el usuario puede pedir **hasta 2 cambios** («que la abuela tenga más protagonismo») o aprobarlo; (2) **la muestra ilustrada**: solo para quien aprueba el guion, portadilla + ficha del personaje + **2 escenas ilustradas** (nunca la resolución), ≈ 0,21 €; (3) **el pago**: «Completar el cuento — 12,90 €» ilustra el resto, añade las 4 de colorear y el PDF, con **1 retoque incluido** (hasta 3 ilustraciones o 1 página de texto). El enlace llega por email, caduca a los 7 días (30 tras pagar) y es la misma URL de principio a fin. No hay despliegue por cliente.
- **Páginas para colorear** por créditos: 4,99 €/20 (fase 3, sin cambios).
- **Impreso**: no se vende. Un botón «Quiero el libro impreso» en la página de descarga registra el interés. Si ≥ 25 % de los compradores lo pulsan, se construye la fase de imprenta.
- **Economía unitaria** (a 11,99 €; las cifras de abajo son las de 12,90 € y quedan como referencia del cálculo)
- ~~Economía unitaria~~ (a 12,90 €, Nano Banana 2 a 0,07 $/imagen): guion 0,01 € · muestra 0,21 € · completar 0,95 € · retoque 0,20 €; IVA 4 % (0,50 €); comisión **Stripe MP ≈ 0,90 €** en la web o **Etsy ≈ 2,35 €**. Con un 50 % de guiones aprobados y un 20 % de muestras que pagan, la IA cuesta **2,1 € por venta** → margen ≈ **9 € web / 7,6 € Etsy**. El curioso que solo lee el guion cuesta un céntimo. Break-even: 1 cuento al mes; 500 €/mes ≈ 55 cuentos.
- **Anuncios no**: con un CPC de 0,46 € y una conversión del 1-2 %, captar cuesta 25-50 € por venta; no cuadra con un margen de 9-11 €. Todo el tráfico es orgánico: Etsy, Pinterest, vídeo, grupos, SEO.

## 3. Producto

**Cuento en PDF, 18 páginas, cuadrado 20×20 cm** (se lee bien en tablet y móvil, y se imprime en A4 sin recortar nada):

| Páginas | Contenido |
|---|---|
| 1 | Portadilla: título + dedicatoria libre |
| 2-13 | 12 escenas: ilustración arriba, texto de 60-90 palabras abajo, una página por escena |
| 14-17 | 4 páginas para colorear con escenas del propio cuento |
| 18 | Ficha de los personajes + colofón con aviso de IA |

**Personalización** (el diferencial, todo por texto):

| Campo | Tipo | Notas |
|---|---|---|
| Nombre, género, edad | cerrado salvo el nombre | el género es obligatorio: el español concuerda |
| Pelo, piel, gafas | cerrado | para la hoja de personaje |
| Mascota | lista + «ninguna» | con papel en la historia |
| Afición | lista de 12 | resuelve el conflicto en la última página |
| **Personas** (hasta 2) | nombre + relación (hermano/a, padre, madre, abuelo/a, amigo/a, primo/a) + edad aproximada | aparecen como personajes con papel real; sus nombres viajan como `{{PERSONA1}}` / `{{PERSONA2}}` |
| **Momento** | lista cerrada: un cumpleaños, va a tener un hermanito, se muda de casa, empieza el cole, le da miedo la oscuridad, echa de menos a alguien, una aventura sin más | fija el conflicto del cuento |
| **Tono** | para dormir / divertido / valiente | fija el registro |
| Tema del mundo | mar, bosque, espacio, dinosaurios, castillos, fútbol | fija el escenario |
| Dedicatoria | texto libre, 140 caracteres | moderada antes de cobrar |

**Sin foto** (ver §7). **Sin audio, vídeo, app, cuenta de usuario ni suscripción.**

## 4. Arquitectura (resumen; detalle en el spec)

Sin cambios de fondo respecto a la v1, menos una fase entera:

- **Texto**: OpenRouter con structured outputs; el prompt incluye la forma exacta del JSON (medido: sin ella, los modelos que no aplican el schema fallan el 100 %). Validador propio como única puerta.
- **Imagen**: hoja de personaje → escenas con **Nano Banana 2 (`google/gemini-3.1-flash-image`) vía OpenRouter**, medido el 21-08 con dos personajes: mismo personaje, misma acuarela, 0 bloqueos, 14 s y 0,07 $ por imagen, cuadrado 1024 con `image_config.aspect_ratio`. Una sola clave para texto e imagen. El verificador VLM comprueba **personaje y estilo** como red de seguridad.
- **PDF**: pdf-lib, Andika (OFL), 18 páginas, una escena por página. Sin sangrado ni lomo.
- **Generación asíncrona por jobs** en tres tramos sobre la misma máquina de estados: `script` (texto, repetible con la instrucción del usuario), `sample` (hoja + 2 escenas) y `full` (resto + colorear + PDF + revisión humana de ~5 minutos + email), más `retouch`. Techos: guardrail de OpenRouter 5 $/día (externo), `MAX_SCRIPTS_PER_DAY` 200 y `MAX_SAMPLES_PER_DAY` 40, Turnstile, 3 guiones por IP y día. La web no se apaga nunca; las URLs caducan solas.
- **URL temporal por cuento**: `/c/<token>` servida por la misma app de Vercel (no hay un despliegue por cliente); `stories.expires_at` a 7 días para las vistas previas y 30 para las compradas; un cron borra imágenes, PDF y datos personales al caducar. Es a la vez el escaparate y la entrega.
- **Cobro**: Stripe Managed Payments (MoR) — **lo integra Edu más adelante**; `api/checkout.js` y `api/webhook-stripe.js` son la única costura. Mientras tanto la web vende **vía Etsy**: «Completar el cuento» lleva a la ficha de Etsy con el token del cuento, y el pedido se confirma a mano desde la cola de revisión. Ya no hace falta Stripe directo ni IVA de envíos.
- **Datos**: Supabase, schema `cuentos`. `stories` gana `token`, `stage` (preview | full) y `expires_at`; se añaden `print_interest` (email + fecha) para medir la demanda del impreso y `waitlist`. `print_orders` no se crea.
- **Privacidad**: ningún nombre viaja a la IA (`{{NOMBRE}}`, `{{PERSONA1}}`, `{{PERSONA2}}`); la relación («su abuela») sí, porque no identifica a nadie. Datos personales a `null` al caducar el cuento: 7 días sin pagar, 30 pagado; facturas 4-6 años.

## 5. Canales (todos gratis)

1. **Etsy desde el día 1** como canal principal de venta: tráfico incluido, compradores que ya buscan esto, entrega digital sin envío. Ficha en inglés y en español.
2. **Web propia** para el tráfico que traigamos nosotros (vídeo, Pinterest, grupos) y para no depender de Etsy.
3. **Vídeo real** de un padre o madre enseñando el cuento a un niño real (los vídeos de marca no funcionan en este nicho).
4. **Pinterest** con las páginas de colorear: lento, gratis, inmune a los resúmenes de IA de Google.
5. **Grupos de crianza** con 10-20 cuentos de regalo a cambio de opinión honesta (semilla de reseñas en Etsy).

## 6. Prueba de validación (2 semanas, < 50 €)

- **Días 1-4 (fase 0, ya en marcha)**: spikes de imagen y texto, Stripe MP solicitado. El POD sale del camino crítico.
- **Días 5-10 (fase 1)**: pipeline completo con revisión humana, web con muestra instantánea y checkout, ficha en Etsy, 20 páginas de colorear gratis.
- **Días 11-14**: vídeo, pines, 10 regalos en grupos; medir.
- **Umbrales (acumulado a 14 días)**: ≥ 5 pagos → fase 3 (colorear) y preparar Navidad; 1-4 pagos → iterar precio, momento y tono; 0 pagos con ≥ 300 visitas → archivar dejando viva la galería.
- **Señales extra**: (1) **guion → muestra** (si la historia engancha) y **muestra → pago** (si las ilustraciones convencen): muestra → pago ≥ 20 % muy bien, 5-20 % aceptable, < 3 % → la muestra pasa a ser de pago simbólico; (2) % de compradores que pulsan «Quiero el libro impreso»: ≥ 25 % reabre la fase de imprenta.
- **Coste**: dominio 12 € + IA de pruebas ~15 € + listing Etsy 0,20 $ ≈ 30 €. Sin anuncios.
- **Calendario**: septiembre valida el mensaje; noviembre-diciembre valida el negocio.

## 7. Decisiones de este giro y por qué

| Decisión | Por qué |
|---|---|
| **Solo PDF en el MVP** | Cero envíos, cero trabajo manual salvo 5 minutos de revisión por pedido. El impreso se reabre con datos (botón de interés), no con intuición. |
| **Precio 12,90 € (ES) / 14,90 € (EN), no 4,99 €** | A 4,99 € el PDF era un gancho para el libro; solo, con 3,30 € de margen, hacían falta 150 ventas al mes para 500 €. En Etsy el tramo de 5-7 $ es «IA commodity» (nombre + aspecto) y el medio está en 15-20 $; nuestro producto (familia, momento, colorear, dedicatoria) pertenece al medio. A 12,90 € bastan 50 ventas al mes para 500 €. |
| **Vista previa personalizada en URL temporal, parcial** | Ver el cuento de tu propio hijo ya hecho es el mejor argumento de venta posible, y el enlace caduco crea urgencia sin trucos. Parcial (texto + 3 ilustraciones) porque un cuento entero cuesta 0,70 € y a 2 % de conversión serían 35 € de IA por venta; parcial son 0,15 €. La misma URL es después la entrega. |
| **La web no se apaga; caducan los cuentos** | No hace falta un despliegue temporal por cliente: una URL con token y `expires_at` hace lo mismo en la app que ya existe. Un tope diario de vistas previas controla el gasto. |
| **Sin foto** | Choca con el decálogo de la AEPD (27-01-2026) ya recogido en `../CLAUDE.md`: no se meten imágenes de personas, y menos de menores, en herramientas de IA sin encargado en la UE, consentimiento y registro. Es trabajo legal antes de saber si alguien paga. Además no diferencia (CuentosIA, ToonyStory, Lullaby, Hekaya ya la usan), concentra las peores reseñas del sector («una aproximación burda») y multiplica el fallo de consistencia que ya hemos medido. Se reabre si hay tracción, con Vertex AI en región UE y consentimiento explícito. |
| **Familia, amigos y momento vital como diferencial** | Texto puro, sin coste ni carga legal, y es lo que ningún competidor de IA hace. Wonderbly construyó 99 M€ con avatar por rasgos y cero fotos. |

## 8. Puntos abiertos [verificar]

1. ~~Precio y formato que sostiene Etsy~~ → resuelto (§8 de la investigación): 12,90 €/14,90 €. Queda **comprobar a mano 10 minutos** los listings (reseñas no verificables por scraping).
2. ~~Consistencia de personaje y de estilo~~ → **resuelto**: Nano Banana 2 vía OpenRouter la mantiene (dos personajes medidos).
3. Stripe Managed Payments: lo gestiona Edu; la web cobra por Etsy hasta entonces.
4. Modelo de texto con mejor español y menos reintentos (pendiente de OpenRouter).
5. ~~Entrega made-to-order y divulgación de IA en Etsy~~ → resuelto: archivo adjunto al completar el pedido (5 × 20 MB), casilla de IA obligatoria desde el 14-ene-2026. **Pendiente [verificar]**: si el IVA de un digital made-to-order lo recauda Etsy o recae en nosotros.

## 9. Riesgos

- **Negocio pequeño por diseño**: sin impreso ni anuncios, el techo realista son unos cientos de euros al mes hasta Navidad. Es el precio de no tener logística; el botón de impreso mide cuánto dejamos sobre la mesa.
- **Gemini Storybook gratis** comprime el PDF genérico → por eso el producto no es genérico: familia, momento, tono.
- **Deriva de estilo entre páginas** (medida) → verificador de estilo + fallback al catálogo + revisión humana.
- **Contenido inapropiado** → campos cerrados, filtro antes de cobrar, segunda pasada, revisión humana.
- **Dependencia de Etsy** → la web propia existe desde el día 1 y recoge los emails.
