# OCR de documentos de identidad bajo RGPD

Informe de opciones para extraer campos de DNI 3.0/4.0, NIE/TIE, pasaportes, carnés de conducir y documentos de identidad de la UE desde una foto de móvil, con salida JSON, para un SaaS español (caso: partes de viajeros SES.Hospedajes). Fecha de consulta de todas las fuentes: **2026-08-20**. Tipo de cambio usado: 1 EUR = 1,1684 USD (1 USD = 0,856 EUR), TradingEconomics 20-08-2026 [SECUNDARIO].

Leyenda: **[V]** = VERIFICADO en página oficial · **[S]** = SECUNDARIO (blog, agregador, snippet de buscador) · **[NE]** = NO ENCONTRADO.

---

## 0. Resumen ejecutivo

1. **OpenRouter self-serve no pasa un análisis RGPD de alto riesgo**: el DPA firmado solo existe para cuentas Enterprise, la política de privacidad declara transferencias a EE. UU. y el enrutado "solo UE" (`eu.openrouter.ai`) es también Enterprise. El flag `provider.zdr: true` sí funciona técnicamente, pero sin contrato Art. 28 con el intermediario no sirve de nada frente a la AEPD.
2. **La AEPD (nota de 17-06-2025) prohíbe a los hospedajes pedir copia del DNI/pasaporte**: minimización (art. 5.1.c). Consecuencia de diseño: la foto no debe almacenarse nunca, debe procesarse en memoria y el producto debe ofrecerse como "lectura asistida para rellenar el parte", no como archivo de documentos. Esto empuja fuertemente hacia **lectura de MRZ en el propio navegador** (la imagen no sale del móvil) y a un proveedor de IA con DPA solo como fallback.
3. **Ganadores por coste y cumplimiento**: (a) MRZ on-device con validación de dígitos de control (coste 0, datos no salen); (b) fallback **Mistral OCR 4.1 + Document Annotation** (empresa francesa, alojamiento UE por defecto, DPA, ZDR bajo petición en planes de pago, 4-5 $/1.000 páginas) o **Gemini 2.5 Flash en Vertex AI endpoint `eu`** (~0,002 $/documento) o **Claude Haiku 4.5 vía Bedrock perfil `eu.`** (~0,005 $/documento). Todos muy por debajo de 0,05 €/documento.
4. **Los verificadores KYC (Veriff 0,80 $, Onfido/IDnow bajo presupuesto) y Mindee (0,044 $/página)** resuelven otro problema (verificación antifraude) y se salen del objetivo de coste. Azure prebuilt-idDocument (10 $/1.000 páginas, región West Europe) es la opción "especializada" más barata y razonable, pero 5-10× más cara que un LLM.

---

## 1. Tabla comparativa

Coste "por documento" asumiendo **anverso + reverso = 2 páginas/imágenes** de ~1000×700 px salvo indicación. Las estimaciones de tokens siguen las fórmulas oficiales de cada proveedor (ver §3).

| Proveedor / opción | Precio unitario (orig.) | ≈ €/documento (2 caras) | DPA firmable | Residencia UE / ZDR | Calidad en ID/MRZ | Latencia típica | Notas y evidencia |
|---|---|---|---|---|---|---|---|
| **OpenRouter (self-serve)** | Sin margen sobre el proveedor [V] | según modelo | **No** (solo Enterprise, vía trust.openrouter.ai) [V/S] | Transfiere a EE. UU.; `zdr:true` y `data_collection:"deny"` por petición [V]; enrutado UE solo Enterprise [V] | la del modelo elegido | la del modelo | Imágenes no persistidas "más allá de lo necesario para enrutar" [V]. No apto para DNI en self-serve. |
| **OpenRouter (Enterprise)** | negociado | según modelo | Sí, DPA mutuo [S: Zendesk oficial] | `eu.openrouter.ai`, procesado íntegro en UE [V] | — | — | Añade un subencargado extra sin aportar nada que no dé el proveedor directo. |
| **Anthropic Claude Haiku 4.5 (API 1ª parte)** | 1 $/M in · 5 $/M out [V] | ~0,0035 € | Sí, DPA incorporado a los Commercial Terms (SCC, ley irlandesa) [V] | `inference_geo` solo admite `"global"` y `"us"`: **no hay opción UE en la API directa** [V] | Buena en OCR general; no hay benchmark MRZ oficial [NE] | 2-5 s (estimación) | Imágenes efímeras, no se usan para entrenar [V]. |
| **Claude Haiku 4.5 vía AWS Bedrock (perfil `eu.anthropic…`)** | precio Bedrock ≈ API +10 % regional [V] | ~0,004 € | DPA de AWS (el encargado es AWS, no Anthropic) [S] | Procesado dentro de regiones UE (Frankfurt, Irlanda, París, Estocolmo, Madrid, Milán, Zúrich) [V] | idem | 2-5 s | Haiku 4.5 disponible en las 8 regiones UE [S: AWS What's New]. Opus 5 / Sonnet 5 in-region en eu-west-1 y eu-north-1 [V]. |
| **Claude Sonnet 5 vía Vertex AI endpoint `eu`** | 2 $/M in · 10 $/M out (+10 % multi-región) [V] | ~0,009 € | DPA de Google Cloud | Multi-región `eu` (`aiplatform.eu.rep.googleapis.com`) [V] | Mejor que Haiku en texto pequeño/rotado | 3-8 s | Límite 5 MB/imagen en Vertex/Bedrock [V]. |
| **OpenAI gpt-5-mini (EU data residency)** | 0,25 $/M in · 2 $/M out [V]; +10 % solo en modelos posteriores a 5-mar-2026 [V] | ~0,0015 € | Sí (DPA vía ventas) [S] | `eu.api.openai.com`: almacenamiento y **procesado** en UE con ZDR; requiere aprobación de "abuse monitoring controls" y **para imágenes aprobación adicional de enhanced ZDR/MAM** [V] | Buena; sin benchmark MRZ [NE] | 2-6 s | Snapshots UE: gpt-5-mini-2025-08-07, gpt-5-nano, gpt-5.4-mini/nano, gpt-4.1-mini/nano, gpt-5.5… [V] |
| **Google Gemini 2.5 Flash (Vertex AI `eu` / europe-west1/4)** | 0,30 $/M in · 2,50 $/M out [V: ai.google.dev]; Vertex mismo tarifario [S] | ~0,002 € | DPA de Google Cloud (Cloud Data Processing Addendum) | Endpoints jurisdiccionales: "ML processing stays within … the EU" [V: docs data-residency]; 2.5 Flash no está en todas las regiones UE (404 en europe-west2 reportado) [S] | Buena en OCR multilingüe; sin benchmark MRZ [NE] | 2-5 s | Flash-Lite 0,10/0,40 $ → ~0,0006 €/doc. Precios suben ≈2× el 1-1-2027 [V]. |
| **Mistral OCR 4.1 + Document Annotation (La Plateforme)** | OCR 4 $/1.000 pág.; Document AI (anotación) 5 $/1.000 pág.; batch −50 % [V] | **0,0086 €** (2 pág. anotadas) · 0,0043 € en batch | Sí, DPA en legal.mistral.ai [V] | **Alojado en UE por defecto** (endpoint US solo si se pide) [V]; retención 30 días para abuso salvo **ZDR** (planes de pago, bajo petición justificada, incluye `/v1/ocr`) [V] | OCR 4: 72 % win-rate humano, OlmOCRBench 85,2 [V]; **nada específico de ID/MRZ** [NE] | sin cifra oficial [NE]; 2-5 s/pág. reportado [S] | OCR 4 lanzado 23-06-2026, 4.1 el 16-07-2026 (`mistral-ocr-4-1`), auto-hospedable en contenedor [V]. Anotación = OCR + LLM con JSON schema (`document_annotation_format`) [V]. |
| **Mistral Small 4 (visión)** | 0,15 $/M in · 0,60 $/M out [V] | ~0,0005 € | idem | idem (ZDR aplica a chat/completions) [V] | Inferior a OCR 4 en documentos [S] | 2-4 s | Alternativa barata con JSON schema si no se quiere pipeline OCR+anotación. |
| **Azure AI Document Intelligence `prebuilt-idDocument` v4.0** | **10 $/1.000 páginas** [S: MS Q&A oficial + docuocr 25-07-2026]; 500 pág./mes gratis [V] | **0,017 €** | Sí (Microsoft Products and Services DPA) | Recurso desplegable en West Europe; precio "varía ligeramente por región" [S] | Soporta pasaportes mundiales + "Other: Driver License, Identification Card, Residency Permit" de todas las regiones [V]; devuelve campo `MachineReadableZone` [V] | 3-10 s (async) | La página de precios oficial no renderiza cifras (muestra "$ -") [V]. La opción especializada más equilibrada. |
| **Google Document AI – Identity Document Proofing** | 0,10 $/documento [S] | 0,086 € | Sí | Disponible en multi-región `eu` (salvo detección de duplicados, solo EE. UU.) [V] | **Solo documentos de EE. UU.** (pasaporte, passcard, DL) [V] | — | Descartado: no cubre DNI/UE. Parsers FR ID/DL solo preview [S]. |
| **AWS Textract AnalyzeID (EU Spain / Ireland)** | **0,025 $/pág.** primeras 100k, luego 0,01 $ [V: JSON de precios AWS, región EU (Spain); Ireland no aparecía en el volcado] | 0,043 € | Sí (AWS DPA) | Regiones UE | Históricamente orientado a DL y pasaportes de EE. UU. (verificar cobertura DNI antes de usar) [S/memoria] | 1-3 s sync | 100 pág./mes gratis 3 meses [V]. |
| **Mindee (FR)** | ~0,044 $/crédito (página); Starter 44 $/mes (6.000 créditos/mes) [V] | **0,075 €** | Sí, DPA con SCC [S: docs oficiales en snippet] | Zona de procesado "Europe" exclusiva UE; retención 1-24 h (por defecto 12 h), opción "delete when fetched"; "el archivo original nunca se escribe a disco" [V] | Productos específicos Passport / International ID [V] | 1-3 s | Supera el objetivo de 0,05 € con 2 caras; bien por privacidad. |
| **Microblink BlinkID (in-browser / móvil SDK)** | Plan gratuito 100 escaneos/mes; resto bajo presupuesto [S] | [NE] | Bajo contrato | **Procesado 100 % en el dispositivo (WASM)**; la licencia hace ping online pero las imágenes no salen [V: README] | Excelente: cobertura mundial, DNI España, permiso de residencia España, DL España [S: blog oficial] | < 1 s por frame | El repo `blinkid-in-browser` está archivado → usar `blinkid-web` [V]. Mejor calidad on-device si el presupuesto lo permite. |
| **Dynamsoft MRZ Scanner JS** | Solo presupuesto; Barcode Reader (producto hermano) desde 1.499 $/año [S] | [NE] | Bajo contrato | On-device (WASM) | Muy buena en MRZ | < 1 s | Trial 30 + 15 + 15 días [S]. |
| **Regula Document Reader SDK** | [NE] (licencias por transacción/dispositivo/año, sin cifras públicas) [S] | [NE] | Bajo contrato | On-premise / on-device disponible [S] | Referencia del sector (forense) | — | Fuera de escala para un micro-SaaS. |
| **Veriff** | Essential **0,80 $/verificación**, mínimo 49 $/mes [V] | 0,68 € | Sí | UE (empresa estonia) | Muy buena + biometría | 10-60 s | Es KYC completo, no OCR. |
| **Onfido / IDnow / Klippa** | Sin tarifa pública, contratos anuales [S] | [NE] | Sí | UE | Muy buena | — | Sobredimensionado. |
| **MRZ en navegador (`web-mrz-reader`, `tesseract.js` + OCRB, `mrz` npm)** | 0 € (código abierto) | **0 €** | n/a (no hay encargado: el dato no sale del móvil) | Procesado local | Con modelo OCR-B dedicado: 95-100 % en MRZ limpias [S]; PassportEye/Tesseract genérico: pobre [S] | 2-6 s en móvil | Cubre DNI (TD1), TIE (TD1), pasaporte (TD3), la mayoría de IDs UE. **No cubre carné de conducir** (sin MRZ). |
| **VLM local (Qwen2.5-VL-7B / Qwen3-VL, PaddleOCR-VL 0.9B)** | GPU serverless Modal L4 0,000222 $/s (~0,80 $/h) [V] | ~0,001-0,003 € si 3-10 s/doc | n/a (propio) o DPA del host GPU | Depende del host (Modal: regiones configurables; PC doméstico: en casa) | Qwen2.5-VL-7B "fuerte en texto y tablas"; 35 s/pág. en Mac mini M4 Pro [S]; PaddleOCR-VL 1.5 94,5 en OmniDocBench [S]; PaddleOCR clásico peor que Tesseract en MRZ [S] | 1-5 s en GPU datacenter; 30 s+ en CPU/Apple Silicon | Vercel Functions no tienen GPU; el PC de casa queda prohibido para tráfico de cliente por la política del portafolio. |

---

## 2. Análisis por bloque

### A. OpenRouter como agregador

Hechos verificados en páginas oficiales:

- **Routing y privacidad por petición** (`openrouter.ai/docs/features/provider-routing`, `…/features/zdr`) [V]:
  ```json
  {
    "model": "google/gemini-2.5-flash",
    "provider": {
      "zdr": true,
      "data_collection": "deny",
      "order": ["google-vertex"],
      "allow_fallbacks": false,
      "ignore": ["deepinfra"]
    }
  }
  ```
  `data_collection:"deny"` excluye proveedores que almacenan datos de forma no transitoria o entrenan; `zdr:true` restringe a endpoints con política de retención cero (lista viva en `GET /api/v1/endpoints/zdr`). Los ajustes por petición funcionan como OR con los de cuenta (`/settings/privacy`): solo pueden endurecer. Cuando la política de un proveedor no está clara, OpenRouter asume que retiene y entrena.
- **Lista ZDR real** (`/api/v1/endpoints/zdr`, consultada hoy) [V]: incluye Claude vía Bedrock con etiqueta de región (p. ej. `amazon-bedrock/eu-west-1`), Gemini vía `google-vertex/global`, y Mistral solo en texto (Ministral 8B, Small 4). **No aparece Mistral OCR ni ningún endpoint Vertex `eu`**: no se puede forzar Gemini en región UE desde OpenRouter self-serve.
- **DPA** [S: artículo oficial de Zendesk 47828437697051, y `openrouter.ai/terms-of-service-enterprise`]: "Enterprise customers receive a mutually signed DPA through their Trust Portal… Self-serve customers can request access to the Trust Portal to review the DPA for informational purposes, but the agreement only applies to enterprise accounts."
- **Residencia UE** [V: provider-routing + `/enterprise`]: "OpenRouter supports in-region routing in the EU and US for enterprise customers… processed entirely within the selected region" (`eu.openrouter.ai`). Requiere activación Enterprise.
- **Privacidad** (`openrouter.ai/privacy`) [V]: los datos "may be transferred to our servers in the US", amparados en SCC; no usan inputs/outputs para entrenar; imágenes/audio/vídeo "no se persisten más allá de lo necesario para enrutar la petición, salvo detección de abuso, seguridad, facturación o cumplimiento legal".

**Conclusión honesta**: enviar fotos de DNI por OpenRouter self-serve **no pasa** un análisis RGPD de alto riesgo. Faltan el contrato del art. 28 (DPA) con el intermediario, una garantía de residencia UE y el control del subencargado final. Con plan Enterprise (DPA + `eu.openrouter.ai` + `zdr:true`) sí podría pasar, pero el beneficio de OpenRouter (cambiar de modelo sin tocar código) no compensa añadir un subencargado estadounidense a un tratamiento de documentos de identidad. **Recomendación: usar OpenRouter solo para las partes del producto que no ven datos personales (p. ej. redactar respuestas de soporte) y hablar directamente con el proveedor UE para el OCR.**

### B. LLM multimodales con DPA

- **Anthropic**. DPA incorporado automáticamente a los Commercial Terms (SCC módulos 2 y 3, ley irlandesa, efectivo 24-02-2025) [V]. Precios API [V]: Haiku 4.5 1/5 $; Sonnet 5 2/10 $ (precio introductorio convertido en definitivo); Opus 5 5/25 $; batch −50 %. **La API directa no ofrece inferencia solo-UE** (`inference_geo` ∈ {`global`,`us`}; workspace geo solo `us`) [V]. Para UE: **Bedrock** (perfil geo `eu.anthropic.<modelo>` que reparte entre las 8 regiones UE; Opus 5/Sonnet 5/Opus 4.8 también "in-region" en eu-west-1 y eu-north-1) [V: tabla de compatibilidad Bedrock] o **Vertex AI** (`region="eu"` → `aiplatform.eu.rep.googleapis.com`, o regional `europe-west1`) [V]. Ambos con **+10 % sobre el endpoint global** desde la familia 4.5 [V]. Coste de imagen: `⌈w/28⌉×⌈h/28⌉` tokens; 1000×1000 px = 1.296 tokens → ~1,30 $/1.000 imágenes en Haiku 4.5 [V]. El encargado pasa a ser AWS/Google, no Anthropic.
- **OpenAI**. `eu.api.openai.com` con almacenamiento y procesado en UE y ZDR; requiere aprobación de abuse-monitoring controls y "Modified Retention amendment"; **para imágenes en UE hace falta aprobación adicional de enhanced ZDR / enhanced Modified Abuse Monitoring** [V]. Modelos con procesado UE en chat/responses: gpt-5.6-*, gpt-5.5, gpt-5.4, gpt-5.4-mini/nano, gpt-5.2, gpt-5.1, gpt-5, gpt-5-mini, gpt-5-nano, gpt-4.1, gpt-4.1-mini/nano [V]. Recargo del 10 % solo en modelos lanzados a partir del 5-03-2026 [V]. Precios [V]: gpt-5-mini 0,25/2 $; gpt-5-nano 0,05/0,40 $; gpt-4.1-mini 0,40/1,60 $; gpt-4.1-nano 0,10/0,40 $; batch −50 %. Imágenes: parches de 32 px, tope 1.536 parches, multiplicador ×1,62 (mini) / ×2,46 (nano) [S: docs images-vision].
- **Google Gemini en Vertex AI**. Precios (ai.google.dev, mismos que Vertex) [V]: 2.5 Flash 0,30/2,50 $; 2.5 Flash-Lite 0,10/0,40 $; 2.5 Pro 1,25/10 $; 3.5/3.6/3.7 Flash 0,75/3,75 $; 3.5 Flash-Lite 0,30/2,50 $; batch −50 %; **subida ≈2× el 1-1-2027**. Tokens de imagen: 258 por tile de 768×768; una foto 1000×700 ≈ 6 tiles ≈ 1.548 tokens [V]. Residencia: con endpoints jurisdiccionales "ML processing stays within that specific geographical region (such as … the European Union)" [V]; el `eu` multi-región cubre solo estados miembros [V]. Disponibilidad por región desigual (2.5 Flash no en europe-west2) [S].
- **Mistral**. Empresa francesa; "your data is hosted in the European Union" salvo que uses el endpoint US [V]; transferencias temporales fuera de la UE solo para ciertas funciones listadas en el Trust Center [V]; retención 30 días rolling para abuso salvo **ZDR**, disponible en planes de pago para endpoints stateless incluido `/v1/ocr`, bajo petición revisada [V]. DPA público en `legal.mistral.ai/terms/data-processing-addendum` [V] (permite usar *feedback* para entrenar salvo opt-out: desactivar). **Mistral OCR**: versión actual **OCR 4.1** (`mistral-ocr-4-1`, 16-07-2026), tras OCR 4 (23-06-2026) y OCR 3 (dic-2025, que se lanzó a 2 $/1.000) [V/S]. Precio hoy: **4 $/1.000 páginas OCR, 5 $/1.000 páginas anotadas (Document AI), batch a mitad** [V]. Salida estructurada: `document_annotation_format` / `bbox_annotation_format` con JSON schema (Pydantic/Zod) + `document_annotation_prompt`; internamente OCR → markdown → LLM de visión con el schema [V]. Self-hosting en contenedor para soberanía [V]. Calidad en ID/MRZ: **no documentada** [NE].

### C. OCR especializado en identidad

- **Azure Document Intelligence prebuilt-idDocument v4.0 (2024-11-30 GA)**: cobertura "all regions worldwide", tabla: pasaportes mundiales; EE. UU., India, Australia con tipos propios; "Other: Driver License, Identification Card, Residency Permit" [V]. Devuelve JSON con `MachineReadableZone`, nombres, fechas, número, nacionalidad, sexo [V]. Precio: 10 $/1.000 páginas en prebuilt (MS Q&A, docuocr 25-07-2026) [S]; la página de precios oficial no renderiza cifras [V]; 500 páginas/mes gratis (solo 2 primeras páginas por petición) [V]. Región West Europe seleccionable al crear el recurso.
- **Google Document AI**: el único procesador de identidad vigente es **Identity Document Proofing**, **solo documentos de EE. UU.**, disponible en `eu` y `us` [V]; 0,10 $/documento [S]. Descartado.
- **AWS Textract AnalyzeID**: 0,025 $/página (primeras 100.000) y 0,01 $ después, verificado en el JSON de precios para **EU (Spain)**; la región Ireland no apareció en el volcado truncado [V parcial]; la web pública solo muestra Oregón con las mismas cifras [V]. Cobertura de DNI no verificada en esta sesión [NE].
- **Mindee** (FR): 44 $/mes por 6.000 créditos (~0,044 $/página) [V]; zona "Europe" exclusiva UE, retención 1-24 h, "delete when fetched", archivo original nunca a disco [V]; DPA con SCC [S].
- **Microblink BlinkID**: procesado 100 % en navegador/móvil (WASM), "without any need for sending images to servers" [V]; licencia online (≥5.8.0) pero extracción offline [V]; soporta Spain ID, Spain DL, permisos de residencia España [S: blogs oficiales]; 100 escaneos/mes gratis [S]; precios de pago [NE].
- **Regula / Veriff / Onfido / IDnow / Klippa**: solo Veriff publica tarifa (0,80 $/verificación + 49 $/mes mínimo; Plus 1,39 $; Premium 1,89 $) [V]. Los demás: presupuesto [S].

### D. Local / on-device / sin salida de datos

**Estructura de la MRZ relevante** (ICAO 9303):
- **DNI 3.0 y 4.0**: MRZ **TD1 en el reverso, 3 líneas × 30 caracteres** [S: Veridas, Mobbeel, RegistroViajero]. Línea 1: `I` + `D` (tipo) + `ESP` + **número de soporte** (9 posiciones; BAA000589 en 3.0/4.0, IDESP-style en el antiguo) + dígito de control + **número de DNI con letra** + relleno `<`. Línea 2: fecha de nacimiento (AAMMDD) + control + sexo + caducidad (AAMMDD) + control + nacionalidad (ESP) + relleno + **dígito de control compuesto**. Línea 3: apellidos `<<` nombre. Cuatro dígitos de control (mod 10 ponderado 7-3-1) [S]. Importante: "IDESP" no es la etiqueta del soporte sino `ID`+`ESP` seguidos [S: RegistroViajero]. **SES.Hospedajes exige `soporteDocumento` (≤ 9 caracteres) cuando el tipo es NIF o NIE** [S]: la MRZ lo contiene.
- **TIE / permiso de residencia**: tarjeta formato UE con MRZ TD1 de 3 líneas (soporte `E` + 8 dígitos) [S]. El código exacto de la línea 1 (`IRESP` vs `I<ESP`) no lo he podido verificar en fuente oficial [NE]: parsear con una librería ICAO genérica y no asumirlo.
- **Pasaporte**: TD3, 2 líneas × 44; **IDs UE**: TD1 casi todas; **carné de conducir UE: sin MRZ** → requiere OCR/LLM.

**Librerías**:
- `mrz` (npm): parsea TD1/TD2/TD3 y valida dígitos de control [V: npm].
- `web-mrz-reader`: Tesseract.js con modelo entrenado en OCR-B (37 clases), 100 % cliente, detección de formato por longitud (90/72/88) [S: GitHub].
- `tesseract.js` + `OCRB.traineddata`: 95-96 % de acierto en MRZ con modelo dedicado; el modelo `eng` genérico falla [S: lista tesseract-ocr]. PassportEye/Tesseract genérico: tasa de detección pobre [S: arXiv 2009.05489].
- `@microblink/blinkid-in-browser` (archivado) → `blinkid-web`: la mejor calidad on-device, de pago [V].
- Dynamsoft MRZ Scanner JS: on-device, licencia anual a presupuesto [S].

**Validación determinista**: los 3-4 dígitos de control de la MRZ hacen que un falso positivo de OCR que pase todos los checks sea improbable (~1/10.000 por dígito erróneo independiente); el patrón correcto es **capturar vídeo, intentar OCR por frame, aceptar el primer frame cuya MRZ valide todos los checksums**. Con un LLM, en cambio, no hay checksum: por eso conviene que el LLM devuelva también la MRZ transcrita y que el código la valide (regla de oro del portafolio: la IA genera datos, el código decide).

**VLM en servidor propio**: Qwen2.5-VL-7B recomendado como mejor equilibrio en un benchmark local de mayo-2026 (35 s/página en Mac mini M4 Pro; Qwen3-VL-30B 73 s) [S]; PaddleOCR-VL 1.5 (0,9B) lidera OmniDocBench [S] pero PaddleOCR clásico va peor que Tesseract en MRZ [S: discusión oficial]. En GPU serverless (Modal L4 0,80 $/h, T4 0,59 $/h, A10 1,10 $/h, 30 $/mes gratis) [V] un documento de 3-10 s cuesta 0,001-0,003 € más arranques en frío. Viable, pero añade operación (cold starts, VRAM, versionado) y el PC doméstico está vetado para tráfico de clientes por la política del portafolio.

---

## 3. Supuestos de coste por documento

Foto de móvil recortada a ~1000×700 px por cara; prompt ~300 tokens; salida JSON ~200 tokens; 2 caras/documento.

| Opción | Tokens/caso | Cálculo | $/doc | €/doc |
|---|---|---|---|---|
| Gemini 2.5 Flash-Lite (Vertex eu) | 2×1.548 img + 300 in; 200 out | 3.400×0,10 + 200×0,40 / 1M | 0,00042 | 0,0004 |
| Gemini 2.5 Flash (Vertex eu) | idem | 3.400×0,30 + 200×2,50 / 1M | 0,0015 | 0,0013 |
| gpt-5-mini (eu.api) | 2×1.150 img + 300; 200 out | 2.600×0,25 + 200×2 / 1M | 0,0011 | 0,0009 |
| Claude Haiku 4.5 (Bedrock eu, +10 %) | 2×900 img + 300; 200 out | (2.100×1 + 200×5)/1M × 1,1 | 0,0034 | 0,0029 |
| Claude Sonnet 5 (Vertex eu, +10 %) | idem | (2.100×2 + 200×10)/1M × 1,1 | 0,0068 | 0,0058 |
| Mistral Small 4 | 2×1.200 img + 300; 200 out | 2.700×0,15 + 200×0,60 / 1M | 0,0005 | 0,0004 |
| Mistral OCR 4.1 + anotación | 2 páginas anotadas | 2 × 5 $/1.000 | 0,010 (0,005 batch) | 0,0086 (0,0043) |
| Azure prebuilt-idDocument | 2 páginas | 2 × 10 $/1.000 | 0,020 | 0,017 |
| Textract AnalyzeID (EU) | 2 páginas | 2 × 0,025 | 0,050 | 0,043 |
| Mindee | 2 créditos | 2 × 0,044 | 0,088 | 0,075 |
| Veriff Essential | 1 verificación | 0,80 | 0,80 | 0,68 |
| MRZ en navegador | — | 0 | 0 | 0 |

Todas las opciones de IA con DPA + UE quedan **entre 10 y 100 veces por debajo** del objetivo de 0,05 €/documento. El coste dominante de este producto no será el OCR sino Vercel Pro (20 $/mes) y Supabase UE.

---

## 4. Arquitectura híbrida recomendada

**Principio rector**: la nota AEPD de 17-06-2025 (copia del DNI = tratamiento excesivo) y la política del portafolio ("nunca enviar datos personales a MiniMax") convierten la minimización en requisito de producto, no en optimización.

```
Móvil (navegador, PWA)
 │ 1. Cámara → recorte guiado del reverso (DNI/TIE) o página de datos (pasaporte)
 │ 2. OCR MRZ on-device (tesseract.js + OCR-B, o BlinkID si hay presupuesto)
 │ 3. Validar 4 checksums ICAO (`mrz` npm). Si OK → JSON listo. La imagen NUNCA se sube.
 │    (≈70-85 % de los casos: DNI, TIE, pasaportes, IDs UE)
 ▼ 4. Si falla 3 veces, o el documento no tiene MRZ (carné de conducir):
Vercel Function (región fra1/cdg1, sin persistir la imagen, sin logs del body)
 │ 5. Fallback IA con DPA + UE, JSON schema estricto:
 │    a) Mistral OCR 4.1 + Document Annotation (EU por defecto, ZDR solicitado)  ← primera opción
 │    b) Gemini 2.5 Flash en Vertex `eu` con response_schema                     ← alternativa más barata
 │    c) Claude Haiku 4.5 vía Bedrock `eu.anthropic…` con structured outputs      ← segunda alternativa
 │ 6. El validador del código (no la IA) comprueba: MRZ transcrita + checksums, formato DNI/NIE
 │    (letra de control mod 23), fechas coherentes, nacionalidad ISO-3166, caducidad.
 │ 7. Campo con confianza baja → el huésped lo corrige en pantalla (human-in-the-loop).
 ▼
Supabase (proyecto UE propio de viajeros): solo los campos del parte, nunca la foto.
```

**Por qué Mistral primero y no Gemini/Claude**: único proveedor cuya casa matriz, contrato y alojamiento son UE (sin depender de SCC para la inferencia), con ZDR que cubre `/v1/ocr`, precio plano y predecible, y pipeline OCR→LLM con schema ya hecho. Sus debilidades: precio 5-7× el de Gemini Flash (irrelevante en valor absoluto), ZDR sujeto a aprobación, y **sin datos de calidad en ID/MRZ**: hay que hacer el banco de pruebas propio con 30-50 fotos reales (distintos móviles, luz, brillos del holograma) antes de decidir; lo mismo para Gemini/Claude. Si Mistral rinde peor en fotos de móvil (está optimizado para PDF/escaneo), Gemini 2.5 Flash en Vertex `eu` es el plan B con mejor relación calidad/precio.

**Por qué no "Mistral OCR siempre"**: (1) la AEPD castiga enviar más dato del necesario; la MRZ local ya cumple; (2) evita latencia de red en el 80 % de los casos; (3) cada salida a un encargado exige registrarse en el registro de tratamientos y en la EIPD.

**Obligaciones RGPD que esta arquitectura deja pendientes**: EIPD (tratamiento de identidad a escala → probablemente obligatoria), registro de actividades con el encargado elegido y sus subencargados, DPA firmado/aceptado con Mistral (o Google/AWS), información al huésped en el momento de la captura, política de no-almacenamiento de imágenes verificable (sin logs de cuerpo en Vercel, sin `LIVE` storage), y tests de que las funciones nunca escriben la imagen a disco.

### Coste mensual estimado (solo OCR, € al cambio actual)

| Escenario | 1.000 docs | 10.000 docs | 100.000 docs |
|---|---|---|---|
| Híbrido: 75 % MRZ local + 25 % Mistral OCR 4.1 + anotación | 2,2 € | 22 € | 215 € |
| Híbrido: 75 % MRZ local + 25 % Gemini 2.5 Flash (Vertex eu) | 0,3 € | 3 € | 33 € |
| Híbrido: 75 % MRZ local + 25 % Claude Haiku 4.5 (Bedrock eu) | 0,7 € | 7 € | 73 € |
| Mistral OCR 4.1 + anotación siempre (2 caras) | 8,6 € | 86 € | 856 € (428 € batch) |
| Gemini 2.5 Flash siempre | 1,3 € | 13 € | 130 € |
| Azure prebuilt-idDocument siempre | ~4 € (500 pág. gratis) | 171 € | 1.712 € |
| Mindee siempre | 75 € | 753 € | 7.530 € |
| Veriff | 685 € | 6.850 € | 68.500 € |

Coste por documento en todos los híbridos: **< 0,003 €**, es decir, < 1/15 del objetivo. A 100.000 documentos/mes conviene renegociar precio con Mistral o activar batch (cuando la latencia lo permita; en check-in no).

---

## 5. Fuentes (todas consultadas el 2026-08-20)

**OpenRouter**
- https://openrouter.ai/docs/features/provider-routing [V]
- https://openrouter.ai/docs/features/zdr [V]
- https://openrouter.ai/api/v1/endpoints/zdr [V]
- https://openrouter.ai/privacy [V]
- https://openrouter.ai/enterprise [V]
- https://openrouter.zendesk.com/hc/en-us/articles/47828437697051 (DPA solo Enterprise) [S: 403 al abrir; citado desde el snippet del buscador]
- https://openrouter.ai/terms-of-service-enterprise [S]

**Anthropic**
- https://platform.claude.com/docs/en/about-claude/pricing [V]
- https://platform.claude.com/docs/en/manage-claude/data-residency [V]
- https://platform.claude.com/docs/en/build-with-claude/vision [V]
- https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai [V]
- https://www.anthropic.com/legal/data-processing-addendum [V]
- https://claude.com/regional-compliance [V]
- https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html [V]
- https://aws.amazon.com/about-aws/whats-new/2025/10/claude-4-5-haiku-anthropic-amazon-bedrock/ [S]

**OpenAI**
- https://developers.openai.com/api/docs/guides/your-data [V]
- https://developers.openai.com/api/docs/pricing [V]
- https://developers.openai.com/api/docs/guides/images-vision [S]
- https://openai.com/index/introducing-data-residency-in-europe/ [S]

**Google**
- https://ai.google.dev/gemini-api/docs/pricing [V]
- https://ai.google.dev/gemini-api/docs/image-understanding [V]
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency [V: vía snippet del buscador; la página completa no renderizó]
- https://docs.cloud.google.com/document-ai/docs/processors-list [V]
- https://docs.cloud.google.com/document-ai/docs/regions [S]
- https://cloud.google.com/document-ai/pricing [NE: página truncada; 0,10 $/doc según agregadores]
- https://discuss.google.dev/t/vertex-ai-using-gemini-2-5-flash-in-europe-west2/193843 [S]

**Mistral**
- https://mistral.ai/pricing/api [V]
- https://docs.mistral.ai/models/ocr-4-1 [V]
- https://mistral.ai/news/ocr-4/ [V]
- https://docs.mistral.ai/capabilities/document_ai/annotations [V]
- https://docs.mistral.ai/admin/monitor-comply/zero-data-retention [V]
- https://help.mistral.ai/en/articles/347629-where-do-you-store-my-data-or-my-organization-s-data [V]
- https://help.mistral.ai/en/articles/347612-can-i-activate-zero-data-retention-zdr [S]
- https://legal.mistral.ai/terms/data-processing-addendum [V]
- https://byteiota.com/mistral-ocr-3-2-1000-pages-cuts-document-ai-costs-97/ (OCR 3, dic-2025) [S]

**OCR especializado**
- https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/id-document (actualizada 15-08-2026) [V]
- https://azure.microsoft.com/en-us/pricing/details/ai-document-intelligence/ [V: sin cifras renderizadas]
- https://learn.microsoft.com/en-us/answers/questions/2154991/document-intelligence-query-field-add-on-pricing [S]
- https://docuocr.com/blog/azure-document-intelligence-pricing (25-07-2026) [S]
- https://aws.amazon.com/textract/pricing/ [V]
- https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/textract/USD/current/textract.json (EU Spain) [V]
- https://www.mindee.com/pricing [V]
- https://docs.mindee.com/models/data-processing-policies [V]
- https://github.com/BlinkID/blinkid-in-browser [V]
- https://docs.microblink.com/blinkid/sdk/web [V]
- https://microblink.com/resources/blog/blinkid-612-613-releases/ [S]
- https://microblink.com/free-plan/ [S]
- https://www.dynamsoft.com/mrz-scanner/ask-for-quote/ [S]
- https://support.regulaforensics.com/hc/en-us/articles/360036943712-Pricing-SDK-Licensing-Models [S: 403]
- https://www.veriff.com/pricing [V]
- https://blog.finexer.com/onfido-pricing/ ; https://beverified.org/providers/idnow/ ; https://www.klippa.com/en/identity-verification/api/ [S]

**MRZ / local**
- https://www.npmjs.com/package/mrz [V]
- https://github.com/eringen/web-mrz-reader [S]
- https://groups.google.com/g/tesseract-ocr/c/5cG_s43WmKU (dataset MRZ OCR-B) [S]
- https://arxiv.org/pdf/2009.05489 (MRZ con CNN; PassportEye pobre) [S]
- https://github.com/PaddlePaddle/PaddleOCR/discussions/8852 [S]
- https://nullmirror.com/en/blog/2026-05-24-local-vision-language-ocr-benchmark/ [S]
- https://pub.towardsai.net/paddleocr-vl-1-5-… [S]
- https://modal.com/pricing [V]
- https://www.mobbeel.com/en/blog/spanish-id-cards-evolution-and-meaning-of-dni-3-0-fields/ [S]
- https://veridas.com/es/codigo-mrz/ [S]
- https://registroviajero.com/blog/numero-de-soporte-dni/ [S]

**Regulatorio**
- https://www.aepd.es/prensa-y-comunicacion/notas-de-prensa/aepd-informa-de-que-no-esta-permitido-solicitar-copia-dni-o-pasaporte-en-hospedajes (17-06-2025) [V: nota oficial]
- https://www.aepd.es/guias/nota-aepd-registro-hospedajes.pdf [V]

**Tipo de cambio**: https://tradingeconomics.com/euro-area/currency (EUR/USD 1,1684, 20-08-2026) [S]
