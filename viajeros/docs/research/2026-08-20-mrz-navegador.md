# Investigación · Lectura de MRZ 100 % en el navegador (2026-08-20)

Informe de agente (15 búsquedas + ~40 fetches). **[V]** verificado en fuente oficial · **[S]** secundario · **[NE]** no encontrado.
Requisito de partida: **la imagen no sale del dispositivo**.

## Resumen ejecutivo

1. **Es viable**, pero no con `tesseract.js` "a pelo". El mejor camino esfuerzo/acierto: **detección morfológica de la banda + OCR de caracteres aislados con una CNN pequeña en ONNX + validación por dígitos de control**.
2. **El DNI español es el caso fácil**: ofrece **tres validaciones independientes** (dígito de control del soporte, dígito compuesto, y la letra mod-23 del DNI). Eso convierte un OCR del 95 % en un sistema que **casi nunca acepta un dato erróneo**: degrada a "reintenta" o "escríbelo a mano".
3. **Confirmada la estructura del TD1 español** (ver §4): posiciones 6-14 = número de soporte, 16-24 = número de DNI/NIE. **Un solo escaneo del reverso resuelve los dos campos que SES pide por separado.**
4. **NFC desde web: descartado.** Web NFC solo hace NDEF, no ISO-DEP/APDU, y solo en Chrome Android.
5. **Los SDK comerciales no publican precio** y pesan 31-72 MB.

## 1. Librerías

| Librería | Licencia | Tamaño | Precio | Calidad | |
|---|---|---|---|---|---|
| `@mrz-scanner/*` (alsenet-labs) | **AGPL-3.0** | modelo ONNX ~300 KB + ort-web | Gratis (AGPL) o comercial a negociar | `accuracy: 1.0` sobre crops 20×20 limpios, **no end-to-end** | [V] |
| `tesseract.js` v7 + traineddata MRZ | Apache-2.0 | JS 1,4 MB + core 30,6 MB desempaquetado (~2-4 MB servidos) | Gratis | **No documentada**; 95-96 % con escaneo 150-300 dpi | [V] |
| `web-mrz-reader` v2.0.1 (04-2026) | **ISC** | paquete 37,6 MB; traineddata `mrz` **1,3 MB** | Gratis | "1-3 s"; sin cifras | [V] |
| `uwolfer/mrz-scanner` (PWA) | **GPL-3.0** | tesseract.js | Gratis | — | [V] |
| `mrz` v5.0.2 (cheminfo) | **MIT** | **202 KB, 0 dependencias** | Gratis | Solo parseo + check digits. Impecable | [V] |
| `mrz-detection` / `image-js` | MIT | — | Gratis | Detección morfológica | [V] |
| `@microblink/blinkid` v8 | Propietaria | **~72 MB** | **No publicado** | Líder, sin benchmark público | [V] |
| `dynamsoft-capture-vision-bundle` | Propietaria | **~31,5 MB** | Oculto tras email | Sin benchmark | [V] |
| Scanbot / Anyline | Propietaria | — | "Contact us" | — | [V] |
| PaddleOCR-web | Apache-2.0 | — | Gratis | **No hay puerto oficial a navegador** | [V] |

**Licencias — crítico**: `@mrz-scanner` (AGPL) y `uwolfer/mrz-scanner`, `Exteris/tesseract-mrz` (GPL) **no son utilizables en una SaaS comercial cerrada**. Permisivos: `mrz` (MIT), `image-js` (MIT), `tesseract.js` (Apache-2.0), `web-mrz-reader` (ISC).

**BlinkID**: el repo `blinkid-in-browser` está **archivado**; migrar a `blinkid-web`. Desde 5.8.0 requiere conexión para validar licencia, aunque el escaneo y la extracción siguen ocurriendo en el navegador.

## 2. Tasa de acierto real de tesseract.js

**[NE] No existe ningún benchmark público, reproducible y con dataset conocido de tesseract.js leyendo MRZ en fotos de móvil.** Todas las cifras que circulan son anécdotas.

Evidencia concreta:
- **95-96 %** con **escaneo plano de 1900×250 px a 150-300 dpi** (foro oficial de Tesseract); "80-90 % en iOS". Confusiones citadas: `O,0,W,M,Z,2,4,V`. *No es foto de móvil: nuestro escenario es peor.*
- **Con el modelo `eng` por defecto es inservible** (issue #520): los `<` se convierten sistemáticamente en `L`, `K` o `X`.
- El autor de `web-mrz-reader`: entrenaron un modelo específico de MRZ y mejoró drásticamente en los caracteres que se confunden (`0` vs `O`, `1` vs `I`, `<` vs `K`/`X`).
- **Tiempos**: 1-3 s por intento sobre la banda ya recortada; el enfoque CNN de `@mrz-scanner` mantiene **~7 fps** (≈20× más rápido).
- **Bug iOS 17 Safari** con modelos **Legacy (OEM 0)**: `RuntimeError: call_indirect to a null table entry` (issue #867). **Usar LSTM (OEM 1) obligatoriamente.**

**Preprocesado canónico** (PyImageSearch, replicado por `mrz-detection`): grayscale → GaussianBlur 3×3 → **blackhat** kernel (25,7) → **Scharr** en X → minmax → closing → **Otsu** → closing (21,21) → erode ×2 → componentes conexos → filtro por aspect-ratio → rotación → crop.
**Resolución**: ≥ 1600 px de ancho para la banda recortada; pedir `{width:{ideal:1920}}` en `getUserMedia`.

**Cómo medirlo nosotros**: generador sintético de reversos de DNI (MRZ TD1 con check digits correctos, fuente OCR-B) + augmentación fotográfica (perspectiva ±20°, reflejo especular del laminado, sombra, blur, JPEG q60-85, temperatura 2700-6500K). Métricas: CER, tasa de MRZ correcta, **tasa de aceptación válida**, **tasa de falso positivo** (debe ser ~0), latencia p50/p95. Más 20-30 fotos reales con consentimiento explícito, en 5 condiciones de luz. Dispositivos objetivo: gama media 2023-2024.

## 3. Detección de banda y APIs del navegador

- **Recomendado**: heurística morfológica en JS puro sobre `ImageData` (o `image-js`, MIT). 0 bytes de modelo, milisegundos sobre un frame reducido.
- OpenCV.js: 8-10 MB para 5 operaciones morfológicas — no compensa.
- **Truco que reduce el problema a la mitad**: marco guía con relación **ID-1 (85,60 × 53,98 mm)** y buscar la MRZ solo en el **tercio inferior**.
- **Validación multi-frame**: aceptar cuando la **misma cadena se repita en 2-3 frames consecutivos Y pasen todos los check digits**. Elimina casi todos los falsos positivos.

| API nativa | Estado 2026 | ¿Sirve? |
|---|---|---|
| `BarcodeDetector` | Chrome 83+, 76 % global; **Firefox no, Safari deshabilitado** | **No**: no tiene capacidad de texto ni OCR |
| `TextDetector` | **Sigue tras flag**; no se considera estable para estandarizar | **No** |

## 4. DNI español 3.0/4.0 y TIE — estructura exacta

DNI 3.0/4.0: policarbonato, **85,60 × 53,98 mm (ID-1)**, MRZ en el **reverso**, formato **TD1 (3 líneas × 30)**. DNI 4.0 (Reglamento UE 2019/1157): tinta ópticamente variable, microescritura, **chip de doble interfaz**, tintas UV. [V] dnielectronico.es

**Línea 1 — confirmado por triangulación (ICAO 9303-5 + Mobbeel + código de `cheminfo/mrz`):**

| Línea | Posiciones | Campo | Ejemplo |
|---|---|---|---|
| 1 | 1-2 | Tipo de documento | `ID` |
| 1 | 3-5 | Estado emisor | `ESP` |
| 1 | **6-14** | **NÚMERO DE SOPORTE (IDESP)** | `ABC123456` |
| 1 | 15 | Dígito de control del soporte | `0` |
| 1 | **16-24** | **NÚMERO DE DNI / NIE** | `12345678Z` |
| 1 | 25-30 | Relleno | `<<<<<<` |
| 2 | 1-6 / 7 | Fecha nacimiento / DC | `741015` / `0` |
| 2 | 8 | Sexo (`M`/`F`/`<`) | `M` |
| 2 | 9-14 / 15 | Caducidad / DC | `090322` / `6` |
| 2 | 16-18 | Nacionalidad | `ESP` |
| 2 | 19-29 | Opcional 2 (relleno) | `<<<<<<<<<<<` |
| 2 | **30** | **Dígito de control compuesto** | `9` |
| 3 | 1-30 | `APELLIDO1<APELLIDO2<<NOMBRE` | |

**Nomenclatura traicionera**: la librería `mrz` llama `documentNumber` al **número de soporte** y `optional1` al **número de DNI**. Es la inversión que rompe integraciones — documentarlo en el código.

**Avisos**:
- **DNI antiguo no electrónico**: IDESP = nº de DNI + 1 dígito → **10 caracteres, no caben en el campo de 9**. Contemplar como fallo controlado. [S]
- **TIE**: soporte = `E` + 8 dígitos (9 ✓); NIE (`X/Y/Z` + 7 + letra) = 9 ✓. **[S] No verificado contra un TIE real — pendiente.**
- **Sexo**: en la MRZ es `M`/`F`/`<` (ICAO), no `V` como en el campo visual histórico español.

**RD 933/2021 Anexo I** [V BOE]: A.3 (profesional) pide número de documento, **número de soporte** y tipo; **B.3 (no profesional) no exige el número de soporte**.

### La ventaja escondida: tres validaciones independientes

1. **DC del soporte** (pos 15) sobre 6-14, mod-10 pesos 7-3-1.
2. **DC compuesto** (L2 pos 30) — **cubre el número de DNI**.
3. **Letra del DNI**: `"TRWAGMYFPDXBNJZSQVHLCKE"[n % 23]` (NIE: `X→0, Y→1, Z→2`).

Más la coherencia semántica (caducidad futura, nacimiento razonable). **Aunque el OCR acierte solo el 85 % a la primera, la probabilidad de aceptar un dato erróneo es despreciable.** Esto es lo que hace el proyecto viable con OCR gratuito.

## 5. NFC desde el navegador — descartado

**Web NFC 2026** [V MDN/caniuse]: solo **Chrome Android 151+**; Firefox posición "Harmful", Safari "Opposed". Y solo **NDEF**: las operaciones de bajo nivel (ISO-DEP, NFC-A/B) están fuera del scope.

**No se puede leer el DG1 con BAC/PACE desde el navegador**, por tres razones acumulativas: (1) un eMRTD es una smartcard ISO 14443-4 que responde a **APDUs**, y Web NFC no puede emitir ninguno; (2) **BAC/PACE deriva su clave de la propia MRZ** (documento + nacimiento + caducidad) → el NFC no elimina el OCR, lo complementa; (3) el DNIe exige **CAN/PIN** y el canal PACE propio.

App nativa Android (`IsoDep`) e iOS (`CoreNFC`, con entitlement aprobado por Apple) sí pueden. **Una PWA no**: mismo motor, mismas APIs. Y una app destruye la propuesta de valor ("el huésped abre un enlace"). **Guardar como opción Tier B** para tablets de recepción.

## 6. Recomendación y esfuerzo

**Pipeline (todo en Web Worker)**: getUserMedia 1920×1080 → ROI del tercio inferior del marco guía ID-1 → detección de banda (blackhat/Scharr/Otsu) → warp de perspectiva a 1600 px → segmentación 3×30 → OCR → parseo con `mrz` (MIT) → **validación en cascada de los 3 check digits** → corrección de confusiones dirigida por campo (`O↔0, I↔1, S↔5, B↔8, Z↔2, <↔K/X/L`) hasta punto fijo → **estabilidad multi-frame** → pantalla de confirmación **siempre editable**.

| Bloque | Plan B (tesseract) | Plan A (CNN propia) |
|---|---|---|
| Cámara + marco guía + UX | 1 d | 1 d |
| Detección de banda + warp | 2 d | 2 d |
| Segmentación 3×30 | — | 1,5 d |
| OCR | 1 d | 2,5 d |
| Parseo + 3 check digits + letra | 1 d | 1 d |
| Confusiones + multi-frame | 1 d | 1 d |
| Confirmación editable + fallback manual | 1 d | 1 d |
| Worker + empaquetado | 0,5 d | 1 d |
| Banco de pruebas + medición | 1,5 d | 1,5 d |
| **Total** | **~9 días** | **~12,5 días** |

**Camino recomendado**: Plan B primero (traineddata ISC de `web-mrz-reader`, OEM 1 LSTM, whitelist `A-Z0-9<`, PSM 6), medir, y sustituir solo el bloque de OCR por una CNN si el CER no baja del 1 %. El preprocesado y la validación —el 70 % del trabajo— se comparten. Peso del Plan A: ~1,5-2,5 MB frente a 31-72 MB de los SDK comerciales.

**Preprocesado por orden de impacto**: (1) marco guía ID-1 + ROI inferior; (2) corrección de perspectiva; (3) blackhat+Scharr+Otsu; (4) normalización de altura de línea; (5) multi-frame + check digits; (6) **botón de linterna y aviso de inclinar la tarjeta** (el DOVID holográfico y la tinta ópticamente variable del reverso rebotan el flash); (7) descarte de frames borrosos por varianza del Laplaciano.

## Riesgos abiertos

- **Licencias AGPL/GPL** en las dos librerías más atractivas.
- **iOS Safari** con modelos legacy (usar siempre OEM 1) — iOS es probablemente > 50 % de los huéspedes.
- **Sin fuente oficial de la Policía** que describa campo a campo la MRZ del DNI: el layout está confirmado por triangulación. **Validar con 3-4 DNI reales (3.0 y 4.0) y un TIE antes de producción.**
- **RGPD**: la imagen no sale, pero **el dato extraído sí es dato personal** y viaja a nuestro backend. El "todo en el dispositivo" aplica a la imagen, no al dato. Anotarlo así en el registro de tratamientos.

## Fuentes principales

dnielectronico.es (DNI 3.0 y 4.0, oficial) · BOE RD 933/2021 Anexo I · ICAO *Additional TD1 layout specifications* · github.com/cheminfo/mrz (`src/parse/td1Fields.ts`) · github.com/alsenet-labs/mrz-scanner · github.com/eringen/web-mrz-reader (+ `model_training.md`) · naptha/tesseract.js issues #520, #867, #225 · foro oficial Tesseract "Passport MRZ characters OCR" · PyImageSearch (OCR passports / detecting MRZ) · Mobbeel "Spanish ID cards, evolution and meaning of DNI 3.0 fields" · MDN Web NFC y Barcode Detection API · caniuse webnfc / mdn-api_barcodedetector · Chrome for Developers Shape Detection API.
