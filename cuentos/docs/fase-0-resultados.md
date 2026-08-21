# Fase 0 — resultados de los spikes

Fecha de inicio: 2026-08-20. Este documento se rellena a medida que cada spike da su número.
Reglas de decisión y contexto: [`superpowers/plans/2026-08-20-cuentos-fase-0-1.md`](superpowers/plans/2026-08-20-cuentos-fase-0-1.md).

## Estado

| Spike | Estado | Bloqueado por |
|---|---|---|
| 0.2 Consistencia de imagen — MiniMax `image-01` (baseline) | ✅ medido, **descartado** | — |
| 0.2 Consistencia de imagen — Seedream 4.5 | ⏭ innecesario: Nano Banana 2 ya cumple y va por la misma clave | — |
| 0.2 Consistencia de imagen — **Nano Banana 2 vía OpenRouter** | ✅ medido, **elegido** | — |
| 0.3 POD (Gelato/Peecho) | ⏸ pendiente | cuenta y `GELATO_API_KEY` |
| 0.4 Modelo de texto — MiniMax M3 (baseline) | ✅ medido | — |
| 0.4 Modelo de texto — Flash-Lite / DeepSeek / GPT-5 mini / M3 | ✅ medido (5 casos × 4 modelos) | — |
| Solicitud de Stripe Managed Payments | ⏸ la gestiona Edu más adelante; mientras, cobro por Etsy | Edu |

## 0.2 — Imagen, baseline con MiniMax `image-01`

Comando: `node scripts/spike-images.js --provider minimax --scenes 12`

Medición completa: 3 personajes × (1 hoja + 12 escenas) = **39 imágenes**, 0,138 $, 34 minutos.

| Métrica | Resultado | Umbral | Veredicto |
|---|---|---|---|
| Resolución máxima | **1024×1024** (130 dpi en 20 cm) | ≥ 1.900 px (250 dpi) | ❌ **descartado para imprenta** |
| Bloqueos del filtro con personaje infantil | **0 de 39** | 0 | ✅ |
| Fallos técnicos | **0 de 39** | — | ✅ |
| Latencia | 40-65 s por imagen | — | ❌ 12 páginas = 9-13 min en serie |
| Coste | 0,0035 $/imagen · 0,046 $ por personaje | — | ✅ |
| Consistencia del personaje | **buena**: pelo, gafas, ropa y color se mantienen | ≥ 80 % | ✅ |
| **Consistencia de estilo** | **colapsa** | constante | ❌ **eliminatorio** |
| Marca de agua | firma visible en varias imágenes pese a pedir «no watermark» | ninguna | ❌ |

Muestras de la deriva de estilo, todas con el mismo sufijo de acuarela: hoja de personaje en acuarela impecable → `ana/p01` acuarela → `ana/p02` vectorial saturado → `sofi/p06` **muñeca 3D hiperrenderizada** → `leo/p09` pintura digital. Revisable en `out/spike/index.html`.

**Conclusiones**

1. `image-01` queda **descartado para las páginas del libro** por resolución: 1024 px no llega ni a 130 dpi en 20 cm. Sigue siendo válido para ilustración de catálogo (respaldo) y para la galería de colorear en pantalla.
2. **Buena noticia para el riesgo nº 1 del proyecto**: cero rechazos del filtro de contenido generando escenas con niños ilustrados. El miedo a los falsos positivos no se confirma en este proveedor; hay que repetir la medición con Seedream y Gemini, que son más estrictos.
3. El **sufijo de estilo funciona**: la hoja de personaje salió exactamente en el registro de acuarela infantil que buscábamos.
4. **La deriva de estilo entre páginas es un problema tan grave como la deriva del personaje** y no estaba en el diseño. Un libro donde la página 1 es acuarela y la 2 parece vectorial no se puede vender. → El verificador VLM debe comprobar **dos** cosas: mismo personaje **y** mismo estilo (el campo `style_matches` ya estaba previsto en el spec; ahora sabemos que es obligatorio, no opcional).
5. **La cuadrícula 2×2 no se respeta**: `image-01` compuso una figura grande a la izquierda ocupando dos filas y dos perfiles a la derecha, así que recortar en cuartos produce referencias inservibles (medio vestido, medio fondo). → O se valida la maqueta de la hoja antes de recortar, o se pasa la hoja **entera** como una sola referencia. Con proveedores multi-referencia lo segundo es más simple y probablemente mejor.
6. **La imagen de referencia se come al sufijo de estilo.** Es el hallazgo con más consecuencias: la hoja de personaje salió en acuarela perfecta, pero al usarla como `subject_reference` el modelo conserva al personaje y **descarta el estilo**, aunque el sufijo siga en el prompt. No es un problema de este proveedor solamente: es la tensión de fondo entre consistencia de personaje y consistencia de estilo, y hay que medirla explícitamente en Seedream y Nano Banana antes de elegir. Si a un proveedor le pasa lo mismo, la salida es **fijar el estilo por referencia también** (pasar una imagen de estilo además de la del personaje: Nano Banana Pro admite hasta 3 referencias de estilo).
7. **Latencia**: 40-65 s por imagen es inviable. Doce páginas en serie son 9-13 minutos solo de ilustración. El diseño ya prevé generar en paralelo con concurrencia 4; con Seedream (2-5 s medidos por el proveedor) dejaría de ser un problema, pero hay que confirmarlo.

## 0.2b — Imagen, Nano Banana 2 vía OpenRouter (2026-08-21)

Comando: `node scripts/spike-images.js --provider or-nb2 --character ana --scenes 12` (modelo `google/gemini-3.1-flash-image` a través de OpenRouter, con la hoja de personaje entera como referencia).

| Métrica | Resultado | Umbral | Veredicto |
|---|---|---|---|
| Páginas generadas | **12 de 12**, 0 fallos | — | ✅ |
| Bloqueos del filtro (Google, el más estricto) | **0 de 13** | 0 | ✅ |
| Latencia | **14 s por imagen** (vs 40-65 de MiniMax) | — | ✅ 12 páginas en paralelo ≈ 1 min |
| Coste | **0,069 $/imagen**, 0,90 $ el personaje completo | — | ✅ dentro del techo |
| Consistencia del personaje | **la misma niña en las 12**: pelo, gafas de carey, pecas, vestido mostaza con cuello bebé, zapatos rojos | ≥ 80 % | ✅ ~100 % a ojo |
| **Consistencia de estilo** | **se mantiene**: acuarela suave con línea de tinta en playa, bosque nocturno, biblioteca, nave espacial, dormitorio | constante | ✅ **resuelve el hallazgo eliminatorio de MiniMax** |
| Formato | salió 1376×768 (16:9) sin pedirlo; con `image_config: { aspect_ratio: "1:1" }` → **1024×1024**, 9 s, 0,068 $ (probado) | cuadrado | ✅ |
| Hoja de personaje | cuadrícula respetada: frente, perfil, primer plano | — | ✅ |

Segundo personaje (`--character leo --scenes 6`: niño de 7 años, pelo negro liso, piel morena): **6 de 6**, 0 bloqueos, 13 s/imagen, 0,48 $. Misma consistencia de personaje y de estilo (cocina con horno de piedra, cueva de cristales). La hoja salió en cuatro paneles limpios: frente, perfil, espalda, primer plano.

**Decisión**: proveedor de imagen = **Nano Banana 2 vía OpenRouter**. Una sola clave para texto e imagen, y el guardrail de OpenRouter (5 $/día) como techo externo de gasto. Seedream y la clave de fal.ai dejan de hacer falta. Medido con dos personajes distintos (niña clara con gafas, niño moreno); el VLM de verificación sigue en el diseño como red de seguridad para los casos raros.

## 0.2c — Alternativas más baratas que Nano Banana 2 (2026-08-21)

| Modelo (vía OpenRouter) | $/imagen medido | Latencia | Personaje | Estilo | Nota |
|---|---|---|---|---|---|
| `gemini-3.1-flash-image` (NB2) | 0,068-0,069 | 14 s | ✅ | ✅ | referencia; 18 imágenes medidas en 2 personajes |
| `gemini-2.5-flash-image` (NB1) | 0,039 | ~10 s | ✅ | ✅ pero más pobre: poses rígidas, hoja con peinados mezclados, marcos raros | 7 imágenes |
| **`gemini-3.1-flash-lite-image`** | **0,034** | **5 s** | ✅ | ✅ **indistinguible de NB2** en la escena probada (bosque nocturno con farolillo) | **1 sola imagen**: hay que confirmar con 6+ escenas |
| MiniMax `image-01` | 0,0035 | 40-65 s | ✅ | ❌ colapsa | descartado |

Con lite a 0,034 $: cuento completo (17 imágenes) ≈ **0,58 $** en vez de 1,17 $; muestra (hoja + 2) ≈ 0,10 $ en vez de 0,21 $.

## 0.4 — Texto, baseline con MiniMax M3

Comando: `node scripts/spike-text.js --model MiniMax-M3`

| Intento | Errores del validador | Nota |
|---|---|---|
| Prompt inicial, 2 casos | **0/2 válidos**, 171 errores de schema | M3 inventa los nombres de campo: `page` en vez de `n`, más `word_count`, `age`, `name_token` |
| Con la forma exacta del JSON en el prompt | **válido en el 3.er intento**, 0 errores de schema | quedan `image_hint` demasiado largos (11) y longitud de página (6) |

| Métrica | Resultado |
|---|---|
| Coste por cuento (3 intentos) | 0,0083 $ |
| Latencia | ~76 s por cuento (3 intentos) |
| Calidad del español | **buena**: natural, con tildes, sin cursilería, la afición resuelve el conflicto, la moraleja se muestra |

**Conclusiones**

1. **MiniMax no aplica `response_format` con JSON schema.** Sin structured outputs reales, el modelo adivina los nombres de campo y falla el 100 % de las veces. Corregido incluyendo la forma exacta del JSON en el prompt (171 → 0 errores de schema). Esta corrección **beneficia a todos los proveedores** y es imprescindible para cualquiera que no aplique el schema por contrato.
2. Confirma la elección de **OpenRouter** para texto: los modelos que sí aplican `strict: true` deberían empezar en el primer intento, no en el tercero.
3. Las dos reglas que más se rompen son de **medida** (`image_hint` de 37 palabras contra un máximo de 30; páginas de 56 palabras contra un mínimo de 60). Mitigado pidiendo 25 palabras (margen de sobrepaso) y subrayando el recuento. Si persiste, el motor puede recortar `image_hint` por código en vez de rechazar el cuento entero.

## 0.4b — Texto, cuatro modelos por OpenRouter (2026-08-21)

Comando: `node scripts/spike-text.js` — 5 personalizaciones distintas (mar/gato, bosque/solo, espacio/amigo, dinosaurios/trenzas, fútbol/conejo), hasta 3 intentos guiados por el validador.

| Modelo | Válido a la 1.ª | Coste (5 cuentos) | Latencia por cuento | Reglas que más rompe |
|---|---|---|---|---|
| **Gemini 2.5 Flash-Lite** | **3/5** | 0,009 $ | **16 s** | marcadores (21), longitud de página (9) |
| DeepSeek V4 Flash | 1/5 | 0,006 $ | **402 s** ❌ | longitud (58), nombres inventados (9: «la Cierva») |
| GPT-5 mini | 0/5 | — | — | **HTTP 400 en los 5**: el modo strict de OpenAI exige todas las propiedades obligatorias y `companion` era opcional → corregido con `strictSchema()` en `lib/llm.js` (reprueba pendiente) |
| MiniMax M3 (BYOK) | 1/5 | 0,031 $ | 111 s | longitud (43), nombres inventados (16), lista negra (4) |

**Lectura**

1. **Flash-Lite gana** con diferencia: el único rápido de verdad (16 s: el usuario espera el guion en pantalla) y el que más acierta. Su español es correcto y natural.
2. DeepSeek queda descartado para el tramo en vivo por latencia (402 s por cuento a través de OpenRouter: colas del proveedor), aunque sea el más barato. Podría servir en lotes nocturnos (galería de colorear), no para el guion.
3. MiniMax M3 por BYOK es el que más reglas rompe y tarda 111 s. El ahorro que da la suscripción es de céntimos; no compensa.
4. Los fallos de todos son de **medida** (páginas de 50-59 palabras) y de **marcadores**: ya corregidos en el prompt (objetivo 70-85 palabras; animales en minúscula; `companion` nullable). La reprueba de Flash-Lite y GPT-5 mini con el prompt corregido está en marcha.

**Reprueba con el prompt corregido** (objetivo 70-85 palabras, animales en minúscula, `companion` nullable): Flash-Lite **válido a la primera**, páginas de 64-82 palabras, 10 s, 0,001 $. GPT-5 mini ya no da el 400, pero devolvió el JSON truncado: su razonamiento consume el presupuesto de tokens de salida (hay que pedirle `reasoning.effort: low` o más tokens).

**Decisión**: `TEXT_MODEL=google/gemini-2.5-flash-lite`. Respaldo confirmado: **GPT-5 mini con `reasoning.effort: low`** → válido a la primera, 70-81 palabras, 26 s, 0,005 $ (`lib/llm.js` ya lo envía a los modelos razonadores).

## Hallazgos de producto (no eran spikes, salieron al ejecutarlos)

1. **Faltaba el género del protagonista.** El español obliga a elegir («al niño le gustaba dibujar») y el modelo lo inventaba: con nombre de niña, el cuento salía mal. Añadido `GENDERS` (niña / niño / prefiero no decirlo) con una regla de concordancia explícita en el prompt y, en el caso neutro, la prohibición de usar adjetivos con género para el protagonista. Es un campo obligatorio del formulario.
2. **«herida» era un falso positivo de la lista negra.** Un pájaro con el ala herida es el argumento más común de la literatura infantil. Retirado de la lista; los matices los juzga la segunda pasada del modelo, no una lista de palabras.

## Lo que hace falta para desbloquear el resto

| Necesito | Para qué | Coste |
|---|---|---|
| `OPENROUTER_API_KEY` con ~10 $ de saldo | Comparar Flash-Lite, DeepSeek V4 Flash y GPT-5 mini con structured outputs reales | ~2 $ de consumo |
| `FAL_KEY` con ~10 $ de saldo | Medir Seedream 4.5: consistencia, 2K y filtros | ~1,5 $ de consumo |
| `GEMINI_API_KEY` | Medir Nano Banana 2 como alternativa | ~2,5 $ de consumo |
| Cuenta gratuita en Gelato + `GELATO_API_KEY` | Precio y plazo reales del 20×20 de 32 páginas a España | 0 € (la muestra impresa, ~20 €) |
| Solicitud de Stripe Managed Payments | Cobro digital como MoR | 0 € |
