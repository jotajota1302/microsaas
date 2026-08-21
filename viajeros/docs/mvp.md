# MVP — Partes de viajeros (SES.Hospedajes)

Versión 1 · 2026-08-20 · **fuente de verdad del alcance**. Todos los `[verificar]` de la versión 0 están cerrados con fuentes primarias; los informes están en `research/` y el plan completo con números en `plan-2026.md`.

> **Cambio de rumbo respecto a la versión 0**: el flujo "el huésped fotografía su DNI y lo procesamos con IA" **queda descartado**. La AEPD prohibió el 17-06-2025 pedir copia, foto o escaneo del documento en hospedajes, y ya ha multado por ello (5.400 €, hotel de Girona, 30-07-2025). El producto se construye sobre un formulario que rellena el huésped, con lectura opcional de la MRZ **en su propio móvil**. Ver §3.

## 1. Problema y cliente

- **Obligación**: el RD 933/2021 obliga a alojamientos turísticos e intermediarios a registrar los datos de cada viajero y comunicarlos al Ministerio del Interior (**SES.Hospedajes**) en **24 h**, y a conservar el registro **3 años desde la finalización del servicio** (art. 5.3, verificado en BOE). Exigible desde el **2-dic-2024**. Sanciones (LO 4/2015 art. 39.1, verificado): **leves 100-600 €** (comunicar fuera de plazo, registros deficientes), **graves 601-30.000 €** (no comunicar, carecer de registro).
- **Dolor**: el formulario del Ministerio es manual y por viajero; los PMS lo resuelven por 15-30 €/mes a quien ya paga PMS; y desde la nota de la AEPD, quien fotografiaba el DNI para ahorrar tiempo tiene un problema nuevo.
- **Cliente objetivo (ICP)**: **gestor con ≥5 alojamientos y hostales/pensiones/hoteles pequeños**, fuera de Cataluña y País Vasco. Corregido respecto a la v0: un propietario con un solo apartamento genera ~3,5 €/mes (3,7 partes), mientras que un hostal de 12 habitaciones genera ~83 €/mes. El propietario suelto se atiende por autoservicio, no con esfuerzo comercial.
- **Competencia**: partesdeviajeros.com (0,95 €/parte sin cuota, con OCR de documento), conectores de PMS (15-30 €/mes), check-in online tipo Chekin/Civitfun (5-15 €/alojamiento/mes). Detalle en `research/2026-08-20-mercado.md`.

## 2. Propuesta y precio

- **Promesa**: "El parte de viajeros, enviado en plazo y **sin pedirle una foto del DNI a tu huésped**."
- **Precio**: bonos prepago que no caducan — **25 partes 24 €**, **100 partes 89 €**, **500 partes 399 €**; plan Hostal 19 €/mes con 25 partes incluidos y 0,75 € el extra. 5 partes de prueba con tarjeta registrada. Sin plan gratuito.
  - *Por qué bonos y no cobro unitario*: Stripe cobra 1,5 % + 0,25 € → un cargo de 0,95 € pierde el **27,8 %** en comisión; un bono de 24 € pierde el 2,5 %.
- **Cobro**: Stripe directo, IVA 21 %. Facturación con la app gratuita de la AEAT hasta 5 clientes; Quipu/Billin (~8 €/mes, con API) al automatizar. Verifactu obligatorio para autónomos el **1-jul-2027**.

## 3. Flujo del MVP

1. El gestor da de alta un alojamiento: código de arrendador, código de establecimiento y **usuario/contraseña del servicio web**. Se obtienen en la sede del MIR marcando "Envío de comunicaciones por servicio web" en *Registro de establecimientos y entidades → Mis datos registrados*; el usuario es el NIF/CIF de la entidad + `WS`.
2. Crea una estancia (fechas, nº de viajeros) → **enlace/QR de check-in** que reenvía por su propio WhatsApp o email.
3. El huésped abre el enlace (ES/EN) y:
   - se autentica con un **código OTP** a su email o teléfono (método que la AEPD acepta expresamente);
   - rellena sus datos (nombre, documento, nacimiento, nacionalidad, residencia, contacto), con buscador tolerante de municipios para el campo del código INE;
   - **firma** en pantalla.

   *En la v2 se añade "escanear mi documento": la cámara lee la MRZ y **el procesamiento ocurre en su propio móvil**, sin subir ni almacenar la imagen. Va después del primer cobro porque cuesta ~9 días y ahorra tiempo al huésped, no al cliente que paga (`plan-2026.md` §4.2.1).*
4. El gestor ve el parte propuesto, confirma, y el sistema lo **valida** (esquema + reglas de SES) y lo envía; guarda el número de lote y el acuse.
5. Aviso al gestor si una estancia con check-in hecho no tiene parte enviado y quedan < 6 h de plazo.

**Regla de oro**: la máquina propone, el huésped y el gestor confirman, **el validador decide**. Sin validación no hay envío.

## 4. Arquitectura

- Front vanilla (landing, panel del gestor, formulario de check-in) en Vercel Pro.
- **Lectura de MRZ en el navegador** (`tesseract.js` con modelo OCR-B + verificación de checksums propia). **No existe `api/extract`**: ninguna imagen de documento llega al servidor. Si la MRZ no lee, el huésped teclea; documentos sin MRZ (carné de conducir) siempre a mano.
- `api/submit`: valida el JSON contra `schema/parte.schema.json` y las reglas de negocio → genera el XML `altaParteHospedaje` → **ZIP → Base64 → sobre SOAP `comunicacionRequest`** → POST con **HTTP Basic Auth** y truststore con la CA raíz **FNMT-RCM** → guarda lote/acuse/error → reintentos con backoff.
- Cron cada 10 min: envía pendientes, consulta lotes (`consultaLote`) hasta `codigoEstado ∈ {1,6}`, avisa de plazos.
- Supabase (**proyecto propio, región UE**): `accounts`, `properties` (credenciales WS cifradas con clave del servidor), `stays`, `guests` (solo campos legales, cifrados, **nunca imágenes**), `parts`, `billing`, `audit`. RLS por cuenta. Borrado automático a los 3 años y un día desde la salida.
- **IA**: fuera del camino de datos personales. Se usa solo para traducir los errores de SES al gestor, onboarding y contenido SEO — sin ningún dato personal en el prompt. OpenRouter vale para eso; **no vale** para documentos de identidad (DPA solo Enterprise, transferencias a EE. UU.).

## 5. Datos que exige el parte (verificado en BOE y en el XSD oficial)

**Por viajero** (Anexo I A.3): nombre, apellido1, apellido2, sexo, tipo y número de documento, **número de soporte**, nacionalidad, fecha de nacimiento, residencia habitual (dirección, municipio, país), teléfono/correo, número de viajeros, **parentesco si hay menores de edad**.
**Por estancia** (A.4): referencia, fecha de contrato, fecha y hora de entrada y de salida, nº de habitaciones, Internet sí/no, y establecimiento.
**Por pago**: en el servicio web **solo `tipoPago` es obligatorio**; `fechaPago`, `medioPago`, `titular` y `caducidadTarjeta` son opcionales y **no existe campo para el número de tarjeta ni el IBAN**.
**Firma**: la exige el RD (art. 4.2, mayores de 14 años) pero **no viaja a SES** — no hay elemento de firma en el esquema. Se conserva en nuestro registro 3 años como firma electrónica simple con evidencias (hash, timestamp, IP, user-agent), válida por eIDAS art. 25.

Reglas que el esquema no expresa pero SES valida: rol siempre `VI`; tantas personas como `numPersonas`; documento obligatorio en mayores de edad; `soporteDocumento` con NIF/NIE; `apellido2` con NIF; al menos un contacto; `parentesco` en menores con adulto relacionado; `codigoMunicipio` INE si el país es ESP y `nombreMunicipio` si no; **máximo 100 comunicaciones por petición**.

## 6. Validación comercial

Decisión de JJ (2026-08-20): **se construye sin esperar al umbral de respuestas**; el outreach se hará con producto funcionando, que convierte mucho mejor que una landing. Se mantienen los umbrales como termómetro, no como puerta:

- Landing ES/EN con precio visible y demo de 20 s con datos sintéticos, más páginas SEO: "cómo enviar el parte a SES.Hospedajes paso a paso", "qué pasa si no envío el parte", "la AEPD prohíbe pedir copia del DNI: qué hacer".
- 50 emails a gestores de ≥5 alojamientos y hostales (no a propietarios sueltos) + asociaciones (FEVITUR, Apartur, asociaciones provinciales).
- Termómetro: ≥ 5 con intención de pago → empujar; 1-4 → segunda ronda con hostales y casas rurales; 0 con ≥ 30 entregados → replantear el canal antes que el producto.

## 7. Plantilla de email de outreach

> Asunto: ¿Cuánto tardas en enviar los partes de viajeros?
>
> Hola {nombre}, he montado una herramienta pequeña para gestores que tienen que enviar el parte de cada huésped a SES.Hospedajes.
>
> Funciona así: mandas un enlace a tu huésped, él rellena sus datos desde el móvil (puede escanear la franja de su documento para no teclear, **la foto no sale de su teléfono**) y nosotros comunicamos el parte al Ministerio dentro del plazo, con el acuse guardado. Sin cuota: pagas por parte enviado, desde 0,80 €.
>
> Lo del escaneo importa: desde junio de 2025 la AEPD prohíbe pedir copia del DNI al huésped y ya hay multas de 5.400 €. Nosotros no guardamos ninguna imagen.
>
> ¿Me cuentas en dos líneas cómo lo haces hoy? Si te encaja, te doy las 20 primeras comunicaciones gratis a cambio de tu opinión.
>
> {JJ} · {teléfono}

Dónde encontrar destinatarios: Google Maps "gestión apartamentos turísticos {ciudad}" y "hostal {ciudad}", anuncios de gestión en Idealista/Milanuncios, grupos de Facebook de propietarios de VUT por provincia, asociaciones autonómicas.

## 8. Puntos abiertos — cerrados

| # | Pregunta de la v0 | Respuesta verificada |
|---|---|---|
| 1 | Especificación del servicio web y credenciales | **SOAP 1.1**, endpoint `https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion` (pre: `hospedajes.pre-ses.mir.es`), 5 operaciones, **HTTP Basic Auth**, XML→ZIP→Base64. Credenciales: el arrendador activa el WS en la sede y recibe usuario (`NIF+WS`) y contraseña. No hay delegación a terceros: el gestor nos da sus credenciales. XSD y WSDL en `../schema/ses/v3.1.3/` |
| 2 | Campos obligatorios tras 2024-2025 | Anexo I intacto; en el WS solo `tipoPago` del bloque de pago. Nº de tarjeta e IBAN **no se piden** |
| 3 | Conservación y responsable | **3 años** desde la finalización del servicio (art. 5.3). El alojamiento es **responsable**; nosotros **encargados** (contrato art. 28 RGPD obligatorio en las condiciones) |
| 4 | Sistemas autonómicos | Cataluña → Mossos (fichero `.txt` propio); País Vasco → Ertzaintza (sede propia); **Navarra usa SES**. Sin plan público de integración → fuera del MVP, avisado en la landing |
| 5 | Proveedor de OCR con DPA en la UE | **Ya no hace falta**: la MRZ se lee en el dispositivo. Si algún día se necesita fallback, Mistral OCR (UE, DPA público) es la primera opción; OpenRouter self-serve queda descartado |
| 6 | Firma del huésped | Obligatoria para mayores de 14 (art. 4.2), **no se transmite a SES**, se conserva 3 años. Firma simple con evidencias; canvas, coste 0 € |

**Nuevo punto abierto**: obtener credenciales de **preproducción**. Se solicitan a `ses.hospedajes@interior.es`; es el camino crítico más largo del proyecto. Borrador en `email-credenciales-pre.md`.

## 9. Riesgos

- **Sanción de la AEPD por tratamiento excesivo** → mitigado por diseño: no se solicita, transmite ni almacena ninguna imagen de documento; la MRZ se procesa en el dispositivo del interesado; información clara en el momento de la captura.
- Error legal en un parte enviado → validador estricto, confirmación humana, acuses guardados, condiciones que dejan claro que el obligado es el alojamiento.
- **Cambio normativo**: la Comisión Europea abrió el 04-06-2026 un procedimiento de infracción (INFR(2026)4005) por la amplitud de datos y la conservación, y la orden ministerial de desarrollo está paralizada. El RD sigue exigible. Mitigación: capa de envío aislada, pago por uso, sin contratos anuales.
- **Certificados TLS del Ministerio caducan el 3-4/09/2026** → fijar la CA raíz FNMT, no el certificado de servidor, y alertar de caducidad desde el cron.
- Que los PMS regalen el conector → competir en el segmento sin PMS y en el mensaje "sin foto del DNI".
- Filtración de datos de identidad → proyecto UE propio, cifrado en columna, sin imágenes, RLS, auditoría, borrado a 3 años.

## 10. Fuentes

Informes con fuentes primarias en `research/`: marco legal (BOE, AEPD, CGPJ, BOPV), especificación SES (PDF oficial v3.1.2/v3.1.3, XSD, WSDL), OCR e identidad con RGPD, infraestructura y cobro, y mercado. Esquemas oficiales en `../schema/ses/v3.1.3/`. Plan completo con números y fases: `plan-2026.md`.
