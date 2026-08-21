# Investigación · Marco legal del registro de viajeros (estado a 2026-08-20)

Informe generado por agente de investigación (≈30 búsquedas, ≈25 fuentes leídas: BOE, AEPD, BOPV, CGPJ, portal Mossos, Turismo de Navarra, especificación SES). **[VP]** verificado en fuente primaria · **[S]** secundario · **[NE]** no encontrado.

## 1. Estado del RD 933/2021

**Vigente sin modificación.** Texto consolidado BOE: última actualización 27/10/2021, vigencia 27/04/2022, efectos de comunicación desde 02/01/2023 (DF 3ª). Ninguna norma posterior lo modifica; ninguna orden ministerial de desarrollo publicada. [VP] https://www.boe.es/buscar/act.php?id=BOE-A-2021-17461

- Exigibilidad efectiva vía SES.Hospedajes desde **02/12/2024** [S].
- **Orden ministerial de desarrollo**: borrador en consulta pública 31/12/2024; nunca aprobada. El 26/06/2026 Interior comunicó a CEAV/FETAVE/UNAV que **queda paralizada hasta que concluya el procedimiento de infracción europeo**, sin derogar el RD [S] https://www.hosteltur.com/177175_registro-de-viajeros-interior-da-una-de-cal-y-otra-de-arena-a-las-agencias.html
- Transitoriamente siguen vigentes la Orden INT/1922/2003 y la Orden de 16/09/1974 en lo que no contravengan al RD (DD única.2) [VP].
- **Sentencias del TS sobre el RD 933/2021: ninguna** [NE]. CEHAT denunció ante la Comisión Europea (no judicial). Iustitia Europa recurrió ante la Audiencia Nacional el 04/12/2024; resultado [NE]. Ojo: la **STS 620/2026 (19/05/2026)** anula el Registro Único de Arrendamientos (RD 1312/2024), **no** el RD 933/2021.
- **Datos de pago**: nadie los ha anulado; Interior aclaró (dic. 2024) que número de tarjeta/IBAN no se exigen [S]; en SES solo `tipoPago` es obligatorio.
- **Procedimiento de infracción UE**: la Comisión abrió el **04/06/2026** el expediente **INFR(2026)4005** (carta de emplazamiento, 2 meses de respuesta) por amplitud de datos y plazo de conservación, a la luz de la Directiva 2016/680 y la jurisprudencia del TJUE [S] https://theobjective.com/economia/2026-06-05/bruselas-procedimiento-infraccion-espana-registro-viajeros/ · https://www.xataka.com/legislacion-y-derechos/espana-monto-registro-viajeros-para-vigilar-a-hoteles-turistas-bruselas-acaba-decirle-que-se-ha-pasado-raya . CEAV estima que puede prolongarse hasta 1T 2027. **El RD sigue plenamente exigible mientras tanto.**

## 2. Anexo I vigente (transcrito del BOE) [VP]

**A.3 Datos de los viajeros**: nombre; primer apellido; segundo apellido; sexo; número de documento; **número de soporte**; tipo de documento (DNI, pasaporte, TIE); nacionalidad; fecha de nacimiento; residencia habitual (dirección completa, localidad, país); teléfono fijo; móvil; correo; número de viajeros; **parentesco (si hay menor de edad)**.

**A.4 Datos de la transacción**: contrato (referencia, fecha, **firmas**); ejecución (fecha y hora de entrada y salida); inmueble (dirección, nº habitaciones, Internet sí/no); **pago** (tipo; identificación del medio; titular; caducidad de tarjeta; fecha de pago).

**B (no profesional)**: B.3 = A.3 sin número de soporte; B.4 = A.4 sin datos del inmueble.

**Menores de 14** (art. 4.2 y 5.1): sus datos los aporta el adulto; no firman; se comunican igualmente sin documento obligatorio.

**Qué es realmente obligatorio en SES.Hospedajes** (según la especificación v3.1.3 y XSD):

| Bloque | Obligatorio | Opcional |
|---|---|---|
| contrato | referencia, fechaContrato, fechaEntrada, fechaSalida, numPersonas, bloque pago | numHabitaciones, internet |
| pago | **tipoPago** | fechaPago, medioPago (texto 50), titular, caducidadTarjeta — **no existe campo de nº de tarjeta ni IBAN** |
| persona | rol=VI, nombre, apellido1, fechaNacimiento, direccion, al menos un contacto, apellido2 si NIF, tipo+nº documento en mayores, parentesco si hay menor | soporteDocumento (XSD), nacionalidad y sexo (XSD; la sede los pide), telefono2 |
| firma | — | **No existe elemento "firma" en el esquema** |

## 3. Sujetos obligados [VP]

Art. 2.1: hoteles, hostales, pensiones, casas de huéspedes, turismo rural; campings, áreas de autocaravanas, apartamentos, bungalows; **operadores turísticos que intermedien**; **plataformas digitales**. Art. 2.3: quien "desarrolle o intermedie". VUT caen en a)/b); titular no profesional → apartado B.

Obligaciones: comunicación previa (art. 6.1-6.2, datos del establecimiento, 10 días); comunicación de actividad (art. 6.3) en **24 h** en dos momentos: reserva/contrato/anulación (→ RH) e inicio del servicio (→ PV); registro documental (art. 5), **exentos los no profesionales** (art. 5.4). En la práctica la OTA comunica la reserva y el alojamiento siempre el parte [S].

## 4. Plazos y conservación [VP]

- 24 h comunicación; 10 días comunicación previa; telemático (art. 6.4).
- **Conservación 3 años desde la finalización del servicio** (art. 5.3). Registro informático (art. 5.1); el establecimiento responde de la exactitud (art. 4.3).

## 5. Régimen sancionador

- Art. 8 RD → capítulo V **LO 4/2015**. **Graves (art. 36.20)**: carencia de registros; omisión de comunicaciones. **Leves (art. 37.9)**: deficiencias en los registros; comunicaciones fuera de plazo. [VP]
- **Cuantías (art. 39.1)**: leves 100-600 €; graves 601-30.000 € (mínimo 601-10.400). [VP] https://www.boe.es/buscar/act.php?id=BOE-A-2015-3442
- **Sanciones efectivas**: mayo 2025, Tourism&Law/El País: "primeros expedientes" de Interior, sin identificar [S]. Ninguna resolución concreta localizada [NE]. Sí hay **sanción AEPD por RGPD: hotel de 4* en Girona, 5.400 €** (9.000 € con reducciones) por escanear el DNI en el check-in, "tratamiento que excede de lo exigido en el RD 933/2021" [S] https://www.hosteltur.com/171064_multa-de-5400-a-un-hotel-por-escanear-el-dni-de-un-huesped.html (30/07/2025); precedentes PS-00036-2024 y PS-00331-2023 [S] https://dpd.aec.es/reconocimiento-ocr-dni-huespedes/

## 6. Protección de datos

- **Informe AEPD 175906/2018** [VP] https://www.aepd.es/documento/2018-0103.pdf : base jurídica art. 6.1.c RGPD + art. 25 LO 4/2015 + art. 45 Convenio Schengen; 3 años respetuoso con la limitación de conservación.
- **Nota AEPD 17/06/2025** [VP] https://www.aepd.es/guias/nota-aepd-registro-hospedajes.pdf : (1) **no pedir copia del DNI/pasaporte** (fotocopia, escaneo ni foto): minimización; el DNI contiene más datos de los necesarios y "por sí solo no es un recurso válido" porque no contiene todos los del Anexo I; (2) basta **formulario presencial u online** limitado a A.3/A.4; (3) autenticación presencial: **comprobación visual**; online: **certificado digital, coincidencia con los datos del medio de pago, o OTP a teléfono/email**; (4) "no descarta otros procedimientos válidos" que el responsable debe evaluar.
- **OCR sin conservar imagen**: no validado expresamente por la AEPD; defendible solo con extracción mínima, borrado inmediato, información al huésped y alternativa [S] dpd.aec.es. La sanción de Girona se impuso por escanear.
- **Roles**: el alojamiento es **responsable**; el software de check-in es **encargado** (contrato art. 28 RGPD).
- **IA con el DNI**: decálogo AEPD "Cuidado con lo que le confIAs" (27/01/2026): no introducir en IA DNI/NIE ni imágenes de personas [VP] https://www.aepd.es/prensa-y-comunicacion/notas-de-prensa/aepd-publica-decalogo-recomendaciones-proteger-privacidad-al-usar-ia . Enviar la imagen del DNI a una IA sin DPA fuera de la UE combina tratamiento excesivo + encargo sin art. 28 + transferencia internacional.

## 7. Comunidades con sistema propio

- **Cataluña — Mossos** [VP] https://registreviatgers.mossos.gencat.cat/mossos_hotels/AppJava/ : todos los alojamientos de Cataluña comunican a la Direcció General de la Policia, no a SES. Formatos: fichas web o **fichero masivo ".txt"** (manual de usuario); datos del Anexo I; menores < 14 sin DNI; 24 h; 3 años; alta con formulario PI-15 y NIRTC. En la práctica solo envían a Mossos [S].
- **País Vasco — Ertzaintza** [VP] Orden 25/11/2022 (BOPV 12/12/2022): sede electrónica del Gobierno Vasco; mismo Anexo; 24 h; 3 años. Trámite 1089501, alojados.ertzaintza@ertzaintza.eus. Especificación técnica del fichero [NE].
- **Navarra**: **sin sistema propio**; Turismo de Navarra remite a SES.Hospedajes [VP] https://turismoprofesional.navarra.es/es/nuevas-obligaciones-en-el-registro-de-viajeros

## 8. Normativa adyacente

- **RD 1312/2024** (NRUA obligatorio desde 01/07/2025) [VP].
- **STS 620/2026 (19/05/2026)** [VP] https://www.poderjudicial.es/cgpj/es/Poder-Judicial/Tribunal-Supremo/Oficina-de-Comunicacion/Notas-de-prensa/El-Tribunal-Supremo-anula-el-Registro-Unico-de-arrendamientos-de-corta-duracion-por-considerar-que-el-Estado-carece-de-competencia-para-su-creacion : anula el Registro Único y la obligación de NRUA (falta de competencia estatal); mantiene la Ventanilla Única Digital y las obligaciones de las plataformas.
- **Reglamento (UE) 2024/1028** (aplicable desde 20/05/2026) [VP]: número de registro (donde el Estado lo exija) mostrado en el anuncio; plataformas reportan mensualmente a la ventanilla única.
- Para el pequeño gestor en 2026: ya no NRUA; sigue el registro/licencia **autonómico** y mostrarlo en los anuncios; sin norma estatal sustitutiva a 20/08/2026 [NE]. **Producto: el campo "número de registro" es el autonómico.**

## 9. Firma del huésped

- **El RD exige firma** (art. 4.2: mayores de 14, "conforme al sistema y modelo que se establezca"); Anexo I A.4.a "Firmas" [VP]. Schengen art. 45: extranjeros firman personalmente.
- **La firma no se transmite a SES** (no hay campo en el XSD); se conserva en el registro documental del alojamiento 3 años. Igual en Mossos (FAQ 18).
- **Firma electrónica**: sin pronunciamiento específico [NE]. Marco eIDAS art. 25 (firma simple con efectos jurídicos) + Ley 6/2020. Práctica del sector: firma manuscrita en pantalla o firma electrónica con trazabilidad (OTP, IP, sello de tiempo). La AEPD sugiere OTP/certificados como autenticación online. **Recomendación: firma electrónica simple con evidencias (OTP + hash + timestamp) vinculada al parte, conservada 3 años; nunca sustituir la firma por una foto del DNI.**

## Resumen ejecutivo para producto

El RD 933/2021 está íntegramente vigente y sin modificar; ninguna sentencia lo anula; lo nuevo en 2026 es el expediente de infracción UE (04/06/2026) y la paralización de la orden de desarrollo, sin moratoria de sanciones. Recoger A.3/A.4; en SES solo el tipo de pago es técnicamente obligatorio (nunca nº de tarjeta/IBAN). **Nada de copias del DNI** (AEPD 17/06/2025, multas ya impuestas). Cataluña → Mossos, Euskadi → Ertzaintza, Navarra y resto → SES. NRUA anulado; el número a mostrar es el autonómico. Firma: exigida, no viaja a SES, se guarda; firma electrónica simple con evidencias.

Lagunas [NE]: recurso de Iustitia Europa en la AN; resoluciones sancionadoras concretas por el RD; especificación del fichero de la Ertzaintza; FAQ oficial de Interior (descargar a mano: https://sede.mir.gob.es/opencms/export/sites/default/.galleries/hospedajes-y-alquiler-de-vehiculos/Preguntas-frecuentes-hospedajes-alquiler-vehiculos-20250409.pdf).
