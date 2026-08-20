# MVP — Cuentos y páginas para colorear personalizados

Versión 0 · 2026-08-20 · fuente de verdad del alcance. **[verificar]** = comprobar en la sesión.

## 1. Problema y cliente

- **Quién compra**: padres, abuelos y tíos buscando un regalo con el nombre del niño (cumpleaños, Navidad, Reyes, comunión, "primer día de cole"); profesores y familias buscando páginas para colorear de un tema concreto.
- **Evidencia**: ColorBliss (páginas para colorear por IA, 9 $/20 créditos) llegó a 4.000 $/mes con una persona y SEO de cola larga; Wonderbly (libros personalizados, ilustración humana) fue comprado por Penguin Random House por 99 M€ con 11 M de libros vendidos, 85 % fuera del Reino Unido; el digital-only en inglés (Childbook.ai, KidzTale, Lullaby.ink) cobra 2,50-5 $/cuento y está saturado. **El hueco**: español primero (cola larga poco disputada), calidad de ilustración consistente, y el **impreso** como producto principal de margen.
- **Competencia directa en español**: pocos con impreso y estilo consistente **[verificar: buscar "cuento personalizado IA" y "libro personalizado niño" en ES y LatAm]**.

## 2. Propuesta y precio

- **Promesa**: "Un cuento donde tu hijo es el protagonista, ilustrado y en tu buzón en una semana."
- **Precio**: PDF 4,99 € · libro impreso tapa blanda 24,90 € (+ envío) · tapa dura 34,90 € · colorear 4,99 €/20 créditos. Vista previa gratis de 2 páginas con marca de agua.
- **Unit economics** (objetivo): cuento = ~2.000 tokens de salida + 10 imágenes ≈ 0,05-0,10 € en IA; libro POD ≈ 8-12 € coste **[verificar tarifas]** → margen > 50 % en impreso, > 95 % en digital.

## 3. Producto

**Cuento**: 10-12 páginas ilustradas, 60-90 palabras por página, edad 3-8, una moraleja suave. Personalización por texto: nombre, edad, rasgos (pelo, gafas, color favorito), mascota, afición, un amigo/hermano opcional, tema de la colección (mar, bosque, espacio, dinosaurios, princesas y caballeros, fútbol…). Dedicatoria en la primera página.

**Colorear**: página A4 en blanco y negro puro, línea limpia, sin sombreados; temas libres dentro de la lista permitida; packs temáticos.

**Lo que NO hay en el MVP**: fotos, voz, vídeo, app móvil, cuentos en más de 2 idiomas, múltiples protagonistas con parecido real.

## 4. Arquitectura

- **Generación** (reutiliza `rpg-narrativo`): `api/story` → prompt con schema JSON (páginas con `text`, `image_hint`, `character_sheet` fijo) → M3 con `thinking: disabled` → `repairJson` → **validador** (`lib/validate-story.js`: nº de páginas, longitud, estructura, palabras prohibidas, `{{NOMBRE}}` presente, sin datos personales en el prompt) → hasta 3 reintentos. Coste y latencia conocidos del RPG (50-160 s) → generación **asíncrona**: el cliente paga, recibe un email cuando el cuento está listo (≤ 10 min).
- **Ilustración**: MiniMax `image-01` con sufijo de estilo fijo por colección + descripción idéntica del personaje en cada página (la consistencia por prompt es imperfecta: **[verificar]** si `subject_reference` de image-01 funciona con una ilustración propia del personaje, no con una foto; si no, aceptar variación leve y vender "estilo acuarela infantil"). Fallback: ilustración de catálogo por tema si una página falla tras 2 intentos (igual que el RPG).
- **Render**: PDF con fuente infantil legible, sangrado para imprenta, portada con título y nombre. Generación en servidor (pdf-lib) o cliente.
- **Impreso**: API de POD con entrega en UE **[verificar y elegir: Gelato (fotolibros, red global), Peecho (libros con API, NL), Lulu (print API, libros), Printful (no libros)]**; pedido automático tras el pago con el PDF de imprenta; tracking al cliente.
- **Datos** (Supabase, schema `cuentos`): `orders` (estado, producto, precio, MoR id), `stories` (JSON validado, URLs de imágenes, PDF), `credits`, `billing`. Sin cuenta obligatoria: email + enlace mágico.
- **Cobro**: MoR para digital (IVA mundial resuelto); impreso con Stripe (o checkout del POD) con IVA español/OSS.
- **Privacidad**: el nombre y la dedicatoria se insertan en servidor después de la IA; ninguna foto; los datos del pedido se borran a los 12 meses salvo factura.

## 5. SEO y canales

- Galería gratuita de páginas para colorear pre-generadas, una URL por tema ("dibujos para colorear de tiburones", "…de unicornios"), ES y EN con `hreflang`: activo que compone aunque el producto cambie. 50 temas en el lanzamiento, 200 en el mes 3.
- Vídeo corto: "le hice a mi sobrina un cuento donde ella es la protagonista" (proceso de 20 s, libro físico al final). TikTok/Reels/Shorts ES y EN.
- Reddit: r/SideProject (historia del motor reutilizado), subs de crianza con cuidado (valor, no promo).
- Afiliación 30 % a blogs/cuentas de crianza (Polar tiene hub integrado).
- Estacionalidad fuerte: Navidad/Reyes, Día del Padre/Madre, vuelta al cole. Planificar el impreso con margen de envío.

## 6. Prueba de validación (2 semanas, < 100 €)

- **Día 1-3**: 1 colección completa (un cuento de muestra generado y pulido a mano), landing ES/EN con precio, preview gratis, checkout vivo (el cuento personalizado se genera y revisa a mano al principio: "entrega en 48 h"), 20 páginas de colorear gratis como SEO.
- **Día 4-10**: Reddit + 1 vídeo/día + 30 mensajes a cuentas de crianza con acceso gratis + afiliación; 50 € en Meta/TikTok ES con el vídeo.
- **Día 11-14**: medir.
- **Umbrales**: ≥ 5 pagos → Fase 2 automática; 1-4 → iterar precio/colección; 0 pagos y < 3 % de altas con ≥ 300 visitas → archivar (la galería de colorear se queda como activo SEO).
- Coste: dominio 10 € + ads 50 € + POD de 1 muestra ~15 €.

## 7. Puntos abiertos [verificar]

1. POD con API, calidad y coste para libro infantil 20×20 o A5 apaisado, entrega en España/UE, y si acepta pedidos unitarios automáticos.
2. Consistencia de personaje con image-01 (`subject_reference` con ilustración) vs. prompt-only; alternativa de proveedor de imagen con referencia si hace falta.
3. Fuente tipográfica infantil con licencia para impresión.
4. Competencia directa en español con impreso.
5. Política del MoR elegido para contenido infantil personalizado (suele ser sin problema).

## 8. Riesgos

- Calidad percibida de la ilustración (manos, rostros) → estilo que perdona (acuarela/estilizado), revisión automática y fallback de catálogo.
- Contenido inapropiado generado → lista de temas cerrada, filtro de entrada, segunda pasada de revisión, muestreo manual.
- Saturación en inglés → no competir en EN en precio, sí en español y en impreso.
- Estacionalidad → la galería de colorear da tráfico plano todo el año.

## 9. Fuentes

`../../docs/portfolio-2026.md` §3 A2 y §8 (ColorBliss en Starter Story, Wonderbly/PRH, lullaby.ink comparativa 2026). Motor: `../../../rpg-narrativo/` (CLAUDE.md, `api/generate.js`, `lib/validate-chapter.js`).
