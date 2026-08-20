# Proyecto: Kit negocio local — placa QR impresa en 3D + página dinámica

Producto híbrido para bares, peluquerías, clínicas, tiendas y alojamientos: una **placa o soporte impreso en 3D** (reseñas de Google, WiFi, pago, carta/menú, check-in) cuyo QR apunta a una **página dinámica nuestra** que el negocio puede cambiar para siempre, con analítica de escaneos. El plan Pro añade página editable, embudo de opiniones y respuestas a reseñas redactadas por IA. Es la puerta de entrada al agente de atención (OpenClaw aislado por cliente), que es el ingreso recurrente de verdad.

**Lee antes de nada**: `docs/plan-2026-08-20.md` (research con cifras + plan de implementación tarea a tarea; §12 lista las decisiones pendientes de JJ), `docs/mvp.md` y `../CLAUDE.md` (stack, legal físico GPSR/envases, privacidad con IA: autoridad compartida con `viajeros/` y `cuentos/`). Investigación con fuentes: `../docs/portfolio-2026.md` (§3 A3, §1.3 canales físicos).

## Primer paso de la sesión

Research y brainstorming **hechos** (2026-08-20/21): el plan está en `docs/plan-2026-08-20.md` y las decisiones de producto están cerradas en su §12. **Empezar por la tarea T0** de su §8 (bootstrap) y seguir el orden T0 → T12; cada tarea trae criterio de "hecho". La validación de 2 semanas con umbrales está en §9 del plan (y en `docs/mvp.md` §6).

## Decisiones ya tomadas (no reabrir sin preguntar)

- **No competimos con los generadores de QR→STL gratuitos** (QRCode2STL, PrintPal, etc.) ni con la tarjeta NFC digital (200+ vendedores). Vendemos la **pieza terminada + la página dinámica**; el configurador es un medio, no el producto.
- **Precio** (cerrado 2026-08-21): placa de opiniones **29,90 € con NFC NTAG213 incluido** (variante sin NFC 24,90 € como entrada en Etsy), WiFi 19,90 €, soporte de mesa 29,90 €; envío aparte 4,90 €. **Pro 9 €/mes o 79 €/año**. **Básico gratis para siempre** — la página nunca se congela ni se cobra (todo el mercado español vende "sin suscripción" y servirla cuesta ~0,002 €/mes); Pro se vende por embudo, IA y analítica, nunca por desbloquear lo básico.
- **Cobros** (cerrado): **Stripe para todo** — Checkout directo con IVA 21 % para las piezas y **Stripe Managed Payments** (MoR) para Pro: 8,5 % efectivo frente al 11,6 % de Polar con tarjetas españolas. SMP exige revisión de elegibilidad: solicitarla en Fase 1.
- **Impresora** (cerrado): **Elegoo Centauri Carbon 2 Combo** con **CANVAS** (4 filamentos) → el bicolor sale de una pasada, sin `M600`. Boquilla 0,4 de acero, capa 0,16 mm, cama 256×256 con **zona excluida x 246-256 / y 0-20**: caben 9 placas de 80 mm con 3 mm de hueco en X. Slicer **ElegooSlicer** (fork de OrcaSlicer). Detalle verificado en `docs/plan-2026-08-20.md` §13.
- **3MF bicolor — crítico**: ElegooSlicer/OrcaSlicer **ignoran `basematerials` y `displaycolor`**; el asignador de filamentos lee **`m:colorgroup`** (extensión Materials, prefijo literal `m:`) y mapea el `pid` **del objeto**, descartando el de triángulo. Por tanto: **un objeto por color** + `m:colorgroup`. Con `basematerials` el cliente tendría que pintar a mano.
- **Imprimir siempre por bandeja completa**: cada cambio de color purga 0,6-1,0 g; repartido entre 9 placas son <0,015 €/pieza, de una en una se multiplica por nueve.
- **Dominio**: pendiente de elegir, **no bloquea**. Se desarrolla contra el `*.vercel.app` del proyecto y el host corto se lee de `PUBLIC_SHORT_HOST`; **nunca escribir el dominio a mano** en código ni tests. Comprarlo antes de T10 (va grabado en la pieza). Libres: `kitlocal.app`, y en `.es` `kitqr.es`, `qkit.es`, `placalocal.es`, `localkit.es`, `plaqa.es`.
- **QR dinámico**: dominio corto propio (`q.<dominio>/<id>`), redirección 302, contador de escaneos sin cookies ni datos personales (fecha, hora, país por IP truncada, tipo de dispositivo). El **WiFi es la excepción**: el QR codifica la cadena `WIFI:` directamente (estático, sin redirección) porque debe funcionar sin conexión.
- **Embudo de opiniones sin "review gating"**: la página pide opinión a todos y muestra a todos el enlace a Google; además ofrece "cuéntanoslo en privado". Filtrar a los descontentos para que no lleguen a Google viola las políticas de Google Business Profile y puede costar el perfil al cliente. Esto no se negocia.
- **Respuestas a reseñas con IA**: en el MVP el dueño pega la reseña y la IA redacta 2 variantes (sin API de Google; la integración con Google Business Profile queda para después). **Proveedor: Mistral Small en La Plateforme directo**, no MiniMax y **tampoco OpenRouter**: aquí somos encargados del tratamiento del negocio y hace falta DPA en la UE, que OpenRouter solo firma en Enterprise. Anonimizar (nombres, emails, teléfonos) es obligatorio **además** del DPA, no en su lugar: una reseña seudonimizada sigue siendo dato personal (EDPB 01/2025). Confirmar el DPA de Mistral antes de activar la función.
- **Generador STL/3MF**: versión de QR mínima que quepa el enlace corto (versión 2-3), nivel de corrección M/Q, **módulo ≥ 1,2 mm para boquilla de 0,4**, zona de silencio de 4 módulos, relieve 0,6-1,0 mm o bicolor plano en 3MF; test de escaneo impreso antes de publicar cada modelo. Texto en relieve con el nombre del negocio.
- **Cumplimiento físico**: inserto GPSR en cada pieza, dossier técnico de 1 página por modelo, registro de envases; diseños sin aspecto de juguete. IVA español (Stripe/Etsy); la suscripción va por MoR.
- **Canales — MakerWorld prohíbe los enlaces externos** (Community Guidelines desde 1-01-2025: enlaces y QR a webs ajenas, con revocación de puntos e ingresos). Allí se publica el paramétrico **sin enlaces** y la captación es la marca grabada en la pieza; el enlace al configurador va en Printables y en la landing propia.
- **Pago en la placa**: Bizum Pay para comercio (mayo 2026) usa **QR dinámico por operación**, no existe QR estático ni esquema `bizum://`. La placa "Paga aquí" apunta a nuestra página y de ahí a un enlace de pago con Bizum como método (Stripe o MONEI). **Nunca prometer "QR de Bizum"** en la ficha de producto.
- Stack: vanilla + Vercel Pro + Supabase compartido (schema `kit`). **Generación de mallas 100 % en el cliente y sin dependencias pesadas**: `qrcodegen` vendorizado + triángulos escritos a mano + `opentype.js`/`earcut` para el texto (~260 KB). Descartados three.js (750 KB, sin exportador 3MF) y manifold-3d (530 KB). Sin frameworks de UI.

## Fases (cada una termina usable)

1. Host de QR dinámico (`q.`) con panel mínimo + generador de la primera placa (reseñas Google) + modelo gratis publicado en MakerWorld (sin enlaces) y Printables + 2 listados en Etsy + 10 visitas a negocios. Prueba de 2 semanas. **Desglose tarea a tarea en `docs/plan-2026-08-20.md` §8 (T0-T12, ≈10 días-agente).**
2. Catálogo de 3 piezas (reseñas, WiFi, pago/menú) con configurador web y pedido con pago.
3. Pro: página editable (horario, carta, enlaces), embudo de opiniones, respuestas IA, analítica.
4. Fulfilment: cola de impresión, etiquetas, inserto GPSR automático, tracking.
5. Agente de atención (instancia OpenClaw aislada por cliente, Telegram/API oficial de WhatsApp, solo lectura) cuando ≥ 5 negocios paguen Pro.

## Estado

- [x] Investigación de mercado y ranking (2026-08-20)
- [x] Research propio + plan de implementación (`docs/plan-2026-08-20.md`) y decisiones de producto cerradas (2026-08-21)
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
