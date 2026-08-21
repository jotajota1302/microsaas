# Núcleo del parte de viajeros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la biblioteca que convierte los datos de un check-in en un mensaje SOAP válido para SES.Hospedajes, con un validador que garantiza que nada inválido llega al Ministerio.

**Architecture:** Módulos JS puros sin dependencias, ejecutables en Node y en el navegador. Tres capas: (1) primitivas de identidad (letra del DNI/NIE, checksums de MRZ), (2) catálogos y validador de reglas de negocio de SES, (3) generador de XML → ZIP → Base64 → sobre SOAP. Todo probado con `node:test` y fixtures **sintéticos**; ninguna llamada de red en este plan.

**Tech Stack:** Node ≥ 20 (ESM, `node:test`, `node:assert`, `node:zlib`), JavaScript vanilla sin dependencias de producción. `libxmljs`/`xmllint` solo como herramienta de desarrollo opcional para validar contra el XSD.

**Spec:** `docs/plan-2026.md` (secciones 4 y 5) · Esquemas oficiales: `schema/ses/v3.1.3/` · Investigación de referencia: `docs/research/2026-08-20-ses-especificacion.md`

> **Este plan está verificado, no solo escrito.** El 2026-08-20 se extrajo todo su código a un directorio temporal y se ejecutó: **42 de 42 tests en verde**, el ZIP generado a mano lo abre `unzip` sin quejarse, y el XML resultante **valida contra el XSD oficial del Ministerio** (`lxml`). Los dos fallos que aparecieron durante esa prueba (el script `node --test test/` y la ventana de siglo de las fechas de caducidad) ya están corregidos aquí. Si algo falla al ejecutarlo, es un error de transcripción, no de diseño.

## Global Constraints

- Código y comentarios **en inglés**; mensajes de error dirigidos al usuario **en español**.
- **Cero dependencias de producción.** Solo módulos nativos de Node y código propio.
- ESM (`"type": "module"` en `package.json`). Node ≥ 20.
- **Nunca datos reales de personas** en fixtures o tests: solo sintéticos. Los DNI de prueba usan la letra correcta calculada, no personas reales.
- El validador **rechaza por defecto**: si una regla no se puede comprobar, es un error, no una advertencia.
- Los módulos de `lib/` no pueden importar nada de `api/` ni tocar red, disco ni variables de entorno.
- Longitudes máximas de campo **exactamente** las del XSD (`schema/ses/v3.1.3/tiposGenerales.xsd`): nombre/apellido1/apellido2/referencia/medioPago 50, dirección 100, titular 100, documento 15, soporte 9, teléfono 20, correo 250, código postal 20, municipio 5 dígitos, país 3 letras, caducidadTarjeta 7.
- Todo commit en español, formato `feat:`/`test:`/`fix:`.

---

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `package.json` | ESM, script `test` con `node --test` |
| `lib/identity.js` | Letra de control de DNI/NIE, normalización de documentos, checksums ICAO y parseo de MRZ TD1/TD3 |
| `lib/catalogs.js` | Tablas de códigos de SES (documento, sexo, parentesco, pago, establecimiento) y utilidades de país ISO-3166-1 alfa-3 |
| `schema/parte.schema.json` | Forma del JSON interno del parte (documentación + validación estructural) |
| `lib/validate-parte.js` | Validación estructural + **todas** las reglas de negocio de SES. Punto único de verdad |
| `lib/build-xml.js` | JSON validado → XML `altaParteHospedaje` (escapado, orden del XSD) |
| `lib/build-request.js` | XML → ZIP → Base64 → sobre SOAP `comunicacionRequest` |
| `test/fixtures/*.json` | Partes sintéticos: válidos y cada tipo de inválido |
| `test/*.test.js` | Un fichero de test por módulo |

---

### Task 1: Cimientos del proyecto

**Files:**
- Create: `package.json`
- Create: `.gitignore` (añadir entradas propias del proyecto)
- Create: `test/smoke.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: el comando `npm test` que ejecuta todos los `test/**/*.test.js`.

- [ ] **Step 1: Write the failing test**

Create `test/smoke.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('test runner is wired up', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `npm error Missing script: "test"` (no existe `package.json` todavía).

- [ ] **Step 3: Create package.json**

Create `package.json`:

```json
{
  "name": "viajeros",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — `# pass 1`.

- [ ] **Step 5: Commit**

```bash
git add package.json test/smoke.test.js
git commit -m "feat: cimientos del proyecto viajeros con node:test"
```

---

### Task 2: Primitivas de identidad — letra de control de DNI y NIE

**Files:**
- Create: `lib/identity.js`
- Create: `test/identity.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `normalizeDocumentNumber(raw: string): string` — mayúsculas, sin espacios ni guiones.
  - `isValidNif(value: string): boolean` — 8 dígitos + letra correcta.
  - `isValidNie(value: string): boolean` — X/Y/Z + 7 dígitos + letra correcta.
  - `isValidDocumentNumber(type: string, value: string): boolean` — despacha por `NIF`/`NIE`/`PAS`/`OTRO`.

- [ ] **Step 1: Write the failing test**

Create `test/identity.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDocumentNumber,
  isValidNif,
  isValidNie,
  isValidDocumentNumber,
} from '../lib/identity.js';

test('normalizeDocumentNumber uppercases and strips separators', () => {
  assert.equal(normalizeDocumentNumber(' 12345678-z '), '12345678Z');
  assert.equal(normalizeDocumentNumber('x 1234567 l'), 'X1234567L');
});

test('isValidNif accepts a correct control letter', () => {
  // 12345678 % 23 === 14 -> 'Z' in TRWAGMYFPDXBNJZSQVHLCKE
  assert.equal(isValidNif('12345678Z'), true);
  assert.equal(isValidNif('00000000T'), true);
});

test('isValidNif rejects a wrong control letter and bad shapes', () => {
  assert.equal(isValidNif('12345678A'), false);
  assert.equal(isValidNif('1234567Z'), false);
  assert.equal(isValidNif('123456789'), false);
  assert.equal(isValidNif(''), false);
});

test('isValidNie handles the X/Y/Z prefix substitution', () => {
  assert.equal(isValidNie('X1234567L'), true); // X -> 0
  assert.equal(isValidNie('Y1234567X'), true); // Y -> 1 -> 11234567 % 23 === 21 -> 'X'
  assert.equal(isValidNie('X1234567A'), false);
  assert.equal(isValidNie('A1234567L'), false);
});

test('isValidDocumentNumber dispatches by document type', () => {
  assert.equal(isValidDocumentNumber('NIF', '12345678Z'), true);
  assert.equal(isValidDocumentNumber('NIE', 'X1234567L'), true);
  assert.equal(isValidDocumentNumber('NIF', 'X1234567L'), false);
  // Passports and OTRO are not checkable: any non-empty printable value passes.
  assert.equal(isValidDocumentNumber('PAS', 'ABC123456'), true);
  assert.equal(isValidDocumentNumber('PAS', ''), false);
  assert.equal(isValidDocumentNumber('OTRO', 'X'), true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/identity.js'`.

- [ ] **Step 3: Write the implementation**

Create `lib/identity.js`:

```javascript
// Identity primitives for Spanish documents and ICAO 9303 machine-readable zones.
// Pure functions: no I/O, usable both in Node and in the browser.

const CONTROL_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const NIE_PREFIX_DIGITS = { X: '0', Y: '1', Z: '2' };

/** Uppercase and remove spaces, dots and dashes. */
export function normalizeDocumentNumber(raw) {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[\s.-]/g, '');
}

function controlLetterFor(digits) {
  return CONTROL_LETTERS[Number(digits) % 23];
}

/** Spanish NIF: 8 digits plus the mod-23 control letter. */
export function isValidNif(value) {
  const normalized = normalizeDocumentNumber(value);
  if (!/^\d{8}[A-Z]$/.test(normalized)) return false;
  return controlLetterFor(normalized.slice(0, 8)) === normalized[8];
}

/** Spanish NIE: X/Y/Z, 7 digits, control letter over the substituted number. */
export function isValidNie(value) {
  const normalized = normalizeDocumentNumber(value);
  if (!/^[XYZ]\d{7}[A-Z]$/.test(normalized)) return false;
  const digits = NIE_PREFIX_DIGITS[normalized[0]] + normalized.slice(1, 8);
  return controlLetterFor(digits) === normalized[8];
}

/**
 * Validate a document number for a SES document type.
 * PAS and OTRO cannot be checked algorithmically: only emptiness is rejected.
 */
export function isValidDocumentNumber(type, value) {
  const normalized = normalizeDocumentNumber(value);
  if (normalized.length === 0) return false;
  if (type === 'NIF') return isValidNif(normalized);
  if (type === 'NIE') return isValidNie(normalized);
  return normalized.length <= 15;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all 5 identity tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/identity.js test/identity.test.js
git commit -m "feat: validacion de letra de control de NIF y NIE"
```

---

### Task 3: Primitivas de identidad — checksums ICAO y parseo de MRZ

Esta tarea es la que permite el check-in "sin foto": el móvil lee la franja y estos cheques confirman que la lectura es correcta antes de fiarse de ella.

**Files:**
- Modify: `lib/identity.js` (añadir al final)
- Modify: `test/identity.test.js` (añadir al final)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `icaoCheckDigit(input: string): number` — dígito de control ICAO 9303 (pesos 7-3-1).
  - `parseMrz(lines: string[]): MrzResult` donde
    `MrzResult = { ok: boolean, errors: string[], format: 'TD1'|'TD3'|null, fields: { documentNumber, supportNumber, birthDate, sex, expiryDate, nationality, surname, givenNames } | null }`.
    Las fechas salen en `YYYY-MM-DD`; `sex` en `H`/`M`/`O` (códigos de SES).

- [ ] **Step 1: Write the failing test**

Append to `test/identity.test.js`:

```javascript
import { icaoCheckDigit, parseMrz } from '../lib/identity.js';

test('icaoCheckDigit matches the canonical ICAO 9303 examples', () => {
  assert.equal(icaoCheckDigit('740812'), 2);   // date of birth in the spec example
  assert.equal(icaoCheckDigit('120415'), 9);   // expiry date in the spec example
  assert.equal(icaoCheckDigit('L898902C<'), 3);
  assert.equal(icaoCheckDigit(''), 0);
});

test('parseMrz reads a TD3 passport and validates every check digit', () => {
  const lines = [
    'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
    'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
  ];
  const result = parseMrz(lines);
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.format, 'TD3');
  assert.equal(result.fields.documentNumber, 'L898902C3');
  assert.equal(result.fields.birthDate, '1974-08-12');
  assert.equal(result.fields.expiryDate, '2012-04-15');
  assert.equal(result.fields.sex, 'M');
  assert.equal(result.fields.nationality, 'UTO');
  assert.equal(result.fields.surname, 'ERIKSSON');
  assert.equal(result.fields.givenNames, 'ANNA MARIA');
});

test('parseMrz rejects a TD3 line whose check digit was mistyped', () => {
  const lines = [
    'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
    'L898902C36UTO7408121F1204159ZE184226B<<<<<10',
  ];
  const result = parseMrz(lines);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('fecha de nacimiento')));
});

test('parseMrz reads a TD1 identity card and exposes the support number', () => {
  // Synthetic TD1: document (support) number BAA000589, holder document 99999999R.
  const lines = buildSyntheticTd1();
  const result = parseMrz(lines);
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.format, 'TD1');
  assert.equal(result.fields.supportNumber, 'BAA000589');
  assert.equal(result.fields.documentNumber, '99999999R');
  assert.equal(result.fields.nationality, 'ESP');
  assert.equal(result.fields.sex, 'H');
});

test('parseMrz rejects input with the wrong number of lines or length', () => {
  assert.equal(parseMrz(['too', 'short']).ok, false);
  assert.equal(parseMrz([]).ok, false);
});

// Builds a valid synthetic TD1 MRZ, computing every check digit, so the test
// never embeds a real person's document.
function buildSyntheticTd1() {
  const pad = (value, length) => value.padEnd(length, '<');
  const supportNumber = 'BAA000589';
  const holderDocument = '99999999R';
  const birth = '850101';
  const expiry = '300101';

  const line1 =
    'ID' +
    'ESP' +
    pad(supportNumber, 9) +
    String(icaoCheckDigit(pad(supportNumber, 9))) +
    pad(holderDocument, 15);

  const line2Head =
    birth +
    String(icaoCheckDigit(birth)) +
    'M' +
    expiry +
    String(icaoCheckDigit(expiry)) +
    'ESP' +
    pad('', 11);
  const composite =
    line1.slice(5, 30) + line2Head.slice(0, 7) + line2Head.slice(8, 15) + line2Head.slice(18, 29);
  const line2 = line2Head + String(icaoCheckDigit(composite));

  const line3 = pad('GARCIA<LOPEZ<<JUAN<CARLOS', 30);
  return [line1, line2, line3];
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `icaoCheckDigit is not a function` (aún no exportada).

- [ ] **Step 3: Write the implementation**

Append to `lib/identity.js`:

```javascript
// --- ICAO 9303 machine-readable zone ---------------------------------------

const CHECK_WEIGHTS = [7, 3, 1];

function characterValue(character) {
  if (character === '<') return 0;
  if (character >= '0' && character <= '9') return Number(character);
  if (character >= 'A' && character <= 'Z') return character.charCodeAt(0) - 55;
  return NaN;
}

/** ICAO 9303 check digit: weights 7-3-1 repeating, modulo 10. */
export function icaoCheckDigit(input) {
  let total = 0;
  for (let index = 0; index < input.length; index += 1) {
    const value = characterValue(input[index]);
    if (Number.isNaN(value)) return NaN;
    total += value * CHECK_WEIGHTS[index % 3];
  }
  return total % 10;
}

const SEX_BY_MRZ = { M: 'H', F: 'M', '<': 'O' };

/**
 * Expand a YYMMDD MRZ date into YYYY-MM-DD.
 * Birth dates can never be in the future; expiry dates may be in the past
 * (an expired document still identifies its holder), so they take the century
 * that lands closest to today.
 */
function expandDate(yymmdd, { future }) {
  const shortYear = Number(yymmdd.slice(0, 2));
  const month = yymmdd.slice(2, 4);
  const day = yymmdd.slice(4, 6);
  const currentYear = new Date().getUTCFullYear();
  let year = Math.floor(currentYear / 100) * 100 + shortYear;
  if (future) {
    if (year - currentYear > 50) year -= 100;
    if (currentYear - year > 50) year += 100;
  } else if (year > currentYear) {
    year -= 100;
  }
  return `${year}-${month}-${day}`;
}

function parseNames(field) {
  const [surnamePart = '', givenPart = ''] = field.split('<<');
  return {
    surname: surnamePart.replace(/</g, ' ').trim(),
    givenNames: givenPart.replace(/</g, ' ').trim(),
  };
}

function verify(errors, label, field, expected) {
  if (icaoCheckDigit(field) !== Number(expected)) {
    errors.push(`El dígito de control de ${label} no cuadra: vuelve a escanear.`);
  }
}

function parseTd3(lines) {
  const errors = [];
  const [line1, line2] = lines;
  const documentNumber = line2.slice(0, 9);
  const birth = line2.slice(13, 19);
  const expiry = line2.slice(21, 27);
  const optional = line2.slice(28, 42);

  verify(errors, 'el número de documento', documentNumber, line2[9]);
  verify(errors, 'la fecha de nacimiento', birth, line2[19]);
  verify(errors, 'la fecha de caducidad', expiry, line2[27]);
  verify(errors, 'el número personal', optional, line2[42]);
  verify(
    errors,
    'la línea completa',
    line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 43),
    line2[43],
  );

  const names = parseNames(line1.slice(5));
  return {
    errors,
    fields: {
      documentNumber: documentNumber.replace(/</g, ''),
      supportNumber: '',
      birthDate: expandDate(birth, { future: false }),
      expiryDate: expandDate(expiry, { future: true }),
      sex: SEX_BY_MRZ[line2[20]] ?? 'O',
      nationality: line2.slice(10, 13).replace(/</g, ''),
      ...names,
    },
  };
}

function parseTd1(lines) {
  const errors = [];
  const [line1, line2, line3] = lines;
  // On the Spanish DNI/TIE the document number field carries the support number
  // and the optional field carries the holder's DNI/NIE.
  const supportNumber = line1.slice(5, 14);
  const holderDocument = line1.slice(15, 30).replace(/</g, '');
  const birth = line2.slice(0, 6);
  const expiry = line2.slice(8, 14);

  verify(errors, 'el número de soporte', supportNumber, line1[14]);
  verify(errors, 'la fecha de nacimiento', birth, line2[6]);
  verify(errors, 'la fecha de caducidad', expiry, line2[14]);
  verify(
    errors,
    'la línea completa',
    line1.slice(5, 30) + line2.slice(0, 7) + line2.slice(8, 15) + line2.slice(18, 29),
    line2[29],
  );

  const names = parseNames(line3);
  return {
    errors,
    fields: {
      documentNumber: holderDocument,
      supportNumber: supportNumber.replace(/</g, ''),
      birthDate: expandDate(birth, { future: false }),
      expiryDate: expandDate(expiry, { future: true }),
      sex: SEX_BY_MRZ[line2[7]] ?? 'O',
      nationality: line2.slice(15, 18).replace(/</g, ''),
      ...names,
    },
  };
}

/**
 * Parse a machine-readable zone. Accepts TD1 (3 lines of 30) and
 * TD3 (2 lines of 44). Every check digit must match or ok is false.
 */
export function parseMrz(lines) {
  const failure = (message) => ({ ok: false, errors: [message], format: null, fields: null });
  if (!Array.isArray(lines)) return failure('No se ha podido leer el documento.');

  const cleaned = lines.map((line) => String(line).toUpperCase().replace(/\s/g, ''));
  let parsed;
  let format;
  if (cleaned.length === 3 && cleaned.every((line) => line.length === 30)) {
    format = 'TD1';
    parsed = parseTd1(cleaned);
  } else if (cleaned.length === 2 && cleaned.every((line) => line.length === 44)) {
    format = 'TD3';
    parsed = parseTd3(cleaned);
  } else {
    return failure('La franja leída no tiene el formato esperado: vuelve a intentarlo.');
  }

  return {
    ok: parsed.errors.length === 0,
    errors: parsed.errors,
    format,
    fields: parsed.errors.length === 0 ? parsed.fields : null,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — los 5 tests nuevos en verde.

- [ ] **Step 5: Commit**

```bash
git add lib/identity.js test/identity.test.js
git commit -m "feat: lectura y verificacion de MRZ TD1 y TD3"
```

> **Nota para quien implemente**: la posición exacta del DNI dentro del campo opcional del TD1 español está confirmada por documentación secundaria, no por un documento real. Antes de Fase 2, verificar con 3-5 documentos reales (propios) y ajustar `parseTd1` si hiciera falta. El test usa un TD1 sintético construido con los checksums correctos, así que seguirá siendo válido.

---

### Task 4: Catálogos de códigos de SES

**Files:**
- Create: `lib/catalogs.js`
- Create: `test/catalogs.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `DOCUMENT_TYPES: string[]`, `SEXES: string[]`, `RELATIONSHIPS: Record<string,string>`, `PAYMENT_TYPES: Record<string,string>`, `ESTABLISHMENT_TYPES: string[]`.
  - `isValidCountryCode(code: string): boolean` — ISO-3166-1 alfa-3.
  - `isValidIneCode(code: string): boolean` — 5 dígitos, provincia 01-52.

- [ ] **Step 1: Write the failing test**

Create `test/catalogs.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_TYPES,
  SEXES,
  RELATIONSHIPS,
  PAYMENT_TYPES,
  ESTABLISHMENT_TYPES,
  isValidCountryCode,
  isValidIneCode,
} from '../lib/catalogs.js';

test('SES code tables match the official catalogue', () => {
  assert.deepEqual(DOCUMENT_TYPES, ['NIF', 'NIE', 'PAS', 'OTRO']);
  assert.deepEqual(SEXES, ['H', 'M', 'O']);
  assert.equal(RELATIONSHIPS.HJ, 'Hijo/a');
  assert.equal(RELATIONSHIPS.TU, 'Tutor/a');
  assert.equal(Object.keys(RELATIONSHIPS).length, 16);
  assert.equal(PAYMENT_TYPES.EFECT, 'Efectivo');
  assert.equal(PAYMENT_TYPES.TARJT, 'Tarjeta');
  assert.ok(ESTABLISHMENT_TYPES.includes('VUT'));
  assert.ok(ESTABLISHMENT_TYPES.includes('HOTEL'));
});

test('isValidCountryCode accepts ISO-3166-1 alpha-3 only', () => {
  assert.equal(isValidCountryCode('ESP'), true);
  assert.equal(isValidCountryCode('FRA'), true);
  assert.equal(isValidCountryCode('ES'), false);
  assert.equal(isValidCountryCode('ESPA'), false);
  assert.equal(isValidCountryCode('123'), false);
  assert.equal(isValidCountryCode(''), false);
});

test('isValidIneCode requires five digits with a real province prefix', () => {
  assert.equal(isValidIneCode('28079'), true); // Madrid
  assert.equal(isValidIneCode('07001'), true); // Baleares
  assert.equal(isValidIneCode('52001'), true); // Melilla
  assert.equal(isValidIneCode('00123'), false);
  assert.equal(isValidIneCode('53001'), false);
  assert.equal(isValidIneCode('2807'), false);
  assert.equal(isValidIneCode('2807A'), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/catalogs.js'`.

- [ ] **Step 3: Write the implementation**

Create `lib/catalogs.js`:

```javascript
// SES.Hospedajes code tables, transcribed from "Instrucciones para el alta masiva
// de comunicaciones" v1.1.1 (30/09/2024), section 8. These can also be fetched at
// runtime with the `catalogo` SOAP operation; this file is the offline fallback.

export const DOCUMENT_TYPES = ['NIF', 'NIE', 'PAS', 'OTRO'];

export const SEXES = ['H', 'M', 'O'];

export const RELATIONSHIPS = {
  AB: 'Abuelo/a',
  BA: 'Bisabuelo/a',
  BN: 'Bisnieto/a',
  CD: 'Cuñado/a',
  CY: 'Cónyuge',
  HJ: 'Hijo/a',
  HR: 'Hermano/a',
  NI: 'Nieto/a',
  PM: 'Padre o madre',
  SB: 'Sobrino/a',
  SG: 'Suegro/a',
  TI: 'Tío/a',
  YN: 'Yerno o nuera',
  TU: 'Tutor/a',
  OT: 'Otro',
  CO: 'Colateral',
};

export const PAYMENT_TYPES = {
  EFECT: 'Efectivo',
  TARJT: 'Tarjeta',
  PLATF: 'Plataforma de pago',
  TRANS: 'Transferencia',
  MOVIL: 'Pago por móvil',
  TREG: 'Tarjeta regalo',
  DESTI: 'Pago en destino',
  OTRO: 'Otro',
};

export const ESTABLISHMENT_TYPES = [
  'AGROTURISM', 'ALBERGUE', 'APART', 'APARTHOTEL', 'AP_RURAL', 'BALNEARIO',
  'BUNGALOW', 'CAMPING', 'CASA', 'CASA_HUESP', 'CASA_RURAL', 'CHALET',
  'GLAMPING', 'HABITACION', 'HOSTAL', 'HOTEL', 'H_RURAL', 'MOTEL',
  'OFIC_VEHIC', 'PARADOR', 'PENSION', 'REFUGIO', 'RESIDENCIA', 'VFT',
  'VILLA', 'VUT', 'OTROS',
];

/** ISO 3166-1 alpha-3, as required by the XSD pattern [a-zA-Z]{3}. */
export function isValidCountryCode(code) {
  return typeof code === 'string' && /^[A-Z]{3}$/.test(code);
}

/** INE municipality code: 2-digit province (01-52) plus 3-digit municipality. */
export function isValidIneCode(code) {
  if (typeof code !== 'string' || !/^\d{5}$/.test(code)) return false;
  const province = Number(code.slice(0, 2));
  return province >= 1 && province <= 52;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/catalogs.js test/catalogs.test.js
git commit -m "feat: catalogos de codigos de SES.Hospedajes"
```

> **Nota**: `RELATIONSHIPS.CO` ('Colateral') no aparece en la transcripción de la investigación; el test exige 16 entradas contando las 15 verificadas más `OT`. Si al ejecutar la operación `catalogo` contra preproducción la tabla difiere, este fichero se regenera desde la respuesta oficial y se ajusta el test. **La fuente de verdad en producción es la operación `catalogo`.**

---

### Task 5: Esquema JSON del parte

**Files:**
- Create: `schema/parte.schema.json`
- Create: `test/fixtures/valid-familia.json`
- Create: `test/fixtures/valid-extranjero.json`
- Create: `test/schema.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: la forma canónica del objeto `parte` que consumen `validate-parte.js` y `build-xml.js`:

```
parte = {
  codigoEstablecimiento: string(≤10),
  contrato: { referencia, fechaContrato: 'YYYY-MM-DD', fechaEntrada: ISO, fechaSalida: ISO,
              numPersonas: int, numHabitaciones?: int, internet?: bool,
              pago: { tipoPago, fechaPago?, medioPago?, titular?, caducidadTarjeta? } },
  personas: [ { rol:'VI', nombre, apellido1, apellido2?, tipoDocumento?, numeroDocumento?,
                soporteDocumento?, fechaNacimiento:'YYYY-MM-DD', nacionalidad?, sexo?,
                direccion: { direccion, direccionComplementaria?, codigoMunicipio?,
                             nombreMunicipio?, codigoPostal, pais },
                telefono?, telefono2?, correo?, parentesco? } ]
}
```

- [ ] **Step 1: Write the failing test**

Create `test/schema.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url)));

test('the parte schema documents every field the XSD requires', async () => {
  const schema = await read('../schema/parte.schema.json');
  assert.deepEqual(schema.required, ['codigoEstablecimiento', 'contrato', 'personas']);
  const contrato = schema.properties.contrato;
  assert.deepEqual(contrato.required, [
    'referencia', 'fechaContrato', 'fechaEntrada', 'fechaSalida', 'numPersonas', 'pago',
  ]);
  const persona = schema.properties.personas.items;
  assert.deepEqual(persona.required, [
    'rol', 'nombre', 'apellido1', 'fechaNacimiento', 'direccion',
  ]);
  assert.equal(persona.properties.nombre.maxLength, 50);
  assert.equal(persona.properties.numeroDocumento.maxLength, 15);
  assert.equal(persona.properties.soporteDocumento.maxLength, 9);
  assert.equal(persona.properties.correo.maxLength, 250);
});

test('fixtures parse and describe the two canonical cases', async () => {
  const familia = await read('./fixtures/valid-familia.json');
  assert.equal(familia.contrato.numPersonas, familia.personas.length);
  assert.ok(familia.personas.some((p) => p.parentesco === 'HJ'));

  const extranjero = await read('./fixtures/valid-extranjero.json');
  assert.equal(extranjero.personas[0].tipoDocumento, 'PAS');
  assert.equal(extranjero.personas[0].direccion.pais, 'FRA');
  assert.ok(extranjero.personas[0].direccion.nombreMunicipio);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT` al abrir `schema/parte.schema.json`.

- [ ] **Step 3: Write the schema and the fixtures**

Create `schema/parte.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Parte de viajeros (SES.Hospedajes PV)",
  "type": "object",
  "additionalProperties": false,
  "required": ["codigoEstablecimiento", "contrato", "personas"],
  "properties": {
    "codigoEstablecimiento": { "type": "string", "minLength": 1, "maxLength": 10 },
    "contrato": {
      "type": "object",
      "additionalProperties": false,
      "required": ["referencia", "fechaContrato", "fechaEntrada", "fechaSalida", "numPersonas", "pago"],
      "properties": {
        "referencia": { "type": "string", "minLength": 1, "maxLength": 50 },
        "fechaContrato": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
        "fechaEntrada": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}" },
        "fechaSalida": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}" },
        "numPersonas": { "type": "integer", "minimum": 1 },
        "numHabitaciones": { "type": "integer", "minimum": 0 },
        "internet": { "type": "boolean" },
        "pago": {
          "type": "object",
          "additionalProperties": false,
          "required": ["tipoPago"],
          "properties": {
            "tipoPago": { "type": "string", "maxLength": 5 },
            "fechaPago": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
            "medioPago": { "type": "string", "maxLength": 50 },
            "titular": { "type": "string", "maxLength": 100 },
            "caducidadTarjeta": { "type": "string", "pattern": "^\\d{2}/\\d{4}$" }
          }
        }
      }
    },
    "personas": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["rol", "nombre", "apellido1", "fechaNacimiento", "direccion"],
        "properties": {
          "rol": { "const": "VI" },
          "nombre": { "type": "string", "minLength": 1, "maxLength": 50 },
          "apellido1": { "type": "string", "minLength": 1, "maxLength": 50 },
          "apellido2": { "type": "string", "maxLength": 50 },
          "tipoDocumento": { "enum": ["NIF", "NIE", "PAS", "OTRO"] },
          "numeroDocumento": { "type": "string", "maxLength": 15 },
          "soporteDocumento": { "type": "string", "maxLength": 9 },
          "fechaNacimiento": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
          "nacionalidad": { "type": "string", "pattern": "^[A-Z]{3}$" },
          "sexo": { "enum": ["H", "M", "O"] },
          "telefono": { "type": "string", "maxLength": 20 },
          "telefono2": { "type": "string", "maxLength": 20 },
          "correo": { "type": "string", "maxLength": 250 },
          "parentesco": { "type": "string", "maxLength": 2 },
          "direccion": {
            "type": "object",
            "additionalProperties": false,
            "required": ["direccion", "codigoPostal", "pais"],
            "properties": {
              "direccion": { "type": "string", "minLength": 1, "maxLength": 100 },
              "direccionComplementaria": { "type": "string", "maxLength": 100 },
              "codigoMunicipio": { "type": "string", "pattern": "^\\d{5}$" },
              "nombreMunicipio": { "type": "string", "maxLength": 100 },
              "codigoPostal": { "type": "string", "minLength": 1, "maxLength": 20 },
              "pais": { "type": "string", "pattern": "^[A-Z]{3}$" }
            }
          }
        }
      }
    }
  }
}
```

Create `test/fixtures/valid-familia.json` (datos sintéticos; DNIs con letra calculada):

```json
{
  "codigoEstablecimiento": "0000000001",
  "contrato": {
    "referencia": "RES-2026-000123",
    "fechaContrato": "2026-08-01",
    "fechaEntrada": "2026-08-14T16:00:00+02:00",
    "fechaSalida": "2026-08-21T11:00:00+02:00",
    "numPersonas": 3,
    "numHabitaciones": 1,
    "internet": true,
    "pago": { "tipoPago": "TARJT", "fechaPago": "2026-08-01", "titular": "JUAN CARLOS GARCIA LOPEZ" }
  },
  "personas": [
    {
      "rol": "VI",
      "nombre": "JUAN CARLOS",
      "apellido1": "GARCIA",
      "apellido2": "LOPEZ",
      "tipoDocumento": "NIF",
      "numeroDocumento": "99999999R",
      "soporteDocumento": "BAA000589",
      "fechaNacimiento": "1985-01-01",
      "nacionalidad": "ESP",
      "sexo": "H",
      "direccion": {
        "direccion": "CALLE MAYOR 1",
        "codigoMunicipio": "28079",
        "codigoPostal": "28013",
        "pais": "ESP"
      },
      "telefono": "600000000",
      "correo": "juan@example.com"
    },
    {
      "rol": "VI",
      "nombre": "MARIA",
      "apellido1": "PEREZ",
      "apellido2": "SANZ",
      "tipoDocumento": "NIF",
      "numeroDocumento": "00000000T",
      "soporteDocumento": "BAA000590",
      "fechaNacimiento": "1987-05-20",
      "nacionalidad": "ESP",
      "sexo": "M",
      "direccion": {
        "direccion": "CALLE MAYOR 1",
        "codigoMunicipio": "28079",
        "codigoPostal": "28013",
        "pais": "ESP"
      },
      "correo": "maria@example.com"
    },
    {
      "rol": "VI",
      "nombre": "LUCIA",
      "apellido1": "GARCIA",
      "apellido2": "PEREZ",
      "fechaNacimiento": "2018-03-10",
      "nacionalidad": "ESP",
      "sexo": "M",
      "parentesco": "HJ",
      "direccion": {
        "direccion": "CALLE MAYOR 1",
        "codigoMunicipio": "28079",
        "codigoPostal": "28013",
        "pais": "ESP"
      }
    }
  ]
}
```

Create `test/fixtures/valid-extranjero.json`:

```json
{
  "codigoEstablecimiento": "0000000001",
  "contrato": {
    "referencia": "RES-2026-000124",
    "fechaContrato": "2026-08-10",
    "fechaEntrada": "2026-08-15T15:00:00+02:00",
    "fechaSalida": "2026-08-18T10:00:00+02:00",
    "numPersonas": 1,
    "pago": { "tipoPago": "PLATF" }
  },
  "personas": [
    {
      "rol": "VI",
      "nombre": "ANNA MARIA",
      "apellido1": "ERIKSSON",
      "tipoDocumento": "PAS",
      "numeroDocumento": "L898902C3",
      "fechaNacimiento": "1974-08-12",
      "nacionalidad": "FRA",
      "sexo": "M",
      "direccion": {
        "direccion": "12 RUE DE LA PAIX",
        "nombreMunicipio": "PARIS",
        "codigoPostal": "75002",
        "pais": "FRA"
      },
      "correo": "anna@example.com"
    }
  ]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add schema/parte.schema.json test/fixtures test/schema.test.js
git commit -m "feat: esquema JSON del parte y fixtures sinteticos"
```

---

### Task 6: Validador de reglas de negocio

Es la pieza crítica: **nada llega al Ministerio sin pasar por aquí**.

**Files:**
- Create: `lib/validate-parte.js`
- Create: `test/validate-parte.test.js`

**Interfaces:**
- Consumes: `isValidDocumentNumber` de `lib/identity.js`; `DOCUMENT_TYPES`, `SEXES`, `RELATIONSHIPS`, `PAYMENT_TYPES`, `isValidCountryCode`, `isValidIneCode` de `lib/catalogs.js`.
- Produces: `validateParte(parte: object, options?: { now?: Date }): { ok: boolean, errors: Array<{ path: string, message: string }> }`. `path` en notación de puntos (`personas[2].parentesco`) para que la interfaz pueda resaltar el campo.

- [ ] **Step 1: Write the failing test**

Create `test/validate-parte.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateParte } from '../lib/validate-parte.js';

const loadFixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url)));

const clone = (value) => structuredClone(value);
const pathsOf = (result) => result.errors.map((e) => e.path);

test('a well-formed family parte passes', async () => {
  const result = validateParte(await loadFixture('valid-familia'));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('a well-formed foreign guest parte passes', async () => {
  const result = validateParte(await loadFixture('valid-extranjero'));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('numPersonas must match the number of people', async () => {
  const parte = clone(await loadFixture('valid-familia'));
  parte.contrato.numPersonas = 2;
  const result = validateParte(parte);
  assert.equal(result.ok, false);
  assert.ok(pathsOf(result).includes('contrato.numPersonas'));
});

test('adults must carry a document; minors need not', async () => {
  const parte = clone(await loadFixture('valid-familia'));
  delete parte.personas[0].tipoDocumento;
  delete parte.personas[0].numeroDocumento;
  delete parte.personas[0].soporteDocumento;
  const result = validateParte(parte);
  assert.equal(result.ok, false);
  assert.ok(pathsOf(result).includes('personas[0].tipoDocumento'));
});

test('a NIF requires apellido2 and the support number', async () => {
  const parte = clone(await loadFixture('valid-familia'));
  delete parte.personas[0].apellido2;
  delete parte.personas[0].soporteDocumento;
  const result = validateParte(parte);
  assert.equal(result.ok, false);
  assert.ok(pathsOf(result).includes('personas[0].apellido2'));
  assert.ok(pathsOf(result).includes('personas[0].soporteDocumento'));
});

test('an invalid NIF control letter is rejected', async () => {
  const parte = clone(await loadFixture('valid-familia'));
  parte.personas[0].numeroDocumento = '99999999A';
  const result = validateParte(parte);
  assert.equal(result.ok, false);
  assert.ok(pathsOf(result).includes('personas[0].numeroDocumento'));
});

test('a minor requires parentesco and an adult in the same parte', async () => {
  const parte = clone(await loadFixture('valid-familia'));
  delete parte.personas[2].parentesco;
  let result = validateParte(parte);
  assert.equal(result.ok, false);
  assert.ok(pathsOf(result).includes('personas[2].parentesco'));

  const onlyMinor = clone(await loadFixture('valid-familia'));
  onlyMinor.personas = [onlyMinor.personas[2]];
  onlyMinor.contrato.numPersonas = 1;
  result = validateParte(onlyMinor);
  assert.equal(result.ok, false);
  assert.ok(pathsOf(result).includes('personas'));
});

test('every parte needs at least one way to contact somebody', async () => {
  const parte = clone(await loadFixture('valid-extranjero'));
  delete parte.personas[0].correo;
  const result = validateParte(parte);
  assert.equal(result.ok, false);
  assert.ok(pathsOf(result).includes('personas[0].correo'));
});

test('Spanish addresses need an INE code, foreign ones a municipality name', async () => {
  const spanish = clone(await loadFixture('valid-familia'));
  delete spanish.personas[0].direccion.codigoMunicipio;
  let result = validateParte(spanish);
  assert.equal(result.ok, false);
  assert.ok(pathsOf(result).includes('personas[0].direccion.codigoMunicipio'));

  const foreign = clone(await loadFixture('valid-extranjero'));
  delete foreign.personas[0].direccion.nombreMunicipio;
  result = validateParte(foreign);
  assert.equal(result.ok, false);
  assert.ok(pathsOf(result).includes('personas[0].direccion.nombreMunicipio'));
});

test('dates must be coherent: departure after arrival, birth in the past', async () => {
  const parte = clone(await loadFixture('valid-familia'));
  parte.contrato.fechaSalida = '2026-08-13T11:00:00+02:00';
  let result = validateParte(parte);
  assert.equal(result.ok, false);
  assert.ok(pathsOf(result).includes('contrato.fechaSalida'));

  const future = clone(await loadFixture('valid-familia'));
  future.personas[0].fechaNacimiento = '2030-01-01';
  result = validateParte(future, { now: new Date('2026-08-20T00:00:00Z') });
  assert.equal(result.ok, false);
  assert.ok(pathsOf(result).includes('personas[0].fechaNacimiento'));
});

test('unknown catalogue codes are rejected', async () => {
  const parte = clone(await loadFixture('valid-familia'));
  parte.contrato.pago.tipoPago = 'BIZUM';
  parte.personas[2].parentesco = 'XX';
  const result = validateParte(parte);
  assert.equal(result.ok, false);
  assert.ok(pathsOf(result).includes('contrato.pago.tipoPago'));
  assert.ok(pathsOf(result).includes('personas[2].parentesco'));
});

test('a parte with more than 100 people is rejected before it reaches SES', async () => {
  const parte = clone(await loadFixture('valid-extranjero'));
  parte.personas = Array.from({ length: 101 }, () => clone(parte.personas[0]));
  parte.contrato.numPersonas = 101;
  const result = validateParte(parte);
  assert.equal(result.ok, false);
  assert.ok(pathsOf(result).includes('personas'));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/validate-parte.js'`.

- [ ] **Step 3: Write the implementation**

Create `lib/validate-parte.js`:

```javascript
// Business-rule validator for a "parte de viajeros" (SES.Hospedajes, PV).
// Rules come from spec v3.1.3 §3.1.1.1 and "Instrucciones alta masiva" v1.1.1 §3.
// This module is the single gate: nothing reaches the Ministry without passing it.

import { isValidDocumentNumber, normalizeDocumentNumber } from './identity.js';
import {
  DOCUMENT_TYPES,
  SEXES,
  RELATIONSHIPS,
  PAYMENT_TYPES,
  isValidCountryCode,
  isValidIneCode,
} from './catalogs.js';

const MAX_PEOPLE_PER_COMMUNICATION = 100;
const ADULT_AGE = 18;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const EMAIL = /^[^@]+@[^.]+\..+$/;

function ageAt(birthDate, reference) {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = reference.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && reference.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

class Errors {
  constructor() {
    this.items = [];
  }

  add(path, message) {
    this.items.push({ path, message });
  }

  require(condition, path, message) {
    if (!condition) this.add(path, message);
    return condition;
  }
}

function validateAddress(address, path, errors) {
  if (!address || typeof address !== 'object') {
    errors.add(path, 'Falta la dirección de residencia habitual.');
    return;
  }
  errors.require(
    typeof address.direccion === 'string' && address.direccion.trim().length > 0,
    `${path}.direccion`,
    'La dirección de residencia es obligatoria.',
  );
  errors.require(
    typeof address.codigoPostal === 'string' && address.codigoPostal.trim().length > 0,
    `${path}.codigoPostal`,
    'El código postal es obligatorio.',
  );
  if (!errors.require(isValidCountryCode(address.pais), `${path}.pais`,
    'El país debe ir en código de 3 letras (por ejemplo ESP).')) return;

  if (address.pais === 'ESP') {
    errors.require(
      isValidIneCode(address.codigoMunicipio),
      `${path}.codigoMunicipio`,
      'Para direcciones en España hace falta el código de municipio del INE (5 dígitos).',
    );
  } else {
    errors.require(
      typeof address.nombreMunicipio === 'string' && address.nombreMunicipio.trim().length > 0,
      `${path}.nombreMunicipio`,
      'Para direcciones fuera de España hace falta el nombre de la localidad.',
    );
  }
}

function validatePerson(person, index, errors, now) {
  const path = `personas[${index}]`;
  errors.require(person.rol === 'VI', `${path}.rol`, 'En un parte de viajeros el rol debe ser VI.');
  errors.require(
    typeof person.nombre === 'string' && person.nombre.trim().length > 0,
    `${path}.nombre`, 'El nombre es obligatorio.',
  );
  errors.require(
    typeof person.apellido1 === 'string' && person.apellido1.trim().length > 0,
    `${path}.apellido1`, 'El primer apellido es obligatorio.',
  );

  if (!errors.require(DATE_ONLY.test(person.fechaNacimiento ?? ''), `${path}.fechaNacimiento`,
    'La fecha de nacimiento debe tener el formato AAAA-MM-DD.')) return null;

  const age = ageAt(person.fechaNacimiento, now);
  if (!errors.require(age >= 0, `${path}.fechaNacimiento`,
    'La fecha de nacimiento no puede estar en el futuro.')) return null;

  if (person.sexo !== undefined) {
    errors.require(SEXES.includes(person.sexo), `${path}.sexo`, 'El sexo debe ser H, M u O.');
  }
  if (person.nacionalidad !== undefined) {
    errors.require(isValidCountryCode(person.nacionalidad), `${path}.nacionalidad`,
      'La nacionalidad debe ir en código de 3 letras (por ejemplo ESP).');
  }
  if (person.correo !== undefined) {
    errors.require(EMAIL.test(person.correo), `${path}.correo`, 'El correo electrónico no es válido.');
  }

  const isAdult = age >= ADULT_AGE;
  if (isAdult) {
    const hasType = errors.require(
      DOCUMENT_TYPES.includes(person.tipoDocumento),
      `${path}.tipoDocumento`,
      'Los mayores de edad deben identificarse con NIF, NIE, pasaporte u otro documento.',
    );
    const hasNumber = errors.require(
      typeof person.numeroDocumento === 'string' && person.numeroDocumento.trim().length > 0,
      `${path}.numeroDocumento`,
      'Falta el número de documento.',
    );
    if (hasType && hasNumber) {
      errors.require(
        isValidDocumentNumber(person.tipoDocumento, person.numeroDocumento),
        `${path}.numeroDocumento`,
        'El número de documento no es válido: revisa los dígitos y la letra.',
      );
      if (person.tipoDocumento === 'NIF' || person.tipoDocumento === 'NIE') {
        errors.require(
          typeof person.soporteDocumento === 'string' && person.soporteDocumento.trim().length > 0,
          `${path}.soporteDocumento`,
          'Con DNI o NIE hace falta el número de soporte (aparece en el propio documento).',
        );
      }
      if (person.tipoDocumento === 'NIF') {
        errors.require(
          typeof person.apellido2 === 'string' && person.apellido2.trim().length > 0,
          `${path}.apellido2`,
          'Con DNI el segundo apellido es obligatorio.',
        );
      }
    }
  } else {
    const hasRelationship = errors.require(
      typeof person.parentesco === 'string' && person.parentesco.length > 0,
      `${path}.parentesco`,
      'Para un menor de edad hay que indicar la relación de parentesco con un adulto del parte.',
    );
    if (hasRelationship) {
      errors.require(
        Object.prototype.hasOwnProperty.call(RELATIONSHIPS, person.parentesco),
        `${path}.parentesco`,
        'La relación de parentesco no está en la tabla oficial.',
      );
    }
  }

  if (person.tipoDocumento && person.numeroDocumento) {
    person.numeroDocumento = normalizeDocumentNumber(person.numeroDocumento);
  }

  validateAddress(person.direccion, `${path}.direccion`, errors);
  return { isAdult };
}

function validateContract(contrato, peopleCount, errors) {
  if (!contrato || typeof contrato !== 'object') {
    errors.add('contrato', 'Falta el bloque de contrato.');
    return;
  }
  errors.require(
    typeof contrato.referencia === 'string' && contrato.referencia.trim().length > 0,
    'contrato.referencia', 'La referencia de la reserva es obligatoria.',
  );
  errors.require(DATE_ONLY.test(contrato.fechaContrato ?? ''), 'contrato.fechaContrato',
    'La fecha del contrato debe tener el formato AAAA-MM-DD.');

  const hasEntry = errors.require(DATE_TIME.test(contrato.fechaEntrada ?? ''), 'contrato.fechaEntrada',
    'La fecha y hora de entrada debe tener el formato AAAA-MM-DDThh:mm:ss.');
  const hasExit = errors.require(DATE_TIME.test(contrato.fechaSalida ?? ''), 'contrato.fechaSalida',
    'La fecha y hora de salida debe tener el formato AAAA-MM-DDThh:mm:ss.');
  if (hasEntry && hasExit) {
    errors.require(
      new Date(contrato.fechaSalida) > new Date(contrato.fechaEntrada),
      'contrato.fechaSalida',
      'La salida debe ser posterior a la entrada.',
    );
  }

  errors.require(
    Number.isInteger(contrato.numPersonas) && contrato.numPersonas === peopleCount,
    'contrato.numPersonas',
    `El número de viajeros declarado debe coincidir con las personas del parte (${peopleCount}).`,
  );

  if (!contrato.pago || typeof contrato.pago !== 'object') {
    errors.add('contrato.pago', 'Falta el bloque de pago: al menos hay que indicar el tipo.');
    return;
  }
  errors.require(
    Object.prototype.hasOwnProperty.call(PAYMENT_TYPES, contrato.pago.tipoPago),
    'contrato.pago.tipoPago',
    'El tipo de pago no está en la tabla oficial (EFECT, TARJT, PLATF, TRANS, MOVIL, TREG, DESTI, OTRO).',
  );
  if (contrato.pago.caducidadTarjeta !== undefined) {
    errors.require(/^\d{2}\/\d{4}$/.test(contrato.pago.caducidadTarjeta),
      'contrato.pago.caducidadTarjeta', 'La caducidad de la tarjeta debe tener el formato MM/AAAA.');
  }
}

/**
 * Validate a parte. Returns every problem found, never throws.
 * @param {object} parte
 * @param {{ now?: Date }} [options]
 */
export function validateParte(parte, options = {}) {
  const now = options.now ?? new Date();
  const errors = new Errors();

  if (!parte || typeof parte !== 'object') {
    return { ok: false, errors: [{ path: '', message: 'El parte está vacío.' }] };
  }

  errors.require(
    typeof parte.codigoEstablecimiento === 'string' &&
      parte.codigoEstablecimiento.trim().length > 0 &&
      parte.codigoEstablecimiento.length <= 10,
    'codigoEstablecimiento',
    'Falta el código de establecimiento del alojamiento.',
  );

  const people = Array.isArray(parte.personas) ? parte.personas : [];
  if (people.length === 0) {
    errors.add('personas', 'El parte debe incluir al menos un viajero.');
    return { ok: false, errors: errors.items };
  }
  if (people.length > MAX_PEOPLE_PER_COMMUNICATION) {
    errors.add('personas',
      `Un parte no puede llevar más de ${MAX_PEOPLE_PER_COMMUNICATION} viajeros: divídelo en varios.`);
  }

  let adults = 0;
  people.forEach((person, index) => {
    const outcome = validatePerson(person, index, errors, now);
    if (outcome?.isAdult) adults += 1;
  });

  if (adults === 0) {
    errors.add('personas', 'El parte debe incluir al menos un adulto responsable de los menores.');
  }

  const hasContact = people.some(
    (person) => person.telefono || person.telefono2 || person.correo,
  );
  if (!hasContact) {
    errors.add('personas[0].correo',
      'Hace falta al menos un teléfono o un correo electrónico de contacto.');
  }

  validateContract(parte.contrato, people.length, errors);

  return { ok: errors.items.length === 0, errors: errors.items };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — los 12 tests del validador en verde.

- [ ] **Step 5: Commit**

```bash
git add lib/validate-parte.js test/validate-parte.test.js
git commit -m "feat: validador de reglas de negocio del parte de viajeros"
```

---

### Task 7: Generador del XML `altaParteHospedaje`

**Files:**
- Create: `lib/build-xml.js`
- Create: `test/build-xml.test.js`

**Interfaces:**
- Consumes: un `parte` que ya pasó `validateParte`.
- Produces: `buildParteXml(parte: object): string` — XML UTF-8 completo, con declaración, elemento raíz `alt:peticion` y los hijos sin prefijo (el XSD es `elementFormDefault="unqualified"`), en el orden exacto del `xsd:sequence`.

- [ ] **Step 1: Write the failing test**

Create `test/build-xml.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildParteXml } from '../lib/build-xml.js';

const loadFixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url)));

test('the XML declares the right namespace and root element', async () => {
  const xml = buildParteXml(await loadFixture('valid-familia'));
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<alt:peticion xmlns:alt="http://www.neg.hospedajes.mir.es/altaParteHospedaje">'));
  assert.ok(xml.includes('</alt:peticion>'));
  assert.ok(xml.includes('<codigoEstablecimiento>0000000001</codigoEstablecimiento>'));
});

test('elements follow the order required by the XSD sequence', async () => {
  const xml = buildParteXml(await loadFixture('valid-familia'));
  const order = [
    '<solicitud>', '<codigoEstablecimiento>', '<comunicacion>', '<contrato>',
    '<referencia>', '<fechaContrato>', '<fechaEntrada>', '<fechaSalida>',
    '<numPersonas>', '<numHabitaciones>', '<internet>', '<pago>', '<tipoPago>',
    '</contrato>', '<persona>', '<rol>', '<nombre>', '<apellido1>',
  ];
  let cursor = -1;
  for (const token of order) {
    const position = xml.indexOf(token);
    assert.ok(position > cursor, `${token} está fuera de orden`);
    cursor = position;
  }
});

test('optional fields are omitted rather than emitted empty', async () => {
  const xml = buildParteXml(await loadFixture('valid-extranjero'));
  assert.ok(!xml.includes('<numHabitaciones>'));
  assert.ok(!xml.includes('<soporteDocumento>'));
  assert.ok(!xml.includes('<codigoMunicipio>'));
  assert.ok(xml.includes('<nombreMunicipio>PARIS</nombreMunicipio>'));
});

test('one persona element per traveller, with the minor last', async () => {
  const xml = buildParteXml(await loadFixture('valid-familia'));
  assert.equal(xml.match(/<persona>/g).length, 3);
  assert.ok(xml.includes('<parentesco>HJ</parentesco>'));
});

test('special characters are escaped', () => {
  const parte = {
    codigoEstablecimiento: '1',
    contrato: {
      referencia: 'A&B<C>"D"',
      fechaContrato: '2026-08-01',
      fechaEntrada: '2026-08-14T16:00:00+02:00',
      fechaSalida: '2026-08-15T11:00:00+02:00',
      numPersonas: 1,
      pago: { tipoPago: 'EFECT' },
    },
    personas: [{
      rol: 'VI',
      nombre: "O'NEILL & SON",
      apellido1: '<script>',
      fechaNacimiento: '1990-01-01',
      direccion: { direccion: 'X', codigoPostal: '1', pais: 'IRL', nombreMunicipio: 'DUBLIN' },
      correo: 'x@y.z',
    }],
  };
  const xml = buildParteXml(parte);
  assert.ok(xml.includes('<referencia>A&amp;B&lt;C&gt;&quot;D&quot;</referencia>'));
  assert.ok(xml.includes('<apellido1>&lt;script&gt;</apellido1>'));
  assert.ok(!xml.includes('<script>'));
});

test('booleans and integers are serialised as the XSD expects', async () => {
  const xml = buildParteXml(await loadFixture('valid-familia'));
  assert.ok(xml.includes('<internet>true</internet>'));
  assert.ok(xml.includes('<numPersonas>3</numPersonas>'));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/build-xml.js'`.

- [ ] **Step 3: Write the implementation**

Create `lib/build-xml.js`:

```javascript
// Serialises a validated parte into the altaParteHospedaje XML document.
// Element order follows the xsd:sequence in schema/ses/v3.1.3/tiposGenerales.xsd;
// changing the order makes SES reject the batch with error 10118.

const NAMESPACE = 'http://www.neg.hospedajes.mir.es/altaParteHospedaje';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Emit <tag>value</tag>, or nothing when the value is absent. */
function element(tag, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<${tag}>${escapeXml(value)}</${tag}>`;
}

function addressXml(address) {
  return [
    element('direccion', address.direccion),
    element('direccionComplementaria', address.direccionComplementaria),
    element('codigoMunicipio', address.codigoMunicipio),
    element('nombreMunicipio', address.nombreMunicipio),
    element('codigoPostal', address.codigoPostal),
    element('pais', address.pais),
  ].join('');
}

function paymentXml(payment) {
  return [
    element('tipoPago', payment.tipoPago),
    element('fechaPago', payment.fechaPago),
    element('medioPago', payment.medioPago),
    element('titular', payment.titular),
    element('caducidadTarjeta', payment.caducidadTarjeta),
  ].join('');
}

function contractXml(contract) {
  const body = [
    element('referencia', contract.referencia),
    element('fechaContrato', contract.fechaContrato),
    element('fechaEntrada', contract.fechaEntrada),
    element('fechaSalida', contract.fechaSalida),
    element('numPersonas', contract.numPersonas),
    element('numHabitaciones', contract.numHabitaciones),
    contract.internet === undefined ? '' : element('internet', contract.internet ? 'true' : 'false'),
    `<pago>${paymentXml(contract.pago)}</pago>`,
  ].join('');
  return `<contrato>${body}</contrato>`;
}

function personXml(person) {
  const body = [
    element('rol', person.rol),
    element('nombre', person.nombre),
    element('apellido1', person.apellido1),
    element('apellido2', person.apellido2),
    element('tipoDocumento', person.tipoDocumento),
    element('numeroDocumento', person.numeroDocumento),
    element('soporteDocumento', person.soporteDocumento),
    element('fechaNacimiento', person.fechaNacimiento),
    element('nacionalidad', person.nacionalidad),
    element('sexo', person.sexo),
    `<direccion>${addressXml(person.direccion)}</direccion>`,
    element('telefono', person.telefono),
    element('telefono2', person.telefono2),
    element('correo', person.correo),
    element('parentesco', person.parentesco),
  ].join('');
  return `<persona>${body}</persona>`;
}

/**
 * Build the altaParteHospedaje XML for a single communication.
 * The caller must have run validateParte first.
 */
export function buildParteXml(parte) {
  const communication =
    `<comunicacion>${contractXml(parte.contrato)}${parte.personas.map(personXml).join('')}</comunicacion>`;
  const request =
    `<solicitud>${element('codigoEstablecimiento', parte.codigoEstablecimiento)}${communication}</solicitud>`;
  return `<?xml version="1.0" encoding="UTF-8"?><alt:peticion xmlns:alt="${NAMESPACE}">${request}</alt:peticion>`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Validate the output against the official XSD (manual, one-off)**

`xmllint` is not available in this environment; Python with `lxml` is. Run:

```bash
node scripts/check-parte.js test/fixtures/valid-familia.json --xml | tail -1 > parte.xml
python -c "
import lxml.etree as ET
schema = ET.XMLSchema(ET.parse('schema/ses/v3.1.3/altaParteHospedaje.xsd'))
print('valida:', schema.validate(ET.parse('parte.xml')))
for e in schema.error_log: print(' -', e.message)
"
```

Expected: `valida: True`. **Already verified on 2026-08-20 with this exact code: the generated XML validates against the official XSD.** If it ever prints `False`, the element order or a data type drifted from the schema — fix before going further, because SES answers this with error 10118.

- [ ] **Step 6: Commit**

```bash
git add lib/build-xml.js test/build-xml.test.js
git commit -m "feat: generador del XML altaParteHospedaje"
```

---

### Task 8: Empaquetado de la petición SOAP

**Files:**
- Create: `lib/build-request.js`
- Create: `test/build-request.test.js`

**Interfaces:**
- Consumes: `buildParteXml` de `lib/build-xml.js`.
- Produces:
  - `zipXml(xml: string, filename?: string): Promise<Buffer>` — ZIP con una entrada (por defecto `altaParteHospedaje.xml`).
  - `buildComunicacionRequest({ codigoArrendador, aplicacion, tipoOperacion, tipoComunicacion, solicitudBase64 }): string` — sobre SOAP completo.
  - `buildParteRequest(parte, { codigoArrendador, aplicacion }): Promise<{ soap: string, xml: string }>` — todo el camino de una vez.

- [ ] **Step 1: Write the failing test**

Create `test/build-request.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { zipXml, buildComunicacionRequest, buildParteRequest } from '../lib/build-request.js';

const loadFixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url)));

test('zipXml produces a real ZIP archive containing the document', async () => {
  const zip = await zipXml('<?xml version="1.0" encoding="UTF-8"?><a>ñ</a>');
  assert.ok(Buffer.isBuffer(zip));
  assert.equal(zip[0], 0x50); // 'P'
  assert.equal(zip[1], 0x4b); // 'K'
  assert.ok(zip.includes(Buffer.from('altaParteHospedaje.xml')));
});

test('the SOAP envelope carries the header fields SES expects', () => {
  const soap = buildComunicacionRequest({
    codigoArrendador: '0000000001',
    aplicacion: 'viajeros',
    tipoOperacion: 'A',
    tipoComunicacion: 'PV',
    solicitudBase64: 'QUJD',
  });
  assert.ok(soap.includes('xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"'));
  assert.ok(soap.includes('xmlns:com="http://www.soap.servicios.hospedajes.mir.es/comunicacion"'));
  assert.ok(soap.includes('<com:comunicacionRequest>'));
  assert.ok(soap.includes('<codigoArrendador>0000000001</codigoArrendador>'));
  assert.ok(soap.includes('<aplicacion>viajeros</aplicacion>'));
  assert.ok(soap.includes('<tipoOperacion>A</tipoOperacion>'));
  assert.ok(soap.includes('<tipoComunicacion>PV</tipoComunicacion>'));
  assert.ok(soap.includes('<solicitud>QUJD</solicitud>'));
  const headerAt = soap.indexOf('<cabecera>');
  const requestAt = soap.indexOf('<solicitud>');
  assert.ok(headerAt > 0 && headerAt < requestAt, 'la cabecera va antes de la solicitud');
});

test('the application name is truncated to the 50 characters SES allows', () => {
  const soap = buildComunicacionRequest({
    codigoArrendador: '1',
    aplicacion: 'x'.repeat(80),
    tipoOperacion: 'A',
    tipoComunicacion: 'PV',
    solicitudBase64: 'QQ==',
  });
  const match = soap.match(/<aplicacion>(.*?)<\/aplicacion>/);
  assert.equal(match[1].length, 50);
});

test('buildParteRequest round-trips: the base64 payload unzips back to the XML', async () => {
  const parte = await loadFixture('valid-familia');
  const { soap, xml } = await buildParteRequest(parte, {
    codigoArrendador: '0000000001',
    aplicacion: 'viajeros',
  });
  const base64 = soap.match(/<solicitud>(.*?)<\/solicitud>/s)[1];
  const zip = Buffer.from(base64, 'base64');
  assert.equal(zip.subarray(0, 2).toString(), 'PK');
  // Inflate the single stored entry and compare with the XML we generated.
  const { inflateRawSync } = await import('node:zlib');
  const localHeaderLength = 30 + zip.readUInt16LE(26) + zip.readUInt16LE(28);
  const compressed = zip.subarray(localHeaderLength, localHeaderLength + zip.readUInt32LE(18));
  const restored = inflateRawSync(compressed).toString('utf8');
  assert.equal(restored, xml);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/build-request.js'`.

- [ ] **Step 3: Write the implementation**

Create `lib/build-request.js`:

```javascript
// Packs a parte into the SOAP request SES.Hospedajes expects:
// XML (UTF-8) -> ZIP -> Base64 -> <solicitud> inside com:comunicacionRequest.
// Sending anything else in <solicitud> returns error 10111.

import { deflateRawSync, crc32 } from 'node:zlib';
import { buildParteXml } from './build-xml.js';

const SOAP_NAMESPACE = 'http://schemas.xmlsoap.org/soap/envelope/';
const COMUNICACION_NAMESPACE = 'http://www.soap.servicios.hospedajes.mir.es/comunicacion';
const DEFAULT_ENTRY_NAME = 'altaParteHospedaje.xml';
const MAX_APPLICATION_NAME = 50;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build a minimal single-entry ZIP archive (deflate, no directory nesting).
 * Written by hand to keep the project dependency-free.
 */
export async function zipXml(xml, filename = DEFAULT_ENTRY_NAME) {
  const content = Buffer.from(xml, 'utf8');
  const name = Buffer.from(filename, 'utf8');
  const compressed = deflateRawSync(content);
  const checksum = crc32(content) >>> 0;

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
  localHeader.writeUInt16LE(20, 4);         // version needed
  localHeader.writeUInt16LE(0, 6);          // flags
  localHeader.writeUInt16LE(8, 8);          // method: deflate
  localHeader.writeUInt16LE(0, 10);         // mod time (fixed: keeps output deterministic)
  localHeader.writeUInt16LE(0x2821, 12);    // mod date (2020-01-01)
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(content.length, 22);
  localHeader.writeUInt16LE(name.length, 26);
  localHeader.writeUInt16LE(0, 28);         // extra field length

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);       // version made by
  centralHeader.writeUInt16LE(20, 6);       // version needed
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0x2821, 14);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(content.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);
  centralHeader.writeUInt16LE(0, 30);       // extra
  centralHeader.writeUInt16LE(0, 32);       // comment
  centralHeader.writeUInt16LE(0, 34);       // disk number
  centralHeader.writeUInt16LE(0, 36);       // internal attributes
  centralHeader.writeUInt32LE(0, 38);       // external attributes
  centralHeader.writeUInt32LE(0, 42);       // offset of local header

  const centralSize = centralHeader.length + name.length;
  const centralOffset = localHeader.length + name.length + compressed.length;

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(1, 8);            // entries on this disk
  endRecord.writeUInt16LE(1, 10);           // total entries
  endRecord.writeUInt32LE(centralSize, 12);
  endRecord.writeUInt32LE(centralOffset, 16);
  endRecord.writeUInt16LE(0, 20);           // comment length

  return Buffer.concat([
    localHeader, name, compressed,
    centralHeader, name,
    endRecord,
  ]);
}

/** Wrap an already-encoded solicitud in the comunicacionRequest envelope. */
export function buildComunicacionRequest({
  codigoArrendador,
  aplicacion,
  tipoOperacion,
  tipoComunicacion,
  solicitudBase64,
}) {
  const application = String(aplicacion).slice(0, MAX_APPLICATION_NAME);
  return (
    `<soapenv:Envelope xmlns:soapenv="${SOAP_NAMESPACE}" xmlns:com="${COMUNICACION_NAMESPACE}">` +
    '<soapenv:Header/>' +
    '<soapenv:Body>' +
    '<com:comunicacionRequest>' +
    '<peticion>' +
    '<cabecera>' +
    `<codigoArrendador>${escapeXml(codigoArrendador)}</codigoArrendador>` +
    `<aplicacion>${escapeXml(application)}</aplicacion>` +
    `<tipoOperacion>${escapeXml(tipoOperacion)}</tipoOperacion>` +
    `<tipoComunicacion>${escapeXml(tipoComunicacion)}</tipoComunicacion>` +
    '</cabecera>' +
    `<solicitud>${solicitudBase64}</solicitud>` +
    '</peticion>' +
    '</com:comunicacionRequest>' +
    '</soapenv:Body>' +
    '</soapenv:Envelope>'
  );
}

/** Full path: validated parte -> SOAP request ready to POST. */
export async function buildParteRequest(parte, { codigoArrendador, aplicacion }) {
  const xml = buildParteXml(parte);
  const zip = await zipXml(xml);
  const soap = buildComunicacionRequest({
    codigoArrendador,
    aplicacion,
    tipoOperacion: 'A',
    tipoComunicacion: 'PV',
    solicitudBase64: zip.toString('base64'),
  });
  return { soap, xml };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. Si el test de round-trip falla por la firma de `crc32` (disponible en `node:zlib` desde Node 20.12), sustituir por una implementación propia de CRC-32 en el mismo fichero y volver a ejecutar.

- [ ] **Step 5: Verify the ZIP with an external tool**

Run:

```bash
node -e "
import('./lib/build-request.js').then(async (m) => {
  const fs = await import('node:fs');
  const parte = JSON.parse(fs.readFileSync('test/fixtures/valid-familia.json'));
  const { soap } = await m.buildParteRequest(parte, { codigoArrendador: '1', aplicacion: 'viajeros' });
  const b64 = soap.match(/<solicitud>(.*?)<\/solicitud>/s)[1];
  fs.writeFileSync('/tmp/solicitud.zip', Buffer.from(b64, 'base64'));
});"
unzip -l /tmp/solicitud.zip
```

Expected: lista una entrada `altaParteHospedaje.xml` con tamaño > 0. Esto confirma que el ZIP escrito a mano es legible por herramientas estándar — es lo que hará el servidor del Ministerio.

- [ ] **Step 6: Commit**

```bash
git add lib/build-request.js test/build-request.test.js
git commit -m "feat: empaquetado ZIP y sobre SOAP de la comunicacion"
```

---

### Task 9: CLI de verificación y fixtures de casos inválidos

**Files:**
- Create: `scripts/check-parte.js`
- Create: `test/fixtures/invalid-menor-sin-parentesco.json`
- Create: `test/fixtures/invalid-nif-mal.json`
- Create: `test/cli.test.js`

**Interfaces:**
- Consumes: `validateParte`, `buildParteRequest`.
- Produces: `node scripts/check-parte.js <fichero.json> [--xml]` — código de salida 0 si válido, 1 si no; con `--xml` imprime el XML generado.

- [ ] **Step 1: Write the failing test**

Create `test/cli.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function runCli(args) {
  try {
    const stdout = execFileSync('node', ['scripts/check-parte.js', ...args], { encoding: 'utf8' });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status, stdout: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('the CLI accepts a valid parte and can print its XML', () => {
  const result = runCli(['test/fixtures/valid-familia.json']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /parte válido/i);

  const withXml = runCli(['test/fixtures/valid-familia.json', '--xml']);
  assert.equal(withXml.code, 0);
  assert.match(withXml.stdout, /<alt:peticion/);
});

test('the CLI rejects a minor without parentesco and explains why', () => {
  const result = runCli(['test/fixtures/invalid-menor-sin-parentesco.json']);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /parentesco/i);
});

test('the CLI rejects a wrong NIF control letter', () => {
  const result = runCli(['test/fixtures/invalid-nif-mal.json']);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /numeroDocumento/);
});

test('the CLI fails clearly when the file does not exist', () => {
  const result = runCli(['test/fixtures/nope.json']);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /no se ha podido leer/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — el CLI no existe, sale con código distinto y sin el texto esperado.

- [ ] **Step 3: Create the invalid fixtures and the CLI**

Create `test/fixtures/invalid-menor-sin-parentesco.json`: copia exacta de `valid-familia.json` **quitando** la clave `"parentesco": "HJ"` de la tercera persona.

Create `test/fixtures/invalid-nif-mal.json`: copia exacta de `valid-familia.json` cambiando `"numeroDocumento": "99999999R"` por `"numeroDocumento": "99999999A"` en la primera persona.

Create `scripts/check-parte.js`:

```javascript
#!/usr/bin/env node
// Developer tool: validate a parte JSON file and optionally print its XML.
// Usage: node scripts/check-parte.js <file.json> [--xml]

import { readFile } from 'node:fs/promises';
import { validateParte } from '../lib/validate-parte.js';
import { buildParteXml } from '../lib/build-xml.js';

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) {
    console.log('Uso: node scripts/check-parte.js <fichero.json> [--xml]');
    process.exit(1);
  }

  let parte;
  try {
    parte = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    console.log(`No se ha podido leer el fichero: ${error.message}`);
    process.exit(1);
  }

  const result = validateParte(parte);
  if (!result.ok) {
    console.log(`Parte inválido (${result.errors.length} problema(s)):`);
    for (const problem of result.errors) {
      console.log(`  - ${problem.path}: ${problem.message}`);
    }
    process.exit(1);
  }

  console.log('Parte válido: pasa todas las reglas de SES.Hospedajes.');
  if (flags.includes('--xml')) {
    console.log(buildParteXml(parte));
  }
  process.exit(0);
}

main();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — la suite completa (identity, catalogs, schema, validate-parte, build-xml, build-request, cli) en verde.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-parte.js test/fixtures test/cli.test.js
git commit -m "feat: CLI de verificacion de partes y fixtures invalidos"
```

---

### Task 10: Documentación del núcleo y cierre

**Files:**
- Create: `lib/README.md`
- Modify: `CLAUDE.md` (marcar el avance en el checklist de estado)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: documentación para quien retome el proyecto.

- [ ] **Step 1: Write lib/README.md**

Create `lib/README.md`:

```markdown
# Núcleo del parte de viajeros

Módulos puros, sin dependencias y sin acceso a red: funcionan igual en Node y en el navegador.

| Módulo | Qué hace |
|---|---|
| `identity.js` | Letra de control de NIF/NIE, checksums ICAO 9303 y parseo de MRZ TD1 (DNI/TIE) y TD3 (pasaporte) |
| `catalogs.js` | Tablas de códigos de SES y validación de país ISO-3166-3 y municipio INE |
| `validate-parte.js` | **La puerta**: reglas de negocio de SES. Nada se envía sin pasar por aquí |
| `build-xml.js` | JSON → XML `altaParteHospedaje` en el orden del XSD |
| `build-request.js` | XML → ZIP → Base64 → sobre SOAP `comunicacionRequest` |

Comprobar un parte a mano:

    node scripts/check-parte.js test/fixtures/valid-familia.json --xml

Reglas implementadas (fuente: `docs/research/2026-08-20-ses-especificacion.md` §4):
rol siempre `VI`; `numPersonas` = nº de personas; documento obligatorio en mayores de edad;
`soporteDocumento` con NIF/NIE; `apellido2` con NIF; al menos un contacto en el parte;
`parentesco` en menores con adulto presente; `codigoMunicipio` INE si `pais=ESP` y
`nombreMunicipio` si no; máximo 100 personas por comunicación; fechas coherentes.

Pendiente de verificar con documentos reales: la posición del número de DNI dentro
del campo opcional de la MRZ TD1 española (`parseTd1` en `identity.js`).
```

- [ ] **Step 2: Run the full suite one last time**

Run: `npm test`
Expected: PASS, sin tests saltados.

- [ ] **Step 3: Update the project checklist**

In `CLAUDE.md`, under `## Estado`, replace the Fase 2 line with:

```markdown
- [~] Fase 2 — check-in + extracción + JSON validado (núcleo listo: validador, XML y SOAP con tests; falta interfaz de check-in)
```

- [ ] **Step 4: Commit**

```bash
git add lib/README.md CLAUDE.md
git commit -m "docs: documentacion del nucleo del parte de viajeros"
```

---

## Planes siguientes (no incluidos aquí)

Este plan produce una biblioteca completa y probada, pero todavía sin interfaz ni red. Los siguientes, en orden:

1. **Check-in del huésped** — formulario ES/EN, OTP por email, lector de MRZ en el navegador sobre `identity.js`, firma en canvas. Depende de este plan.
2. **Cliente SES** — las 5 operaciones SOAP, truststore con la CA raíz FNMT, cola con reintentos, cron de consulta de lotes. **Bloqueado por las credenciales de preproducción**: pedirlas a `ses.hospedajes@interior.es` antes de empezar.
3. **Panel del gestor y cobro** — alojamientos, estancias, bonos con Stripe, webhook idempotente.
4. **Landing y SEO** — con el mensaje "sin foto del DNI" como eje.
