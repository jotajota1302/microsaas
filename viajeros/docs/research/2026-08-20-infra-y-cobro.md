# Investigación · Costes de infraestructura y cobro (2026-08-20)

Informe generado por agente de investigación con fuentes consultadas el 2026-08-20. Etiquetas: **[V]** verificado en página oficial · **[S]** secundario · **[NE]** no encontrado. Cambio orientativo 1 USD ≈ 0,92 EUR.

## 1. Vercel Pro (2026)

| Concepto | Valor | Fuente |
|---|---|---|
| Precio plan Pro | **20 $/mes** (1 asiento; extra 20 $/mes; viewers gratis) | [V] https://vercel.com/docs/plans/pro-plan |
| Crédito de uso incluido | **20 $/mes** aplicable a toda la infraestructura; caduca cada mes | [V] |
| Incluido sin crédito | 1 TB Fast Data Transfer/mes · 10 M Edge Requests/mes | [V] |
| Invocaciones de funciones | Pro: 0,60 $/M (contra crédito) | [V] https://vercel.com/docs/functions/usage-and-pricing |
| Fluid Compute — Active CPU | fra1 0,184 $/h (iad1 0,128) | [V] |
| Fluid Compute — memoria | fra1 0,0152 $/GB-h | [V] |
| Duración máx. función | Default 300 s; Pro máx. 800 s (GA) | [V] https://vercel.com/docs/functions/configuring-functions/duration |
| Cron Jobs | Pro: 100/proyecto, cada minuto (Hobby: 1/día) | [V] https://vercel.com/docs/cron-jobs/usage-and-pricing |
| Vercel Blob | 0,023 $/GB-mes · ops avanzadas 5 $/M · `del()` gratis | [V] https://vercel.com/docs/vercel-blob/usage-and-pricing |
| Web Analytics | Pro 0,03 $/1K eventos contra crédito | [V] https://vercel.com/docs/pricing |
| Logs runtime | Pro 1 día; Observability Plus 30 días | [V] https://vercel.com/docs/logs/runtime |
| Hobby y uso comercial | Prohibido: "any method of requesting or processing payment" requiere Pro | [V] https://vercel.com/docs/limits/fair-use-guidelines |

## 2. Supabase (2026)

| Concepto | Free | Pro (25 $/mes) |
|---|---|---|
| Base de datos | 500 MB, Nano | 8 GB, luego 0,125 $/GB; 10 $ crédito compute |
| Storage | 1 GB | 100 GB, luego 0,0213 $/GB |
| Egress | 5 GB | 250 GB |
| MAU | 50.000 | 100.000 |
| Edge Functions | 500 K | 2 M |
| Backups | No | Diarios, 7 días |
| PITR | No | Add-on ~100 $/mes (requiere compute Small ~15 $) |
| Pausa por inactividad | **Sí, tras ~1 semana** | Nunca |
| Proyectos | 2 activos | Ilimitados |

Fuentes [V]: https://supabase.com/pricing · https://supabase.com/docs/guides/platform/free-project-pausing · https://supabase.com/docs/guides/platform/backups

- **Regiones UE** [V]: Irlanda `eu-west-1`, Londres `eu-west-2`, París `eu-west-3`, **Fráncfort `eu-central-1`**, Zúrich `eu-central-2`, Estocolmo `eu-north-1`.
- **Cifrado** [V]: AES-256 en reposo, TLS en tránsito. SOC 2 Type 2 (informe solo Team/Enterprise).
- **DPA + SCC** [V] https://supabase.com/legal/dpa — aceptar el DPA equivale a firmar las SCC.
- **pgsodium "pending deprecation"**; Supabase desaconseja TCE. Recomendación oficial: **Vault** o cifrar en la función serverless con clave en env var. [V] https://supabase.com/docs/guides/database/vault
- **Free para producción**: no prohibido, pero pausa tras 1 semana sin actividad y sin backups. Para datos de identidad con clientes de pago → Pro.

## 3. Stripe España (2026) [V] https://stripe.com/es/pricing

| Concepto | Tarifa |
|---|---|
| Tarjeta estándar EEE | **1,5 % + 0,25 €** |
| Tarjeta internacional | 3,15 % + 0,25 € (+2 % conversión) |
| SEPA Direct Debit | 0,35 €/transacción |
| Stripe Billing (suscripciones + metered, Meters API) | 0,7 % del volumen |
| Stripe Invoicing | 0,4 % por factura pagada |
| Stripe Tax | 0,5 %/transacción (prescindible si solo España) |
| Disputa | 20 € |
| **Mínimo por cargo** | **0,50 EUR** |

**Comisión efectiva (tarjeta EEE):**

| Cobro | Comisión | % efectivo | + Billing 0,7 % |
|---|---|---|---|
| 0,95 € | 0,264 € | **27,8 %** | 0,271 € |
| 10 € | 0,40 € | 4,0 % | 0,47 € |
| 39 € | 0,835 € | 2,14 % | 1,11 € |
| 50 € | 1,00 € | 2,0 % | 1,35 € |

**Conclusión:** cobrar 0,95 € por parte uno a uno es inviable (la parte fija se come el 26 %). Opciones: **packs prepagados** (10/39/50 €) o **facturación mensual por uso** (Billing metered, +0,7 %), que además encaja con Verifactu (una factura al mes por cliente).

## 4. Facturación Verifactu

- Fechas vigentes [V] RDL 15/2025: **1-ene-2027** sociedades; **1-jul-2027** autónomos. 2026 voluntario.
- Stripe Invoicing **no** cumple Verifactu [S].
- Aplicación gratuita de la AEAT [V]: 0 €, manual, sin API — válida para < 10 facturas/mes.

| Software | Precio | Estado |
|---|---|---|
| Billin | 6,6 €/mes anual | [V] |
| Quipu | 8,5 €/mes (API) | [V] |
| Holded | 14,50 €/mes anual (API) | [V] |
| Contasimple | gratis 12 docs/año; 10,95 €/mes | [V] |

Recomendación: AEAT gratis hasta 5 clientes; Quipu/Billin al automatizar.

## 5. Mensajería al huésped

| Canal | Coste unitario |
|---|---|
| WhatsApp Meta utility (España) | ≈ 0,0166 €/msj [S]; dentro de ventana de servicio abierta = gratis (posible cobro desde oct-2026, sin confirmar) |
| WhatsApp vía Twilio | +0,005 $/msj |
| WhatsApp vía 360dialog | 49 €/mes |
| SMS Twilio España | 0,0875 $/SMS [V] |
| Email Resend | Free 3.000/mes (100/día); Pro 20 $ = 50.000 [V] |
| Email Brevo | Free 300/día [S] |

| Canal | 1.000/mes | 10.000/mes |
|---|---|---|
| Email Resend | 0 € | 20 $ |
| WhatsApp Meta directo | ~17 € | ~166 € |
| SMS | ~88 $ | ~875 $ |

**Recomendación:** email por defecto + enlace `wa.me` que el gestor reenvía desde su propio WhatsApp (coste 0). WhatsApp API solo como opción premium futura. SMS descartado.

## 6. Dominio y buzón

- .com: Vercel 11,25 $/año [V]; Porkbun 11,08 $ [V]; Cloudflare 10,44 $ [S].
- .es: [NE] en Vercel/Porkbun/Cloudflare → comprobar en Dondominio/Nominalia (≈ 8-12 €/año típico).
- Zoho Mail Forever Free: 0 €, 5 usuarios, 1 dominio, sin IMAP [V].

## 7. Firma del huésped

- RD 933/2021 art. 4.2 [V]: partes "firmados por toda persona mayor de catorce años". No exige firma avanzada ni cualificada → **canvas manuscrito + hash + timestamp + IP + user-agent** = firma electrónica simple (eIDAS). Coste 0 €.
- Signaturit 35 €/usuario/mes, DocuSign 11 €/mes, Lleida.net ~1 €/crédito: inviables a 0,95 €/parte.

## 8. Monitoring

- Sentry Developer free 5K errores/mes [V]; Better Stack 10 monitores free [V]; UptimeRobot 50 monitores free [V]. Coste 0 €.

## 9. Resumen

### Coste fijo mensual mínimo (producción legal, 1 cliente)

| Partida | EUR/mes |
|---|---|
| Vercel Pro (compartido con el portafolio) | 18,4 € |
| Supabase Pro UE | 23 € |
| Dominio | 0,9 € |
| Resto (email, buzón, monitoring, Stripe) | 0 € |
| **Total** | **~42 €/mes** (≈ 51 € con Quipu) |

Con Supabase Free (fase de validación sin clientes de pago): **~19 €/mes**, de los que 18,4 € ya los paga el portafolio.

### Coste variable por parte (sin OCR)

Infra ≈ 0,0007 $ (< 0,1 céntimo). WhatsApp opcional +0,0166 €. Stripe ≈ 0,03 €/parte si se cobra mensual agregado (~40 partes); 0,264 €/parte si se cobra unitario (descartado).

### Coste mensual total por volumen

| Partida | 1.000 partes | 10.000 partes | 50.000 partes |
|---|---|---|---|
| Vercel Pro + uso | 20 $ | 20 $ | 20 $ |
| Supabase Pro | 25 $ | 25 $ | ~39 $ |
| Email | 0 | 20 $ | 35 $ |
| Verifactu | 0-9 € | ~9 € | ~15-30 € |
| **Infra total** | **≈ 42-51 €** | **≈ 70 €** | **≈ 108 €** |
| Stripe (cobro mensual agregado) | ~26 € | ~260 € | ~1.300 € |

Margen bruto a 0,95 €/parte, sin OCR: > 95 % desde 1.000 partes/mes.

### Huecos

- [NE] precio .es. [S] tarifas Meta España y posible cobro de mensajes de servicio desde oct-2026. Supabase Pro no da informe SOC 2 (basta DPA+SCC+región UE).
