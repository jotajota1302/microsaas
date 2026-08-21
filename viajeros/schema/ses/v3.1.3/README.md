# SES.Hospedajes — esquemas oficiales del servicio web (v3.1.3, 08/01/2025)

Ficheros XSD + WSDL del paquete oficial del Ministerio del Interior (SGSICS) "MIR-HOSPE-DSI-WS-Servicio de Hospedajes - Comunicaciones v3.1.3.zip", republicado por un integrador en
https://github.com/ToniIAPro73/anclora-syncxml/tree/development/schemas/ses-hospedajes/v3.1.3 (descargado 2026-08-20). La especificación en PDF está en `../../../docs/research/ses/`.

| Fichero | Qué define |
|---|---|
| `comunicacion.wsdl` | Servicio SOAP 1.1 `ComunicacionPortService`, 5 operaciones: `comunicacion`, `consultaLote`, `consultaComunicacion`, `anulacionLote`, `catalogo`. Endpoint producción `https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion`; pruebas `https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion`. |
| `comunicacion.xsd` / `tipoComunicacion.xsd` | Sobre de petición (cabecera: `codigoArrendador`, `aplicacion`, `tipoOperacion` A/C/B, `tipoComunicacion` PV/RH/AV/RV; `solicitud` = XML → ZIP → Base64) y respuesta (`codigo`, `descripcion`, `lote`, resultados por comunicación). |
| `altaParteHospedaje.xsd` | XML interno del **parte de viajeros (PV)**: `codigoEstablecimiento` + `comunicacion[]` (`contrato` + `persona[]`). **Es el que usamos.** |
| `altaReservaHospedaje.xsd` | XML interno de la comunicación de reservas (RH). Fuera del MVP. |
| `tiposGenerales.xsd` | Tipos comunes: `contratoHospedajeType`, `personaHospedajeType`, `direccionType`, `pagoType`, ISO3166-3, etc. |
| `anularComunicacion.xsd`, `consultarComunicacion.xsd` | XML internos de anulación y consulta de lotes. |

Reglas de negocio que el XSD no expresa (las valida el servicio; ver `docs/research/2026-08-20-ses-especificacion.md` §4): rol siempre `VI` en PV; tantas `persona` como `numPersonas`; documento obligatorio en mayores de edad; `soporteDocumento` obligatorio con NIF/NIE; `apellido2` obligatorio con NIF; al menos un contacto (`telefono`/`telefono2`/`correo`); `parentesco` en menores; `codigoMunicipio` INE si `pais=ESP`; máx. 100 comunicaciones por petición.

No modificar estos ficheros: son la referencia. El validador propio (`lib/`) se construye encima.
