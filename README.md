# microsaas

Portafolio de micro-SaaS pequeños lanzados en paralelo desde España para el mundo (EN + ES), con coste de infraestructura casi nulo y una prueba de validación de 2 semanas por producto. Una carpeta por proyecto; lo común vive en la raíz.

| Carpeta | Proyecto | Formato | Estado |
|---|---|---|---|
| [`viajeros/`](viajeros/) | Partes de viajeros SES.Hospedajes con IA: el huésped hace check-in desde el móvil y el parte se comunica al Ministerio en plazo | B2B · 0,95 €/parte | Validación (outreach) |
| [`cuentos/`](cuentos/) | Cuentos y páginas para colorear personalizados, español primero, con libro impreso | B2C · pago único / créditos + POD | Fase 1 |
| [`kit-local/`](kit-local/) | Placa QR impresa en 3D + página dinámica + embudo de opiniones para negocios locales | Físico + suscripción | Fase 1 |

- **Decisiones comunes** (stack, privacidad con IA, cobros, suelo legal, convenciones): [`CLAUDE.md`](CLAUDE.md).
- **Investigación y ranking con fuentes** (por qué estos tres y no otros, qué se descartó, canales, legal España): [`docs/portfolio-2026.md`](docs/portfolio-2026.md).
- Cada proyecto: `CLAUDE.md` (instrucciones de sesión y checklist de fases) + `docs/mvp.md` (alcance, precio, arquitectura, prueba de validación con umbrales).

Stack: HTML/JS vanilla · Vercel · Supabase · MiniMax (pago por uso) · Merchant of Record para cobros globales. Regla de oro heredada de proyectos anteriores: **la IA genera datos bajo schema, el código valida y decide.**
