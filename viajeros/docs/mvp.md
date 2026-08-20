# MVP — Partes de viajeros (SES.Hospedajes) con IA

Versión 0 · 2026-08-20 · fuente de verdad del alcance. Lo marcado **[verificar]** se comprueba en la sesión antes de apoyarse en ello.

## 1. Problema y cliente

- **Obligación**: el RD 933/2021 obliga a alojamientos turísticos (hoteles, apartamentos, casas rurales, campings) y a intermediarios a registrar los datos de cada viajero y comunicarlos al Ministerio del Interior (plataforma **SES.Hospedajes**) en un plazo de **24 h** desde el check-in, y a conservar el registro (plazo legal **[verificar: 3 años]**). Obligatorio desde el **2-dic-2024**. Sanciones por la LO 4/2015 (leves 100-600 €, graves 601-30.000 €) **[verificar tramos]**.
- **Dolor**: el formulario web del Ministerio es manual y lento (muchos campos por viajero, incluido el pago); los PMS grandes lo resuelven pero cobran 15-30 €/mes por el conector y no sirven a quien gestiona 1-10 apartamentos con Excel y WhatsApp.
- **Cliente objetivo (ICP)**: gestor o propietario con **1-15 alojamientos**, sin PMS o con PMS básico, en zonas de Policía Nacional/Guardia Civil (fuera de Cataluña y País Vasco en el MVP). Compra porque le quita 10 minutos por reserva y el miedo a la multa.
- **Competencia**: partesdeviajeros.com (0,95 €/parte sin cuota, ~380 alojamientos, OCR), conectores de PMS (Avaibook, Smoobu, Lodgify, 15-30 €/mes), check-in online (Chekin, Civitfun: 5-15 €/alojamiento/mes). Hueco: precio por uso + check-in del huésped + cero configuración.

## 2. Propuesta y precio

- **Promesa**: "Envía el parte de viajeros en 2 minutos. Tu huésped hace el check-in desde el móvil y nosotros lo comunicamos al Ministerio."
- **Precio**: **0,95 €/parte** (pack 50 partes 39 €); alternativa 5 €/alojamiento/mes ilimitado. 5 partes de prueba con tarjeta registrada. Sin plan gratuito.
- **Cobro**: Stripe directo, IVA 21 %, factura automática (compatible Verifactu para nosotros desde 2027).

## 3. Flujo del MVP

1. El gestor da de alta un alojamiento (nombre, código de establecimiento SES, credenciales del servicio web **[verificar cómo se obtienen]**).
2. Crea una estancia (fechas, nº de huéspedes) → obtiene un **enlace/QR de check-in** que manda por WhatsApp (o lo imprime: conexión con `kit-local`).
3. El huésped abre el enlace (ES/EN), fotografía su documento, confirma/corrige los campos extraídos, firma datos de contacto y pago.
4. El gestor ve el parte propuesto, confirma, y el sistema lo **valida** (schema + reglas) y lo envía a SES.Hospedajes; guarda el acuse.
5. Aviso por email/WhatsApp si una estancia con check-in hecho no tiene parte enviado y quedan < 6 h.

## 4. Arquitectura

- Front vanilla (landing, panel del gestor, formulario de check-in) en Vercel Pro.
- `api/extract`: recibe la imagen → OCR/LLM con salida estructurada (**proveedor con DPA en la UE**, nunca MiniMax) → JSON de campos + confianza por campo → se devuelve al huésped para confirmar; la imagen **no se persiste** (memoria de la función) salvo durante segundos en Storage cifrado si hace falta reintento, y se borra al confirmar.
- `api/submit`: valida el JSON contra `schema/parte.schema.json` y reglas (tipo/formato de documento, mayores/menores, fechas, coherencia de estancia) → construye el mensaje del servicio web de SES **[verificar: XML `altaParteHospedaje`, SOAP, autenticación por usuario/contraseña del arrendador]** → envía → guarda acuse/error → reintentos con backoff.
- Supabase (proyecto propio, UE): `accounts`, `properties` (credenciales SES cifradas con clave del servidor), `stays`, `guests` (solo campos legales, cifrados), `parts` (estado, acuse, payload enviado), `billing`. RLS por cuenta. Borrado automático al cumplir el plazo legal.
- Regla de oro: **la IA propone, el huésped y el gestor confirman, el validador decide.** Sin validación no hay envío.

## 5. Datos que exige el parte [verificar lista vigente en la orden ministerial]

Por viajero: nombre, apellidos, sexo, tipo y número de documento, soporte del documento, nacionalidad, fecha de nacimiento, residencia habitual (dirección, municipio, país), teléfono/email, nº de viajeros, relación de parentesco si hay menores. Por estancia: fechas de entrada y salida, establecimiento. Por pago: tipo de pago, identificación del medio, titular, fecha de caducidad/fecha de pago **[verificar qué campos de pago siguen siendo obligatorios tras las modificaciones de 2024-2025]**.

## 6. Prueba de validación (2 semanas, < 100 €)

- **Día 1-2**: landing ES con precio visible, demo de 20 s (formulario de check-in simulado con datos sintéticos), formulario "quiero probarlo" con tarjeta opcional, página SEO "cómo enviar el parte de viajeros a SES.Hospedajes paso a paso".
- **Día 3-9**: **50 emails** (plantilla §7) + 20 mensajes en grupos de Facebook/Telegram de propietarios de apartamentos turísticos + asociaciones (FEVITUR, asociaciones provinciales de viviendas turísticas).
- **Día 10-14**: 10 llamadas de 15 min con los que respondan.
- **Umbrales**: ≥ 5 respuestas con intención de pago (un "sí, cuánto cuesta / cuándo" cuenta; un "interesante" no) → construir Fase 2. 1-4 → una segunda ronda con otro ICP (casas rurales, hostales). 0 con ≥ 30 emails entregados → archivar y anotar por qué.
- Coste: dominio 10 € + 0 € el resto.

## 7. Plantilla de email de outreach (ajustar a cada destinatario)

> Asunto: ¿Cuánto tardas en enviar los partes de viajeros?
>
> Hola {nombre}, gestiono un pequeño proyecto para propietarios de apartamentos turísticos y estoy hablando con gente que, como tú, tiene que enviar el parte de cada huésped a SES.Hospedajes.
>
> Estoy montando una herramienta muy simple: mandas un enlace al huésped, él hace el check-in desde el móvil con una foto del DNI, y nosotros enviamos el parte al Ministerio en el plazo. Sin cuota: **0,95 € por parte**.
>
> ¿Me cuentas en dos líneas cómo lo haces hoy y qué es lo que más te quita tiempo? Si te encaja, te doy las 20 primeras comunicaciones gratis a cambio de tu opinión.
>
> Gracias, {JJ} · {teléfono}

Dónde encontrar 50 destinatarios: anuncios de "gestión de apartamentos turísticos" en Idealista/Milanuncios por provincia, webs de gestores locales (Google Maps "gestión apartamentos turísticos {ciudad}"), grupos de Facebook "Propietarios viviendas turísticas {provincia}", asociaciones autonómicas de VUT.

## 8. Puntos abiertos [verificar antes de la Fase 2]

1. Especificación técnica vigente del servicio web de SES.Hospedajes (formato, autenticación, entorno de pruebas, códigos de error) y cómo obtiene un alojamiento sus credenciales de integración.
2. Lista exacta de campos obligatorios tras las modificaciones normativas de 2024-2025 (especialmente los de pago).
3. Plazo legal de conservación del registro y quién responde (alojamiento vs. encargado).
4. Sistemas autonómicos (Mossos, Ertzaintza) y si hay plan de integración con SES.
5. Proveedor de OCR/LLM con DPA en la UE y coste por documento (objetivo < 0,05 €/parte).
6. Si la firma del huésped es necesaria y en qué forma.

## 9. Riesgos

- Error legal en un parte enviado → reclamación del cliente. Mitigación: validador estricto, confirmación humana, acuses guardados, condiciones claras (el obligado sigue siendo el alojamiento).
- Los PMS regalen el conector → competir por el segmento sin PMS y por el check-in del huésped.
- Datos de identidad filtrados → proyecto UE, cifrado, borrado de imágenes, sin datos personales hacia IA sin DPA, registro de tratamientos.
- Cambios en la plataforma del Ministerio → capa de envío aislada y monitorizada.

## 10. Fuentes

`../../docs/portfolio-2026.md` §3 A1 y §8 (partesdeviajeros.com, guía SES.Hospedajes de net2rent, comparativa de PMS de vezpa). Normativa: RD 933/2021 (BOE), LO 4/2015.
