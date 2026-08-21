# ¿Puede MiniMax `image-01` ilustrar este libro? (2026-08-22)

**No.** El estilo sí se arregla; la identidad de la familia no, y el motivo es de la API, no del prompt.

Coste de la investigación entera: **0,055 $**. Scripts: `scripts/spike-minimax.js` y
`scripts/spike-minimax-identity.js`. Comparaciones en `out/minimax/compara.jpg` y
`out/minimax-id/compara.jpg`, siempre contra las ilustraciones de **un libro ya entregado**
(mismo cuento, misma hoja de personaje, mismas escenas).

## Por qué se volvió a mirar

`../comic/docs/demo-2026-08-22.md` reporta que el fallo eliminatorio de la fase 0 —«la
imagen de referencia se come el sufijo de estilo»— se arregló con cuatro cambios de
prompt. Y el precio es de otra liga: **0,0035 $ frente a ~0,037 $** por imagen. Diecisiete
imágenes por libro son 5 céntimos en vez de 60.

## 1. El refuerzo de estilo funciona aquí también — **confirmado**

Ancla de estilo **al principio** (no de sufijo), **negativos con nombre** (`NOT
photorealistic`, `NOT a 3D render`, `no bokeh`, `no digital oil painting`) y **paleta
nombrada**. 6/6 escenas en acuarela, sin fotorrealismo ni 3D. La acuarela de MiniMax es
incluso más suelta y bonita que la de Nano Banana.

23,4 s de media, 0 bloqueos.

## 2. La identidad se rompe — **eliminatorio, y es un límite de la API**

La API lo dice ella misma:

```
subject_reference con dos entradas → 2013 "invalid params, image_reference must be one"
```

**Una sola referencia.** El niño puede tener cara que copiar; el padre, la madre y la
abuela solo existen como texto. Y el texto no basta:

- El niño **gana y pierde las gafas** entre páginas.
- Los padres se reinventan en cada escena: barba que aparece y desaparece, la madre
  cambia de pelo y de cara.
- Aparecen **personajes que no están en el cuento** (una niña en tres de seis).

## 3. Los dos intentos de arreglarlo

### A · Bloque de personaje escrito por código

En vez de fiarse de la prosa del modelo, el bloque se construye desde **el formulario**,
que es donde de verdad sabemos cómo es el niño: pelo, piel, edad, y las gafas dichas en
positivo o en negativo. Más el reparto congelado palabra por palabra y una valla de
recuento («exactamente 3 personas y nadie más»).

**No se sostiene.** Las gafas siguen apareciendo — y además *migran*: en dos escenas se
las pone el padre. La valla de recuento se ignora: la niña de más sigue saliendo.

### B · Encadenar: cada página se mira en la anterior

**Empeora.** El error se acumula: para la cuarta imagen la familia es irreconocible y la
composición arrastra basura de la anterior (ballenas volando, una cara deformada a
pantalla completa). Es lo esperable de una cadena sin ancla: cada paso copia los fallos
del anterior y añade los suyos.

## 4. Lo que cuesta decir que no

| | Nano Banana (hoy) | MiniMax |
|---|---|---|
| IA por libro | 0,59 € | ~0,10 € |
| Margen por venta a 11,99 € | 10,09 € | 10,51 € |

Se renuncia a **0,42 € por libro, un 4 % del margen**, a cambio de lo único por lo que
alguien paga: que su familia sea reconocible doce veces seguidas.

## 5. Qué hacer con esto

1. **Portar la disciplina de prompt a Nano Banana.** Nuestro estilo va de sufijo, que es
   la posición más débil, y los negativos son genéricos. Cuesta 0 € y ataca la deriva que
   todavía tenemos. **Es lo único accionable de esta investigación.**
2. **Volver a mirar MiniMax si admite varias referencias.** Es un cambio de una línea en
   `lib/images.js` (`IMAGE_PROVIDER`), así que la puerta queda abierta.
3. Si algún día el coste de IA importa de verdad al escalar, **el proveedor no es la
   palanca**: la IA por venta (~2,10 €) está dominada por las muestras regaladas a quien
   no compra, no por el precio del libro. Eso se ataca con conversión, no con modelo.

## Modelos disponibles (probado contra la API, 22-08)

`image-01` ✅ · `image-01-live` ✅ · `image-02`, `minimax-image-01`, `image-2.0` no existen.
