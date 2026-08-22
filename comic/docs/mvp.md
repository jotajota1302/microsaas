# MVP — cómic personalizado para adolescentes

Estado: **borrador para aprobar**. Escrito el 2026-08-21, antes de tener los resultados del spike. Los números marcados como *hipótesis* se confirman o se caen con datos.

## Qué es

Un cómic de 16 páginas en estilo manga/cómic donde **el protagonista es el adolescente que lo recibe**: su nombre, su instituto, sus amigos como secundarios, lo que le está pasando este año. Elige el **género** (academia de superpoderes, cazadores de espíritus, mechas, isekai, shōnen deportivo, thriller de instituto, space opera) y el tono. Se entrega como PDF y como lectura web en una URL propia.

**Lo que NO es** (y es la decisión que define el producto): no es «tu anime favorito con tu cara». Ver la regla de PI en `../CLAUDE.md` — géneros sí, obras nunca.

## Las dos personas

| | Quién | Qué quiere | Qué le da miedo |
|---|---|---|---|
| **Compra** | Adulto: padre, madre, tío, hermano mayor, pareja | Un regalo que no sea otra tarjeta regalo; algo que demuestre que le conoce | Que al chaval le dé igual |
| **Juzga** | Adolescente, 12-17 | No pasar vergüenza | Que sea cursi, infantil, o que se note hecho a desgana |

El embudo lo recorre el adulto. **El producto lo aprueba el adolescente.** Todo el diseño sale de esa tensión: la landing le habla al adulto, la muestra tiene que aguantar la mirada del chaval.

## El riesgo nº 1, escrito antes de construir

**Es el público más hostil que existe al arte generado por IA.** En comunidades de manga y cómic «hecho con IA» es un insulto. Esto no se resuelve escondiéndolo (Etsy obliga a declararlo, y mentir es peor):

- Se vende como **«su historia»**, no como «IA». El diferencial es que el protagonista es él, igual que en `cuentos` el diferencial no es la cara del niño sino su vida.
- La declaración de IA va en el colofón, con naturalidad, no en letra pequeña.
- **Canales**: donde está el adulto que regala (Etsy, Instagram, boca a boca de familias), **no** donde está el fandom (Reddit de manga, foros de dibujantes). Publicar esto en r/manga es pedir una paliza.
- Si el spike enseña que las viñetas «huelen a IA» a simple vista, el producto no sale, por barato que sea generar.

## Precio (*hipótesis*)

**14,99 € en español, 16,99 € en inglés.** Razonamiento: mismo comprador y misma ocasión que `cuentos` (regalo de cumpleaños), pero el artefacto es más grande (16 páginas, ~64 viñetas frente a 12 ilustraciones) y el comprador de un regalo para adolescente gasta más que para un niño de 5 años. Queda bajo la barrera psicológica de 15.

Margen por venta, con las mismas reglas que `cuentos` (IVA 4 % del libro digital dentro del precio, MoR 5 % + 0,25 €):

| Concepto | € |
|---|---|
| Precio | 14,99 |
| − IVA 4 % | −0,58 |
| − comisión MoR | −1,00 |
| − IA (ver abajo) | −0,26 |
| − reparto del coste de los curiosos (*estimado*) | −0,40 |
| **Margen** | **≈ 12,75** |

## Coste de IA — la sorpresa buena

MiniMax `image-01` cuesta **0,0035 $ por imagen** (medido en `../cuentos/docs/fase-0-resultados.md`).

| Tramo | Imágenes | Coste |
|---|---|---|
| Hoja de personaje | 1 | 0,004 $ |
| Muestra gratis (portada + 2 viñetas) | 3 | **0,011 $** |
| Cómic completo (16 págs × 4 viñetas) | 64 | 0,224 $ |
| Reintentos (~20 %) | ~14 | 0,049 $ |
| Guion (texto, OpenRouter) | — | ~0,01 $ |
| **Total por cómic vendido** | **~82** | **≈ 0,30 $ ≈ 0,26 €** |

Dos consecuencias que cambian el diseño respecto a `cuentos`:

1. **La muestra gratis cuesta un céntimo** (0,011 $ frente a 0,21 € en `cuentos`). El curioso es casi gratis, así que la muestra puede ser generosa: portada + 2 viñetas de verdad, no un teaser tacaño.
2. **El cuello de botella es el tiempo, no el dinero.** A 40-65 s por imagen, 78 viñetas con concurrencia 6 son ~10 minutos. Eso obliga a la máquina de estados por lotes de `cuentos` (`lib/steps.js`) desde el día 1 — no es opcional.

## Formato (*hipótesis, la confirma el spike*)

16 páginas: portada + 14 de historia + colofón. Cuatro viñetas por página en rejilla variable.

**Apuesta técnica**: el modelo dibuja **viñetas sueltas y mudas**, y el código monta la rejilla de la página y compone los bocadillos encima (SVG sobre la imagen). Razones: control total del español, texto editable en el retoque, y en fase 0 medimos que `image-01` **no respeta una cuadrícula 2×2** ni pidiéndoselo. El spike prueba también la vía contraria (que el modelo rotule) para no descartarla por prejuicio.

## Estructura narrativa (validada por código, como en `cuentos`)

Estructura de origen de superhéroe, que es la que el género pide y la que un adolescente reconoce:

> vida normal → **la chispa** (algo cambia) → primer fracaso → entrenamiento/aliado → **la prueba** → resolución donde lo que le define en la vida real es lo que resuelve el conflicto.

El último paso es el que hereda el corazón de `cuentos`: allí la afición del niño resolvía el problema; aquí lo hace **lo que el adolescente es** (el que no se rinde, el que hace reír, el que se fija en todo). Ahí está el regalo, no en los poderes.

## La prueba de validación — 14 días, < 100 €

Sin construir el producto. Se construye **la landing y una muestra real** (la del spike, pulida a mano si hace falta).

| | |
|---|---|
| **Qué se mide** | visitas → % que deja el correo pidiendo su cómic → % que llega a pagar |
| **Gasto** | dominio (~12 €) + Vercel (ya pagado) + IA (< 5 €). Sin anuncios. |
| **Canales** | ficha en Etsy, Instagram/TikTok con el cómic real en vídeo, y el enlace en la web de `cuentos` («¿tu hijo ya no lee cuentos?») |
| **Matar** | 0 pagos **y** < 3 % de altas con ≥ 300 visitas |
| **Iterar** | 1-4 pagos |
| **Doblar** | ≥ 5 pagos |

Es el umbral del portafolio (`../CLAUDE.md`), sin excepciones por ser el proyecto nuevo.

**Antes que nada, un test que no cuesta nada**: enseñar la muestra del spike a 5 adolescentes reales y callarse. Si la reacción es «bah», no hay landing que lo arregle. Es el filtro más barato de todos y es el que de verdad decide.

## Marca — pendiente de JJ

«Familia de cuento» no sirve aquí. Candidatas, todas con el mismo juego en ES y EN:

- **Volumen 1 / Volume One** — nativo del manga (el tomo 1), e insinúa que habrá un tomo 2 (upsell natural).
- **Origen / Origin Story** — término del cómic americano; es literalmente la estructura narrativa del producto.
- **Tu Saga / Your Saga**
- **Arco / Story Arc**

Mi voto: **Origen / Origin Story**, porque nombra a la vez el género y lo que el producto hace.

## Fuera del MVP, escrito para no volver a discutirlo

Impreso, tomo 2 / continuación, cómic interactivo con decisiones, que el adolescente compre solo (no tiene tarjeta), y cualquier franquicia.
