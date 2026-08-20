# MVP — Kit negocio local (placa QR 3D + página dinámica)

Versión 0 · 2026-08-20 · fuente de verdad del alcance. **[verificar]** = comprobar en la sesión.

## 1. Problema y cliente

- **Cliente**: negocio local de una ubicación (bar, cafetería, peluquería, clínica, tienda, apartamento turístico). Quiere más reseñas en Google, dejar de dictar la contraseña del WiFi, cobrar sin fricción o enseñar la carta sin reimprimir. Compra una pieza bonita de 20-35 € sin pensarlo; lo recurrente entra por la página.
- **Evidencia**: Amazon y Etsy están llenos de soportes NFC/QR "deja tu reseña" a 15-30 $ y de soportes de menú; los soportes de reseñas Google son una categoría activa; los generadores gratuitos de QR→STL tienen tráfico pero no ingresos (Hovercode: 5.000 visitas/día, ~150 $/mes). La combinación **pieza + página dinámica + servicio** no la hace nadie a escala de barrio.
- **Competencia**: soportes genéricos (sin página ni analítica), tarjetas NFC digitales (200+ vendedores, 22 % churn; apuntan a profesionales, no a locales), cartas digitales (10-30 €/mes, muy competidas en España: aquí son un módulo, no el producto).

## 2. Catálogo inicial (3 piezas)

| Pieza | Qué codifica | Estático/dinámico | Precio |
|---|---|---|---|
| **Placa "Déjanos tu opinión"** (mesa o pared, 80×80 mm) | enlace corto → página de opinión → enlace a Google Reviews del negocio | dinámico | 24,90 € |
| **Placa WiFi** (60×60 mm, nombre del local en relieve) | cadena `WIFI:T:WPA;S:…;P:…;;` | estático (sin conexión) | 19,90 € |
| **Soporte de mesa "Carta / Paga aquí"** (A7 inclinado) | enlace corto → página con carta PDF/enlaces de pago (Bizum QR de comercio **[verificar disponibilidad por banco]**, PayPal.me, enlace de reservas) | dinámico | 29,90 € |

Variantes: bicolor (3MF), con hueco para pegatina NFC NTAG215 (+3 €), pack de 5 para cadenas pequeñas. Todo con el nombre del negocio en relieve.

## 3. Planes

- **Básico** (incluido 12 meses con la pieza): página con los enlaces configurados, 1 cambio al mes, contador de escaneos. Después 19 €/año; si no renueva, la página se congela tal cual (el QR nunca se rompe).
- **Pro**: 9 €/mes o 79 €/año: página editable sin límite (horario, carta, enlaces, fotos), embudo de opiniones con aviso privado, **respuestas a reseñas redactadas por IA**, analítica por pieza (para negocios con varias), QR dinámico para campañas.
- **Agente** (Fase 5): 49-99 €/mes, atención por Telegram/WhatsApp oficial con OpenClaw aislado por cliente.

## 4. Arquitectura

- **Host de QR dinámico** (`q.<dominio>`): función edge: `/:id` → busca destino en Supabase (`kit.links`) → 302 → registra escaneo (`kit.scans`: id, timestamp, país por IP truncada, tipo de dispositivo por UA; sin cookies, sin IP completa). Panel: crear/editar destino, ver escaneos por día. **Componente compartido** (lo usarán `cuentos` y Tier B).
- **Páginas de negocio** (`<dominio>/b/<slug>`): plantilla estática con datos de Supabase (`kit.businesses`): nombre, logo, enlaces, horario, carta (PDF), botón de opinión. Render en servidor o cliente; cacheable.
- **Embudo de opiniones**: `/b/<slug>/opinion`: "¿Cómo ha ido?" con estrellas; **siempre** muestra el botón "Publicar en Google" (enlace directo al formulario de reseña con `placeid`) y, además, un campo "cuéntanoslo en privado" que llega al dueño por email/Telegram. Sin gating.
- **Respuestas IA**: el dueño pega la reseña → se anonimiza (nombres fuera) → M3 redacta 2 variantes en el tono del negocio → el dueño copia. Sin API de Google en el MVP.
- **Generador STL/3MF**: en cliente (JS): genera la matriz QR (versión mínima, ECC M/Q), valida módulo ≥ 1,2 mm a la escala elegida, construye la malla (placa + relieve de módulos + texto con fuente en relieve) y exporta STL (monocolor) o 3MF (bicolor). Vista previa 3D. Prueba de escaneo obligatoria en impresión real antes de publicar un modelo nuevo.
- **Pedidos**: Etsy al principio (tráfico) + tienda propia con Stripe (IVA 21 %); cola de impresión en Supabase (`kit.orders`: pieza, parámetros, estado, tracking); inserto GPSR generado en PDF con los datos del modelo y lote.
- **Datos** (Supabase schema `kit`): `businesses`, `links`, `scans`, `orders`, `subscriptions` (MoR), `reviews_drafts`. RLS por cuenta.

## 5. Canales y distribución

- **MakerWorld / Printables**: modelo gratuito "Placa de opiniones con tu QR" (paramétrico) con enlace al configurador; MakerWorld paga en efectivo por descargas (Exclusive Program) y las páginas rankean en Google. Diferenciarse del "Customizable QR Code Sign" ya existente con bicolor, texto en relieve y página dinámica incluida.
- **Etsy**: 2 listados al inicio (opiniones, WiFi), fotos reales en un bar, sección de cumplimiento GPSR rellena, envío España/UE. Comisiones ~14 %.
- **Barrio**: 10 negocios en persona con una pieza de muestra y la página ya montada con su nombre: el canal de validación más barato y el que enseña qué piden.
- **Después**: Amazon Handmade, asociaciones de comerciantes, vídeo corto "le imprimí esto al bar de abajo y duplicó sus reseñas" (solo si es verdad).

## 6. Prueba de validación (2 semanas, < 100 €)

- **Día 1-4**: host de QR dinámico mínimo + placa de opiniones impresa y escaneada + página de negocio de ejemplo + modelo publicado en MakerWorld y Printables + 2 listados en Etsy + landing corta.
- **Día 5-12**: 10 negocios en persona (regalar 3 piezas a cambio de foto y opinión; vender 7); post en r/3Dprinting y r/functionalprint (historia, no anuncio); 1 vídeo corto.
- **Día 13-14**: medir.
- **Umbrales**: ≥ 200 descargas del modelo **o** ≥ 3 ventas (Etsy + barrio) **o** ≥ 3 negocios que activan la página → Fase 2. Menos de 50 descargas y 0 ventas → revisar pieza/precio una vez; si repite, archivar (el host de QR se queda como componente para los otros proyectos).
- Coste: filamento ~10 €, Etsy 0,40 €, dominio corto ~15-30 € **[verificar precio del .es/.link corto]**, pegatinas NFC 5 €.

## 7. Puntos abiertos [verificar]

1. Impresora, volumen, filamentos y si hay multicolor (AMS) o se hace cambio de filamento por capa.
2. Dominio corto disponible y barato para `q.`.
3. Bizum QR para comercios: disponibilidad por banco y si puede codificarse en un QR propio o solo vía TPV.
4. Enlace directo al formulario de reseña de Google (`search.google.com/local/writereview?placeid=`) y cómo obtiene el dueño su Place ID sin dolor.
5. Biblioteca JS para generar STL/3MF con texto en relieve (three.js + three-bvh-csg, o generación directa de triángulos) y tamaño de fichero razonable.
6. Pegatinas NFC: modelo, coste y si se programan con el móvil del cliente o desde aquí.

## 8. Riesgos

- Commodity en hardware → ganar por diseño, personalización (nombre en relieve), entrega en 3-5 días en España y por la página.
- Review gating accidental → diseño del embudo fijado (todos ven el botón de Google); revisar contra la política de Google antes de publicar.
- Cambios de políticas de Etsy/MakerWorld → tienda propia desde la Fase 2.
- Tiempo de impresión como cuello → piezas < 60 min, cola, lotes nocturnos.

## 9. Fuentes

`../../docs/portfolio-2026.md` §3 A3, §1.3 (Etsy fees/GPSR, MakerWorld Exclusive Program, Printables), §8 (QRCode2STL, PrintPal, Etsy QR stand market, Amazon NFC review stand). Política de reseñas: Google Business Profile "Prohibited and restricted content" (review gating) **[enlazar en la sesión]**.
