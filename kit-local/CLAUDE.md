# Proyecto: Kit negocio local — placa QR impresa en 3D + página dinámica

Producto híbrido para bares, peluquerías, clínicas, tiendas y alojamientos: una **placa o soporte impreso en 3D** (reseñas de Google, WiFi, pago, carta/menú, check-in) cuyo QR apunta a una **página dinámica nuestra** que el negocio puede cambiar para siempre, con analítica de escaneos. El plan Pro añade página editable, embudo de opiniones y respuestas a reseñas redactadas por IA. Es la puerta de entrada al agente de atención (OpenClaw aislado por cliente), que es el ingreso recurrente de verdad.

**Lee antes de nada**: `docs/mvp.md` y `../CLAUDE.md` (stack, legal físico GPSR/envases, privacidad con IA: autoridad compartida con `viajeros/` y `cuentos/`). Investigación con fuentes: `../docs/portfolio-2026.md` (§3 A3, §1.3 canales físicos).

## Primer paso de la sesión

Usar `superpowers:brainstorming` para cerrar con JJ: catálogo inicial de piezas (3 modelos máximo), impresora/filamentos disponibles y si hay multicolor, dominio corto para el QR, y tienda (Etsy vs. propia). Después, en este orden: **host de QR dinámico** (componente compartido con los otros proyectos) → generador STL/3MF → modelo gratis en MakerWorld/Printables → 2 listados en Etsy → 10 negocios del barrio. La validación de 2 semanas está en `docs/mvp.md` §6.

## Decisiones ya tomadas (no reabrir sin preguntar)

- **No competimos con los generadores de QR→STL gratuitos** (QRCode2STL, PrintPal, etc.) ni con la tarjeta NFC digital (200+ vendedores). Vendemos la **pieza terminada + la página dinámica**; el configurador es un medio, no el producto.
- **Precio**: pieza 20-35 € (según tamaño/colores), envío aparte; **Pro 9 €/mes o 79 €/año** (página editable, analítica, embudo de opiniones, respuestas IA); Básico incluido 12 meses con la pieza, luego 19 €/año o la página queda congelada (nunca rota: el QR siempre resuelve).
- **QR dinámico**: dominio corto propio (`q.<dominio>/<id>`), redirección 302, contador de escaneos sin cookies ni datos personales (fecha, hora, país por IP truncada, tipo de dispositivo). El **WiFi es la excepción**: el QR codifica la cadena `WIFI:` directamente (estático, sin redirección) porque debe funcionar sin conexión.
- **Embudo de opiniones sin "review gating"**: la página pide opinión a todos y muestra a todos el enlace a Google; además ofrece "cuéntanoslo en privado". Filtrar a los descontentos para que no lleguen a Google viola las políticas de Google Business Profile y puede costar el perfil al cliente. Esto no se negocia.
- **Respuestas a reseñas con IA**: en el MVP el dueño pega la reseña y la IA redacta la respuesta (sin API de Google; sin datos personales hacia MiniMax: la reseña se anonimiza quitando nombres). La integración con la API de Google Business Profile queda para después.
- **Generador STL/3MF**: versión de QR mínima que quepa el enlace corto (versión 2-3), nivel de corrección M/Q, **módulo ≥ 1,2 mm para boquilla de 0,4**, zona de silencio de 4 módulos, relieve 0,6-1,0 mm o bicolor plano en 3MF; test de escaneo impreso antes de publicar cada modelo. Texto en relieve con el nombre del negocio.
- **Cumplimiento físico**: inserto GPSR en cada pieza, dossier técnico de 1 página por modelo, registro de envases; diseños sin aspecto de juguete. IVA español (Stripe/Etsy); la suscripción va por MoR.
- Stack: vanilla + Vercel Pro + Supabase compartido (schema `kit`) + generación de mallas en cliente (three.js/CSG o biblioteca STL ligera) o en función serverless. Sin frameworks de UI.

## Fases (cada una termina usable)

1. Host de QR dinámico (`q.`) con panel mínimo + generador de la primera placa (reseñas Google) + modelo gratis publicado en MakerWorld/Printables con QR al configurador + 2 listados en Etsy + 10 visitas a negocios. Prueba de 2 semanas.
2. Catálogo de 3 piezas (reseñas, WiFi, pago/menú) con configurador web y pedido con pago.
3. Pro: página editable (horario, carta, enlaces), embudo de opiniones, respuestas IA, analítica.
4. Fulfilment: cola de impresión, etiquetas, inserto GPSR automático, tracking.
5. Agente de atención (instancia OpenClaw aislada por cliente, Telegram/API oficial de WhatsApp, solo lectura) cuando ≥ 5 negocios paguen Pro.

## Estado

- [x] Investigación de mercado y ranking (2026-08-20)
- [ ] Fase 1 — QR dinámico + primera placa + canales (prueba: __ descargas / __ favoritos / __ ventas / __ negocios)
- [ ] Fase 2 — catálogo + configurador
- [ ] Fase 3 — Pro
- [ ] Fase 4 — fulfilment
- [ ] Fase 5 — agente

Al completar una fase, actualiza este checklist. El host de QR dinámico y el generador STL son **componentes compartidos**: al terminarlos, anotar ruta y API en `../CLAUDE.md`.

## Convenciones

- Código y comentarios en inglés; textos del producto en español (Etsy/MakerWorld también en inglés).
- Modelos fuente en `models/` (OpenSCAD o parámetros JSON), exportados en `dist/`; cada modelo con su ficha GPSR en `docs/gpsr/`.
- El repo git es el padre (`microsaas/`); no crear repos anidados. Repo público: nada de secretos ni datos reales.
