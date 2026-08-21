# Investigación · Especificación técnica de SES.Hospedajes (estado a 2026-08-20)

Informe generado por agente de investigación. **[V]** = leído en documento oficial del Ministerio del Interior (PDF/XSD/WSDL de la SGSICS) · **[S]** = blogs de PMS, foros, código de terceros · **[NE]** = no localizado.

**Fuentes primarias** (copias en `ses/` y `../../schema/ses/v3.1.3/`):
- "Interfaz servicios externos – Servicio de Comunicación Hospedajes" **v3.1.2 (17/09/2024)**, 76 págs.: https://seshospedajes.es/wp-content/uploads/2024/12/MIR-HOSPE-DSI-WS-Servicio-de-Hospedajes-Comunicaciones-v3.1.2.pdf
- Misma especificación **v3.1.3 (08/01/2025)** + XSD + WSDL: https://github.com/ToniIAPro73/anclora-syncxml/tree/development/schemas/ses-hospedajes/v3.1.3
- "Instrucciones para el alta masiva de comunicaciones" v1.1.0 en dominio oficial: https://hospedajes.ses.mir.es/hospedajes-sede/assets/docs/Instrucciones.pdf · v1.1.1 (30/09/2024): https://seshospedajes.es/wp-content/uploads/2024/12/Instrucciones-v1.1.1.pdf
- RD 933/2021: https://www.boe.es/eli/es/rd/2021/10/26/933
- Nota MIR 03/01/2023: https://www.interior.gob.es/opencms/es/detalle/articulo/Interior-habilita-una-plataforma-web-para-facilitar-el-registro-de-informacion-a-las-empresas-de-hospedaje-y-alquiler-de-vehiculos/
- Nota AEPD 17/06/2025: https://www.aepd.es/prensa-y-comunicacion/notas-de-prensa/aepd-informa-de-que-no-esta-permitido-solicitar-copia-dni-o-pasaporte-en-hospedajes

`sede.mir.gob.es` e `interior.gob.es` rechazan el fetch automatizado (certificado FNMT / 403).

## 1. Vías de comunicación

[V] Cuatro tipos de comunicación: **PV** partes de viajeros, **RH** reservas de hospedaje, AV contratos de vehículos, RV reservas de vehículos. Cada comunicación recibe un **código de comunicación** (UUID 36 chars) al darse de alta, usado para consultar o anular.

1. **Formulario web manual** en la sede (una a una).
2. **Alta masiva por fichero XML** en la web: 1..n comunicaciones del mismo tipo; plantilla descargable; las erróneas se corrigen en "Consulta y gestión de mis comunicaciones". **El XML es el mismo que el del servicio web.** Límite por fichero [NE].
3. **Servicio web SOAP 1.1** (document/literal), endpoint único:

```
Pruebas     https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion
Producción  https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion
```

WSDL (`comunicacion.wsdl`, ns `http://www.soap.servicios.hospedajes.mir.es/comunicacion`): portType `ComunicacionPort` con operaciones `comunicacion`, `consultaLote`, `consultaComunicacion`, `anulacionLote`, `catalogo`; binding SOAP 1.1 document, `soapAction=""` en las cinco. **No existe operación `altaParteHospedaje`**: es el nombre del XSD/namespace del XML interno; la operación es `comunicacion` con `tipoOperacion=A` y `tipoComunicacion=PV`. `GET ...?wsdl` no responde; el WSDL se obtiene del paquete documental.

Operaciones [V, spec §3]:
- `comunicacion` (asíncrona, por lotes): alta (A), anulación (B) o consulta (C). Devuelve nº de lote; un proceso periódico lo procesa.
- `consultaLote` (síncrona): estado de hasta **10 lotes**.
- `consultaComunicacion` (síncrona): contenido completo por código.
- `anulacionLote` (síncrona): anula todas las comunicaciones de un lote.
- `catalogo` (síncrona): tablas maestras (desde v3.1.2).

**PV vs RH** [V]: RD art. 6 — comunicar al reservar/contratar (→ RH) y al inicio del servicio (→ PV), "de manera inmediata, y en todo caso en un plazo no superior a 24 horas". En PV `codigoEstablecimiento` es obligatorio a nivel de `solicitud` (un fichero = un establecimiento), todas las personas `rol=VI`, tantas como `numPersonas`. En RH cada comunicación lleva `establecimiento`, titular `rol=TI`, datos de persona mayoritariamente opcionales. [S] Las reservas por OTA las comunica la plataforma; el alojamiento sigue siendo responsable del PV.

## 2. Autenticación y credenciales

[V, spec §2.2] "Los servicios web publicados implementan seguridad básica HTTP … cabecera `Authorization: Basic <token>`, token = usuario:contraseña en Base64. La comunicación se establece a través de un túnel SSL para lo que se requiere la importación de un certificado provisto en el almacén de certificados de confianza de la aplicación cliente. Las credenciales se obtendrán en el momento del registro de la entidad en el formulario que la SES publicará en la Sede Electrónica del MIR."

- **HTTP Basic + TLS; sin WS-Security ni certificado de cliente.** El certificado a importar es el **de servidor**: `*.ses.mir.es` y `*.pre-ses.mir.es` están emitidos por **FNMT-RCM "AC Componentes Informáticos"**, CA no incluida en los almacenes por defecto de Node/Java/Python (los repos públicos usan `rejectUnauthorized:false` o un truststore propio). **Ambos certificados caducan el 3-4 de septiembre de 2026** (comprobado con openssl 2026-08-20) → prever rotación del truststore.
- Identificadores: `codigoArrendador` (String(10), asignado al registrar la entidad) en la cabecera; `codigoEstablecimiento` (String(10)) dentro del XML; `aplicacion` (String(50)) texto libre. **No existe registro de "empresa de software"** en la especificación.
- **Usuario WS** [S, ≥5 fuentes coincidentes]: se activa en "Registro de establecimientos y entidades → Mis datos registrados" marcando **"Envío de comunicaciones por servicio web"**; llega un correo con usuario y contraseña. El usuario es el **NIF/CIF de la entidad + "WS"** (ej. `74587985KWS`, `B58658985WS`). La contraseña WS es distinta de la del portal; **una sola contraseña por código de arrendador** (cambiarla afecta a todos sus establecimientos). Evitar acentos/símbolos en la contraseña.
- **Autorizar a un tercero**: no hay delegación ni OAuth. El arrendador entrega a la aplicación `codigoArrendador`, `codigoEstablecimiento`(s), usuario WS y contraseña WS. Un gestor con N propietarios maneja N juegos de credenciales.
- Error **10120** "El arrendador no tiene habilitada la opción de realizar operaciones a través del servicio web" confirma el flag por arrendador.

## 3. Entorno de pruebas

- [V] Existe PRE: `https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion`.
- **Cómo se solicita**: [NE en fuente primaria]. Indicios [S]: credenciales y certificados de PRE los entrega el Ministerio a petición; correo de soporte **ses.hospedajes@interior.es**. Si las credenciales WS de producción sirven en PRE: [NE].

## 4. Estructura del mensaje y del XML

**Sobre SOAP de alta** (Anexo I, literal) [V]:

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:com="http://www.soap.servicios.hospedajes.mir.es/comunicacion">
  <soapenv:Header/>
  <soapenv:Body>
    <com:comunicacionRequest>
      <peticion>
        <cabecera>
          <codigoArrendador>0000000001</codigoArrendador>
          <aplicacion>Centro de reservas de prueba</aplicacion>
          <tipoOperacion>A</tipoOperacion>
          <tipoComunicacion>PV</tipoComunicacion>
        </cabecera>
        <solicitud>Fichero XML comprimido en ZIP y codificado en Base64</solicitud>
      </peticion>
    </com:comunicacionRequest>
  </soapenv:Body>
</soapenv:Envelope>
```

- `solicitud` = **XML UTF-8 → ZIP → Base64** (error 10111 si no). Nombre del fichero dentro del ZIP [NE]; los clientes usan `altaParteHospedaje.xml`.
- **Límite: 100 comunicaciones por petición de alta**; 10 lotes por consulta.
- Cabeceras HTTP: `Content-Type: text/xml;charset=UTF-8`, `SOAPAction: ""` [S, coherente con el WSDL].

**XML interno del parte (`altaParteHospedaje.xsd`, ns `http://www.neg.hospedajes.mir.es/altaParteHospedaje`)** [V]:

```
solicitud: codigoEstablecimiento (1) | comunicacion (1..n)
comunicacion: contrato | persona (1..n)
contratoHospedajeType: referencia string50 | fechaContrato date | fechaEntrada dateTime | fechaSalida dateTime
  | numPersonas int | numHabitaciones int? | internet boolean? | pago pagoType
pagoType: tipoPago string5 | fechaPago date? | medioPago string50? | titular string100? | caducidadTarjeta string7? (MM/AAAA)
personaHospedajeType: rol (VI|CP|CS|TI) | nombre string50 | apellido1 string50 | apellido2 string50?
  | tipoDocumento string5? | numeroDocumento string15? | soporteDocumento string9? | fechaNacimiento date
  | nacionalidad [a-zA-Z]{3}? | sexo string1? | direccion direccionType | telefono string20? | telefono2 string20?
  | correo (pattern [^@]+@[^\.]+\..+, max 250)? | parentesco string2?
direccionType: direccion string100 | direccionComplementaria string100? | codigoMunicipio [0-9]{5}? | nombreMunicipio string100? | codigoPostal string20 | pais [a-zA-Z]{3}
```

**Reglas de negocio que el XSD no expresa pero el servicio valida** [V, spec §3.1.1.1 / Instrucciones §3]:
- `rol` en PV siempre `VI`; tantas `persona` como `numPersonas`.
- `apellido2` obligatorio si `tipoDocumento=NIF` (v3.1.3; en v3.1.2 también NIE).
- `tipoDocumento` y `numeroDocumento` obligatorios si la persona es **mayor de edad**; `soporteDocumento` obligatorio si NIF/NIE; `numeroDocumento` con formato válido para NIF/NIE.
- `sexo` figura como obligatorio en la tabla descriptiva aunque el XSD lo permita vacío → enviarlo siempre.
- Al menos uno de `telefono`, `telefono2`, `correo`.
- `parentesco` obligatorio si la persona es **menor de edad**: al menos un adulto del parte debe tener informada la relación con el menor.
- `codigoMunicipio` (INE 5 dígitos) obligatorio si `pais=ESP`; `nombreMunicipio` obligatorio si el país no es España.
- Fechas `AAAA-MM-DD` y `AAAA-MM-DDThh:mm:ss`; los ejemplos oficiales mezclan con y sin offset; [S] un cliente afirma que el servicio exige offset explícito (+01:00/+02:00) — verificar en PRE.

**Tablas de códigos** (Instrucciones v1.1.1 §8; en WS vía `catalogo`) [V]:
- TIPO_DOCUMENTO: `NIF`, `NIE`, `PAS`, `OTRO`.
- SEXO: `H`, `M`, `O`.
- TIPO_PARENTESCO: `AB` abuelo/a, `BA` bisabuelo/a, `BN` bisnieto/a, `CD` cuñado/a, `CY` cónyuge, `HJ` hijo/a, `HR` hermano/a, `NI` nieto/a, `PM` padre/madre, `SB` sobrino/a, `SG` suegro/a, `TI` tío/a, `YN` yerno/nuera, `TU` tutor/a, `OT` otro.
- TIPO_PAGO: `EFECT`, `TARJT`, `PLATF`, `TRANS`, `MOVIL`, `TREG`, `DESTI`, `OTRO`.
- TIPO_ESTABLECIMIENTO: AGROTURISM, ALBERGUE, APART, APARTHOTEL, AP_RURAL, BALNEARIO, BUNGALOW, CAMPING, CASA, CASA_HUESP, CASA_RURAL, CHALET, GLAMPING, HABITACION, HOSTAL, HOTEL, H_RURAL, MOTEL, OFIC_VEHIC, PARADOR, PENSION, REFUGIO, RESIDENCIA, VFT, VILLA, VUT, OTROS.
- País: **ISO 3166-1 alfa-3** (`ESP`). Municipio: **código INE 5 dígitos** (`28079` Madrid).

**Respuesta** (`comunicacionResponse`) [V]: `estadoRespuestaType { codigo int (0 = Ok) | descripcion | lote UUID? }`. En consulta: `lote, tipoComunicacion, tipoOperacion, fechaPeticion, fechaProcesamiento, codigoEstado, descEstado, …, resultadoComunicaciones[] { orden, anulada?, (codigoComunicacion | tipoError + error) }`. `codigoEstado` del lote: 1 tramitado sin errores, 2 errores en cabecera/formato, 3 error inesperado, 4 en proceso, 5 pendiente, 6 tramitado con errores en algunas comunicaciones. Los ejemplos del Anexo tienen erratas (`codigoRetorno`, `tipoComuniacion`, `resutadoComunicacion`): **manda el XSD**; parsear con tolerancia. Los errores por comunicación también se notifican por correo a la entidad.

**Códigos de error (spec §5)** [V]: 0 Ok · 10100 no informado código de arrendador · 10101 no informado código de aplicación · 10103 código de arrendador no existe · 10107 usuario incorrecto · 10108 no informada la petición · 10109 no informada la cabecera · 10110 no informada la solicitud · 10111 formato de solicitud incorrecto (xml UTF-8, zip, Base64) · 10112 no informado código de operación · 10113 código de comunicación no existe · 10116 no informado tipo de comunicación · 10117 operación solo A/C/B · 10118 error en formato XML · 10119 arrendador no puede realizar ese tipo de comunicaciones · 10120 arrendador sin servicio web habilitado · 10121 error de validación · 10122 tipo de comunicación no válido · 10128 usuario no indicado en cabecera · 10130 valor incorrecto para $NOMBRE_CAMPO · 10131 obligatorio $NOMBRE_CAMPO · 10136 superado nº máximo de comunicaciones a consultar · 10140 solicitud no informada · 10150 superado nº máximo de caracteres de aplicación · 10159 tipo de comunicación no válido · 10160 no informado código de comunicación · 10180 formato de código de comunicación no válido · 10999 error no controlado.

**Anulación**: XML ns `…/anularComunicacion` con `codigoComunicacion[]`. **Consulta de lotes**: ns `…/consultarComunicacion` con `lote[]`. **No existe operación de modificación** en 3.x.

## 5. Límites y plazos

- [V] Inmediato y nunca > **24 h** desde reserva/contrato/anulación (RH) e inicio del servicio (PV). Conservación **3 años** (RD art. 5).
- **Menores**: el PV incluye **todas** las personas alojadas (`numPersonas` = nº de `persona`); el ejemplo oficial incluye un niño sin documento con `parentesco=HJ`. El RD exime a < 14 de firmar; el servicio exige documento solo a mayores de edad y `parentesco` a **menores de 18** con al menos un adulto relacionado.
- **Viajeros añadidos después**: [NE explícito]. Sin modificación, enviar un **nuevo PV** con el viajero añadido o anular y reenviar. [S] En la web se puede editar desde "Mis comunicaciones → Lotes".
- Las comunicaciones con error **no se graban**: reenviar corregidas en un nuevo lote.

## 6. Código público existente

| Repo / paquete | Lenguaje, fecha | Qué aporta |
|---|---|---|
| https://github.com/pvilas/hospedajes | Python, 2023-05, GPL-3 | Interfaz 3.0.0: XSD, plantilla SOAP idéntica a la oficial, `parte.xml` comentado, **CSV de municipios INE y CP**. Usa `verify=False`. |
| https://github.com/ToniIAPro73/anclora-syncxml | TypeScript, activo 2026-08, MIT | **Paquete oficial v3.1.3 (XSD + WSDL + PDF)**; `src/lib/ses/client.ts` con los 5 sobres SOAP (`fast-xml-parser`, Basic Auth, `soapaction: ""`). Sin evidencia de aceptación en PRE todavía. |
| https://github.com/jlnieto/checkpol | Java, 2026-07 | Script de truststore PKCS12 con el certificado de `pre-ses` (confirma la CA FNMT). |
| https://github.com/vicentalonso/ses-hospedajes-node | TS, 2026-04 | Endpoint y sobre **no coinciden con el WSDL oficial**; útil solo por el detalle del offset horario. |
| https://github.com/flujoai-cloud/ses-hospedajes-adapter | Python/n8n, 2026-06 | Borrador; lista de "por confirmar" útil. |
| npm `ses-hospedajes` 1.0.x | 2025-03 | Sin README ni repo. Inutilizable. |

Aviso: aparecieron credenciales filtradas en un paste público → **nunca credenciales WS en el repo**.

## 7. Novedades 2025-2026

- [V] **v3.1.3 (08/01/2025)**: único cambio en hospedaje: `apellido2` obligatorio solo con NIF. Sin versión posterior pública. **Sin ruptura de interfaz desde 2023.**
- [V] Cambios acumulados desde 3.1.0: `documento` → `numeroDocumento`; `fechaCaducidadTarjeta` → `caducidadTarjeta` (MM/AAAA); `correo` hasta 250; `catalogo` sustituye a las tablas del documento; campo `anulada`; rol en PV solo `VI`.
- [V] Obligatoriedad plena desde **02/12/2024** (sustituye a Hospederías de la Guardia Civil y WebPol/e-Hotel). Cataluña y País Vasco siguen con Mossos/Ertzaintza.
- [V] **Nota AEPD 17/06/2025**: prohibido pedir copia del DNI/pasaporte; basta formulario con los datos del Anexo I y comprobación visual presencial o, en línea, certificado digital / datos del medio de pago / OTP a teléfono o email. **Relevante: un OCR de DNI como flujo principal choca con esta nota.**
- [S] Sin página de estado oficial; incidencias frecuentes; error típico "403 / sitio no seguro" por certificados.
- Operativo: **certificados TLS de prod y pre caducan el 3-4/09/2026**.

## Recomendación práctica

Cliente SOAP propio (ninguna librería pública es fiable) contra el WSDL/XSD v3.1.3: sobre `com:comunicacionRequest` + ZIP+Base64 del XML `altaParteHospedaje`, Basic Auth, `SOAPAction: ""`, truststore con la cadena FNMT "AC Componentes Informáticos"; validar el XML contra XSD + reglas de negocio antes de enviar; guardar `lote` y consultar `consultaLote` hasta `codigoEstado ∈ {1,6}`; poblar catálogos vía `catalogo`. Solicitar credenciales de PRE a ses.hospedajes@interior.es antes de tocar producción.

**Fuentes secundarias**: holahuesped.com · timonhotel.com · checkinvacacional.com · registroviajero.com · partee.es · chekin.com · upmarket.cloud · gotocheck.pro · hosteltur.com (URLs en el informe original del agente).
