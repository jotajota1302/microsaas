# Portafolio micro-SaaS — decisiones comunes a los tres proyectos

Repo `microsaas` (github.com/jotajota1302/microsaas): **una carpeta por proyecto**. Este fichero es la **autoridad compartida** de `viajeros/`, `cuentos/` y `kit-local/` y se carga en cualquier sesión abierta dentro del repo. Las tres sesiones de Claude trabajan en paralelo: lo que esté aquí no se rediscute en cada carpeta; si un proyecto necesita cambiar algo común, se anota aquí y se avisa a los otros. Investigación completa con fuentes: `docs/portfolio-2026.md`. Cada proyecto tiene su propio `CLAUDE.md` y `docs/mvp.md`: léelos antes de tocar esa carpeta.

```
microsaas/
├── CLAUDE.md                 Este fichero: decisiones comunes
├── docs/portfolio-2026.md    Investigación y ranking (fuentes)
├── docs/backlog.md           Ideas a futuro con su disparador; descartes razonados
├── viajeros/                 A1 · partes de viajeros SES.Hospedajes (B2B, pago por uso)
├── cuentos/                  A2 · cuentos y colorear personalizados (B2C + impreso)
└── kit-local/                A3 · placa QR 3D + página dinámica (físico + suscripción)
```

## Regla de juego del portafolio

- Cada proyecto tiene una **prueba de 2 semanas y < 100 €** con umbrales escritos antes de construir (en su `docs/mvp.md`). Primero validación, luego código.
- Precio visible y cobro vivo desde el día 1. **Nunca "gratis para siempre"**, nunca lifetime deals, nunca anuncios como modelo.
- Umbrales de decisión (acumulado a 14 días): matar si 0 pagos **y** < 3 % de altas con ≥ 300 visitas; iterar si 1-4 pagos; doblar si ≥ 5 pagos. Para lo físico la señal es Etsy/MakerWorld (descargas, favoritos, primera venta).
- Un producto muerto deja vivos dominio y página SEO (coste ≈ 0).
- Una sola persona "builder" en Reddit/TikTok que publica varias cosas; nunca cuentas falsas por producto.

## Stack (decidido, no reabrir)

- **Front**: HTML/JS vanilla, sin frameworks ni build (igual que RPG y CRIME). Landing bilingüe **EN + ES** con `hreflang`, precio visible, demo de 20 s.
- **Hosting**: **Vercel Pro** (un asiento, 20 $/mes; Hobby prohíbe uso comercial). Un proyecto Vercel por producto, dominio propio, **Spend Management activado**. El PC de casa solo para OpenClaw y procesos internos (lotes, pruebas), nunca para lo que ve un cliente.
- **Datos**: Supabase. `cuentos` y `kit-local` comparten el proyecto Supabase existente (el del RPG, compartido con otras apps; ref en `.env`, nunca en el repo) con **un schema por producto** (`cuentos`, `kit`), RLS en todas las tablas, grants por schema, nunca `GRANT ALL` a `anon`. `viajeros` (documentos de identidad) va en **proyecto propio en región UE** — decisión por sensibilidad de datos. Login anónimo permitido; magic link para clientes de pago.
- **IA**: MiniMax **pago por uso** (M3 0,30/1,20 $ por M tokens; image-01 0,0035 $/imagen). La suscripción Coding Plan es solo para nuestro agente de código. **Regla de oro heredada del RPG: la IA genera datos con JSON schema, el código valida y decide.** Todo output de IA pasa por un validador antes de usarse.
- **Privacidad con la IA (obligatorio)**: MiniMax no tiene DPA público y aloja datos en EE. UU./Singapur → **nunca enviarle datos personales** (ni nombre real con apellidos, ni email, ni IDs, ni fotos de personas, ni documentos). Si un producto necesita procesar datos personales con IA (OCR de DNI, fotos de niños), usa un proveedor con DPA en la UE (Anthropic/OpenAI con DPA, Azure/Google Document AI región UE) o proceso local sin salida, y se documenta en el registro de tratamientos.
- **Cobros**: digital global → **Merchant of Record** (Polar.sh Starter o Stripe Managed Payments; Lemon Squeezy NO). B2B España y físico → Stripe directo con IVA 21 % (o Etsy). Webhooks a la tabla `billing` del schema del producto.
- **Facturación propia**: software compatible Verifactu (obligatorio para autónomos desde 1-jul-2027).
- **Analítica**: sin cookies de terceros (Umami/Plausible o Vercel Analytics) → sin banner de cookies. UTM en todo enlace que salga.
- **Operaciones**: OpenClaw en el PC como capa interna: alertas de pagos/errores por Telegram, triaje de soporte, cola de contenido, informe semanal por producto.

## Suelo legal (una vez, sirve para los tres)

1. Alta en Hacienda **modelo 036** antes de la primera venta (el 037 ya no existe).
2. **RETA con tarifa plana** (~89 €/mes) en cuanto haya ingresos recurrentes (STS 941/2025: "no llego al SMI" ya no protege con suscripciones).
3. Web: aviso legal LSSI (nombre, NIF, domicilio, email), privacidad + registro de actividades (**Facilita_RGPD** de la AEPD), condiciones con desistimiento (descargas: checkbox de inicio inmediato + email; suscripción: 14 días con prorrata), botón "desistir".
4. DPAs: Supabase (región UE), Vercel, MoR, proveedor de IA con datos personales.
5. Físico: inserto **GPSR** en cada pieza (nombre, dirección, email, lote, advertencias), dossier técnico de 1 página por modelo, sección "EU product compliance" en Etsy, registro de envases (RPP + Ecoembes Comerciales, < 20 €/año). Evitar diseños con aspecto de juguete.

## Convenciones

- Código y comentarios en inglés; textos de producto en español (y en inglés donde la landing sea bilingüe).
- Cada proyecto: `CLAUDE.md` (instrucciones de sesión) + `docs/mvp.md` (alcance, precio, arquitectura, prueba de validación con umbrales) + `schema/` si hay JSON de IA.
- **Git**: el repo es esta carpeta (`microsaas/`), una carpeta por proyecto. No crear repos anidados en los proyectos y **nunca `git init` en la raíz de `IDEAS/`** (hay `.env` con credenciales de otros proyectos). El repo es **público**: ningún secreto, ref de proyecto ni dato de cliente real en él.
- Secretos en `.env` del proyecto (gitignored) y en las env vars de Vercel.
- Al terminar una fase, actualizar el checklist del `CLAUDE.md` del proyecto. Lo que afecte a los tres, aquí.

## Componentes reutilizables (quién los construye, quién los usa)

| Componente | Lo construye | Lo reutiliza |
|---|---|---|
| Host de QR/enlaces dinámicos con analítica de escaneos (`q.<dominio>/<id>`) | `kit-local` | cuentos (QR en el libro impreso), futuros Tier B |
| Plantilla de landing EN/ES con precio + checkout MoR + UTM | el primero que la necesite (previsiblemente `cuentos`) | los otros dos |
| Generador STL/3MF de placas con QR (tamaño de módulo por boquilla) | `kit-local` | Tier B (placa de canción, tarjeta CV) |
| Pipeline "JSON validado → imágenes MiniMax con estilo fijo" | ya existe en `../rpg-narrativo/` (fuera del repo) | `cuentos` |
| Extracción estructurada de PDF/imagen con validador | `viajeros` | Tier C (huella, migración Verifactu) |
| Webhooks de cobro → tabla `billing` + alertas OpenClaw | el primero que cobre | los otros dos |

Cuando un proyecto termine un componente reutilizable, lo anota aquí con la ruta.
