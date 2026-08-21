# Proyecto: Partes de viajeros (SES.Hospedajes)

Micro-SaaS B2B para gestores de alojamientos turísticos y hostales en España: el huésped hace check-in desde un enlace/QR, rellena sus datos (con lectura opcional de la MRZ **en su propio móvil**), firma, y nosotros generamos el parte del RD 933/2021 y lo comunicamos al Ministerio del Interior (SES.Hospedajes) dentro del plazo de 24 h. Cobro por parte enviado, en bonos prepago.

**Lee antes de nada**: `docs/plan-2026.md` (plan maestro: oportunidad, números, arquitectura, fases), `docs/mvp.md` (alcance vigente) y `../CLAUDE.md` (autoridad compartida del portafolio). Investigación con fuentes primarias en `docs/research/`. Esquemas oficiales del Ministerio en `schema/ses/v3.1.3/`.

## Primer paso de la sesión

Investigación y diseño están cerrados (2026-08-20). **Se construye ya**, sin esperar al umbral de outreach (decisión de JJ). El siguiente paso ejecutable es el plan `docs/superpowers/plans/2026-08-20-nucleo-parte-viajeros.md` (10 tareas TDD, sin dependencias externas ni credenciales). Antes de abrir una fase nueva que no esté planificada, usar `superpowers:brainstorming` con JJ.

## Decisiones ya tomadas (no reabrir sin preguntar)

- **NUNCA se pide, sube ni almacena una foto del documento de identidad.** La AEPD lo prohíbe (nota de 17-06-2025) y ya ha multado por ello (5.400 €, hotel de Girona, 30-07-2025). **No existe ni existirá un endpoint de extracción de imágenes.** Esta es la decisión más importante del proyecto y es también el argumento comercial.
- **El escáner de MRZ va en la v2, no en el primer lanzamiento** (decisión 2026-08-20, ver `docs/plan-2026.md` §4.2.1): cuesta ~9 días, más que todo el resto del MVP, y ahorra tiempo al huésped, no al cliente que paga. Se lanza con formulario tecleado. Cuando se aborde: **en el navegador**, `tesseract.js` (Apache-2.0) + traineddata de `web-mrz-reader` (ISC), **LSTM/OEM 1 obligatorio** (los modelos legacy rompen en iOS 17), y **prohibidas `@mrz-scanner` (AGPL) y `tesseract-mrz` (GPL)**. Los checksums y el parseo TD1/TD3 ya están hechos en `lib/identity.js`.
- **La IA no toca datos personales.** Se usa solo para traducir errores de SES al gestor, onboarding y SEO, sin ningún dato personal en el prompt. Para eso vale OpenRouter; **no vale** para documentos (DPA solo Enterprise, transferencias a EE. UU.).
- **El validador decide.** Nada se comunica al Ministerio sin pasar `lib/validate-parte.js`: esquema + reglas de negocio de SES + letra de control de NIF/NIE. La máquina propone, el huésped y el gestor confirman.
- **Formato y precio**: bonos prepago que no caducan (25 partes 24 €, 100 partes 89 €, 500 partes 399 €) y plan Hostal 19 €/mes con 25 incluidos. **Nunca cobro unitario de 0,95 €**: Stripe se lleva el 27,8 % de un cargo tan pequeño. Stripe directo + IVA 21 %, sin plan gratuito, 5 partes de prueba con tarjeta.
- **ICP**: gestores con ≥5 alojamientos y hostales/pensiones/hoteles pequeños. Un propietario con un apartamento genera ~3,5 €/mes; un hostal de 12 habitaciones, ~83 €/mes. Al propietario suelto se le atiende por autoservicio, sin esfuerzo comercial.
- **Datos de identidad = alto riesgo**. Proyecto Supabase **propio en región UE**, campos cifrados, RLS por cuenta, borrado a los 3 años y un día desde la salida. Somos **encargado del tratamiento**; el alojamiento es el responsable (contrato art. 28 RGPD en las condiciones).
- **Firma del huésped**: la exige el RD para mayores de 14 años pero **no viaja a SES** (no hay campo en el esquema). Canvas + hash + timestamp + IP + user-agent, conservada 3 años. Coste 0 €.
- Cubrir primero **SES.Hospedajes**. Cataluña (Mossos) y País Vasco (Ertzaintza) tienen sistemas propios: fuera del MVP, avisado en la landing. **Navarra sí usa SES.**
- Idioma del producto: español (check-in también en inglés).
- Stack: vanilla + Vercel Pro + Supabase (UE) + funciones serverless. Sin frameworks y **sin dependencias de producción** en `lib/`.

## Detalles técnicos verificados de SES (fuente: `docs/research/2026-08-20-ses-especificacion.md`)

- **SOAP 1.1**, endpoint único. Producción `https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion`; pruebas `https://hospedajes.pre-ses.mir.es/...`. Operaciones: `comunicacion`, `consultaLote`, `consultaComunicacion`, `anulacionLote`, `catalogo`. **No hay operación de modificación.**
- Autenticación **HTTP Basic** (usuario = NIF de la entidad + `WS`). El cuerpo va **XML → ZIP → Base64** dentro de `<solicitud>`; otra cosa da error 10111. Máximo **100 comunicaciones por petición**.
- TLS: la cadena es de **FNMT-RCM**, que Node no trae. Añadir la **CA raíz** al truststore — **nunca desactivar la verificación TLS**. Los certificados de servidor caducan el 3-4/09/2026.
- Los partes incluyen a **todos** los viajeros, también menores (sin documento si son menores de edad, pero con `parentesco`).

## Fases (cada una termina usable)

1. ~~Validación previa~~ → sustituida por outreach con producto funcionando (`docs/mvp.md` §6).
2. **Núcleo**: validador + generador XML + sobre SOAP, con tests. Plan escrito y listo para ejecutar.
3. **Check-in del huésped**: enlace/QR → formulario ES/EN → OTP → firma → parte validado, exportable como XML para subir a mano a la sede. Ya vendible sin la fase 4. **Sin escáner de documento.**
4. **Envío automático a SES** por servicio web con las credenciales del alojamiento; reintentos; acuse guardado; aviso si quedan < 6 h. **Bloqueado por credenciales de preproducción** (`docs/email-credenciales-pre.md`).
5. **Cobro** (Stripe, bonos) + panel del gestor.
6. **iCal** de Airbnb/Booking para crear estancias y enviar el enlace solo.

## Estado

- [x] Investigación de mercado y ranking (2026-08-20)
- [x] Investigación técnica, legal y de costes con fuentes primarias (2026-08-20) — `docs/research/`
- [x] Plan maestro y plan de implementación del núcleo (2026-08-20)
- [ ] Fase 2 — núcleo (validador + XML + SOAP)
- [ ] Fase 3 — check-in del huésped (sin escáner)
- [ ] Fase 4 — envío a SES (pedir credenciales PRE: __ enviado / __ recibido)
- [ ] Fase 5 — cobro y panel
- [ ] Fase 6 — escáner de MRZ (solo si los datos lo piden, tras el primer cobro)
- [ ] Fase 7 — iCal
- [ ] Outreach (__ enviados / __ respuestas / __ con intención de pago)

Al completar una fase, actualiza este checklist. Lo que afecte a los tres proyectos va en `../CLAUDE.md`.

## Convenciones

- Código y comentarios en inglés; textos del producto en español (check-in también en inglés).
- Esquema JSON del parte en `schema/parte.schema.json`; esquemas oficiales del Ministerio en `schema/ses/v3.1.3/` (**no modificar**: son la referencia).
- Nada de datos reales de huéspedes en fixtures ni en tests: generar sintéticos, con letras de control calculadas.
- El repo git es el padre (`microsaas/`); no crear repos anidados. **Repo público: ninguna credencial de SES, ni de cliente, ni ref de proyecto.**
