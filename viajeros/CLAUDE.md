# Proyecto: Partes de viajeros (SES.Hospedajes) con IA

Micro-SaaS B2B para alojamientos turísticos pequeños y gestores de apartamentos en España: el huésped hace check-in desde un enlace/QR o el gestor fotografía el documento, la IA extrae los campos con salida estructurada, se genera el parte del RD 933/2021 y se comunica al Ministerio del Interior (SES.Hospedajes) dentro del plazo de 24 h. Cobro por parte enviado.

**Lee antes de nada**: `docs/mvp.md` (alcance, precio, arquitectura, prueba de validación) y `../CLAUDE.md` (stack, privacidad con IA, legal: es la autoridad compartida con `cuentos/` y `kit-local/`). Investigación de mercado con fuentes: `../docs/portfolio-2026.md` (§3 A1).

## Primer paso de la sesión

**No escribas código todavía.** Este proyecto empieza por validación: 50 emails a gestores pequeños (plantilla y lista de fuentes en `docs/mvp.md` §7). Se construye solo si ≥ 5 responden con intención de pago. Mientras llegan respuestas: verificar los puntos abiertos de `docs/mvp.md` §8 (especificación técnica vigente del servicio web de SES.Hospedajes, sistemas autonómicos, plazos de conservación) y montar la landing. Antes de diseñar el MVP definitivo, usar `superpowers:brainstorming` para cerrar alcance con JJ.

## Decisiones ya tomadas (no reabrir sin preguntar)

- **Formato**: pago por uso, 0,95-1,20 €/parte (alternativa 5 €/alojamiento/mes). Cobro con Stripe directo + IVA 21 % (clientes B2B en España; el MoR no hace falta aquí). Sin plan gratuito; 5 partes de prueba con tarjeta.
- **Datos de identidad = dato de alto riesgo**. Proyecto Supabase **propio en región UE**. La imagen del documento se procesa y **se borra en cuanto el gestor confirma los campos**; se conservan solo los campos exigidos por el RD durante el plazo legal (verificar: 3 años) y se cifran en reposo. **Nunca MiniMax** para OCR de documentos: proveedor con DPA en la UE o extracción local. Somos **encargado del tratamiento** del alojamiento (contrato art. 28 RGPD en las condiciones).
- **La IA solo extrae y propone; el gestor confirma; el código valida** (schema JSON del parte, reglas de formato de documento, fechas coherentes) antes de enviar. Nada se comunica al Ministerio sin validación.
- Cubrir primero **SES.Hospedajes (Policía Nacional / Guardia Civil)**. Cataluña (Mossos) y País Vasco (Ertzaintza) tienen sistemas propios: fuera del MVP, se indica en la landing.
- Idioma del producto: español (huéspedes: formulario de check-in también en inglés).
- Stack: vanilla + Vercel Pro + Supabase (UE) + función serverless para extracción y envío. Sin frameworks.

## Fases (cada una termina usable)

1. Validación: landing + 50 emails + ≥ 5 respuestas con intención de pago. Umbrales en `docs/mvp.md` §6.
2. Check-in del huésped: enlace/QR → formulario → foto del documento → extracción → confirmación por el gestor → parte en JSON validado (sin enviar todavía; exportable como XML/fichero para subir a mano a SES).
3. Envío automático a SES.Hospedajes por servicio web con las credenciales del alojamiento; reintentos; acuse guardado; aviso si quedan < 6 h de plazo.
4. Cobro por parte (Stripe) + panel mínimo del gestor (alojamientos, partes, estado, facturas).
5. iCal de Airbnb/Booking para crear estancias y enviar el enlace de check-in automáticamente.

## Estado

- [x] Investigación de mercado y ranking (2026-08-20)
- [ ] Fase 1 — validación (outreach en marcha: __ enviados / __ respuestas / __ con intención de pago)
- [ ] Fase 2 — check-in + extracción + JSON validado
- [ ] Fase 3 — envío a SES.Hospedajes
- [ ] Fase 4 — cobro y panel
- [ ] Fase 5 — iCal

Al completar una fase, actualiza este checklist. Lo que afecte a los tres proyectos va en `../CLAUDE.md`.

## Convenciones

- Código y comentarios en inglés; textos del producto en español (check-in también en inglés).
- Esquema JSON del parte y del estado en `schema/`; es la única referencia.
- Nada de datos reales de huéspedes en fixtures ni en tests: generar sintéticos.
- El repo git es el padre (`microsaas/`); no crear repos anidados. Repo público: nada de secretos ni datos reales.
