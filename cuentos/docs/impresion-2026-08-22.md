# El libro impreso: por qué la imprenta dice 20 y qué hacer con eso (22-08-2026)

**El presupuesto de la imprenta no dice «imprimir uno es imposible», dice «imprimir uno
*aquí* es imposible».** Un taller tradicional cobra preparación, manipulado y factura por
trabajo: el coste fijo por pedido es el que no baja. La industria que imprime **un** libro
existe desde hace quince años y se llama POD, y ya la teníamos investigada:
`research-2026-08.md` §3 lista **cuatro proveedores con API de pedido unitario y producción
en la UE** (Gelato, Peecho, Cloudprinter, Prodigi) más **Podiprint (Málaga)**, tapa dura sin
mínimo, 48-72 h, imprimiendo en España.

Así que la pregunta no es «¿cómo junto 20 libros?» sino «¿a qué precio me imprime uno un
proveedor cuyo negocio *es* imprimir uno?».

## 0. La pregunta que hay que hacerle a la imprenta antes de nada

**¿Los 20 libros son 20 iguales o 20 distintos?** Cada cuento nuestro es un libro diferente:
otras ilustraciones, otro texto, otro nombre. Si el presupuesto es de 20 ejemplares del
*mismo* libro (que es lo que un impresor entiende por «tirada»), la conversación fue sobre
otro producto y su precio no nos sirve. Pedirle tres números: **1 ejemplar, 20 distintos y
50 distintos**, diciendo explícitamente «dato variable, cada uno con su PDF».

## 1. La cola de 20: por qué no, y en qué forma sí

### Cobrar ahora y fabricar cuando se llene — **no**

- **Ilegal tal cual.** Art. 66 bis TRLGDCU (transposición del art. 18 de la Directiva
  2011/83): el vendedor entrega **sin demora indebida y como máximo en 30 días naturales**.
  Pasado el plazo el cliente resuelve el contrato y hay que devolverle el dinero en 14 días.
  Y antes de comprar hay que darle una fecha de entrega; «cuando pidan otras 19 familias»
  no es una fecha.
- **La aritmética la mata igual.** Con una venta de PDF cada pocos días y un 25 % que
  quiera impreso, salen 1-3 pedidos impresos al mes: la cola de 20 tarda **entre 7 y 18
  meses** en llenarse. No es una cola, es un cementerio.
- **Se vende para una fecha.** Un cuento personalizado se compra para un cumpleaños o para
  Reyes. «No sé cuándo» es exactamente lo único que no se puede vender. Y el retraso de
  entrega es *la queja más dañina* de MiCuento, Wonderbly y Hooray Heroes (§1 de la
  investigación): es el terreno donde ya pierden ellos.

### Reservar sin cobrar — legal, pero se pierde el momento

Cobrar semanas después obliga a recuperar a alguien que ya se emocionó y se le pasó.
Convierte fatal y encima hay que mantener la lista.

### La forma buena de la misma idea: **lote con fecha de cierre**

> «Edición de Navidad. Pedidos hasta el 30 de noviembre, en casa antes del 22 de diciembre.»

Eso **sí** es un lote: la fecha crea el grupo, la promesa es cumplible y la estacionalidad
es real (pico nov-dic, límite de Reyes ≈ 17-dic). Si no se llena, se asume el coste o se
devuelve — y se sabe en tres semanas, no nunca.

**Una cola por cantidad es una promesa rota; una cola por fecha es una campaña.**

## 2. Redirigir el PDF a Hofmann u otro — sí, pero como regalo, no como negocio

- **Los fotolibros de consumo (Hofmann, Fotoprix, Saal, Albelli) están construidos alrededor
  de su editor**, no de subir un PDF de imprenta. Hay flujos donde cada página se mete como
  «foto a página completa», y funciona, pero es trabajo del cliente. **Verificado el mismo
  día contra hofmann.es**: no hay subida de PDF por ninguna parte; la web solo ofrece «con
  nuestra app móvil» o «con nuestro editor de escritorio».
- **Comisión de afiliado: irrelevante** en fotolibros y con un pedido de 25 €.
- **Pero como página de ayuda cuesta 0 € y sube el valor del PDF.** Hoy el comprador recibe
  un fichero y se apaña. Una página «Cómo tener tu cuento en papel» con tres caminos —
  en casa, en la copistería de tu barrio (encuadernado en espiral por 8-12 €), o en una
  imprenta online que acepte PDF — convierte el fichero en un libro sin que nosotros
  toquemos logística. **Esto se puede hacer esta semana.**

## 3. Lo que de verdad decide el impreso: el número que no tenemos

Ningún proveedor publica precio cerrado de **20×20 cm, 24-32 pp, color, tapa dura** sin
cuenta. Peecho publica «tapa dura **desde 5,20 €**» (configuración básica) y Gelato «tapa
dura desde ~12 $» [estimación]. Con eso, la cuenta a 29,90 € sale así — **rangos, no
promesas**:

| Concepto | Optimista | Pesimista |
|---|---|---|
| PVP | 29,90 | 29,90 |
| − IVA 4 % (libro) | −1,15 | −1,15 |
| − Stripe **directo** (1,5 % + 0,25 €) | −0,70 | −0,70 |
| − Libro POD 20×20 tapa dura | −9,00 | −14,00 |
| − Envío España | −4,00 | −7,00 |
| − IA a 2K (ver §4) | −0,60 | −1,20 |
| − Reimpresiones y pérdidas (6 %) | −0,90 | −0,90 |
| **Margen** | **13,55** | **4,95** |

Tres conclusiones incómodas:

1. **A 20-25 € no sale.** En el extremo malo del rango, un libro impreso a 24,99 € deja
   **menos que el PDF a 11,99 €** y encima trae envíos, devoluciones e IVA físico. El
   precio del impreso es **29,90 €, y probablemente 34,90**. El mercado lo aguanta:
   Wonderbly 28-45, Hooray Heroes 35-50, MiCuento/Mumablue 29,99-35.
2. **El impreso no puede cobrarse por Stripe Managed Payments**: los MoR no admiten
   producto físico (decisión ya escrita en `../CLAUDE.md`). Significa Stripe directo, con
   la cuenta de JJ, facturación e IVA propios y el horizonte de Verifactu. Es el salto
   operativo que el MVP solo-digital se diseñó para evitar.
3. **El número que decide es el precio POD real**, y se consigue abriendo una cuenta
   gratuita en Peecho y en Gelato y consultando su *price lookup*, más un presupuesto a
   Podiprint (España, 48-72 h). Media hora de trabajo, no una decisión.

## 4. El bloqueo que nadie ha presupuestado: la resolución

Las ilustraciones se generan a **1024×1024** (comprobado en `out/real/`). A 20 cm de ancho
eso es **≈ 130 dpi**. Para pantalla y para imprimir en casa vale; una imprenta quiere
250-300. El impreso exige **generar a 2K o hacer un paso de reescalado**, lo que
aproximadamente **dobla el coste de IA por libro** (de ~0,57 € a ~1,2 €). Además hacen falta
**3 mm de sangre**, lomo, y llegar al **mínimo de páginas** del proveedor (Peecho 24,
Prodigi 24, Lulu 24, Gelato 30): el libro tiene **20** desde hoy (ver el addendum), así que
a la edición impresa todavía le faltan 4-12 páginas — gratis en contenido (más colorear,
guardas, página «sobre este cuento»), pero es trabajo en el generador de PDF.

Lo demás del suelo legal físico ya está escrito en `../CLAUDE.md`: inserto **GPSR**,
registro de envases, y la buena noticia — **el desistimiento no aplica** a un bien
personalizado (art. 103 c LGDCU), basta avisarlo junto al botón de pago.

## 5. Recomendación en tres capas

**Capa 0 — ahora, 0 €.** Seguir vendiendo solo PDF. Añadir la página «cómo tenerlo en
papel» (casa / copistería / imprenta online) y cambiar la promesa del botón de interés:
de «si hay suficientes familias, lo haremos» a **«te avisamos cuando abramos la edición
impresa de Navidad»**. La lista de interesados ya guarda el email (`print_interest`): eso
no es una encuesta, es la lista de la primera campaña.

**Capa 1 — cuando haya demanda: POD unitario, sin cola y sin stock.** Un pedido, un libro,
4-8 días. Precio 29,90 €. Requisitos previos: precio POD real, ilustraciones a 2K, PDF de
imprenta con sangre, y Stripe directo.

**Capa 2 — la imprenta local se queda, pero como campaña de Navidad.** Si su precio a 20
*distintos* bate al POD lo suficiente, se hace un lote **con fecha de cierre**, que es
cuando un lote es honesto y además rentable. Nunca una cola abierta.

## 6. Qué hacer a continuación (por orden)

1. Preguntar a la imprenta: **1 / 20 distintos / 50 distintos, con dato variable**.
2. Abrir cuenta gratuita en **Peecho** y **Gelato**, sacar precio real de 20×20 tapa dura
   24-32 pp con envío a España. Pedir presupuesto a **Podiprint**.
3. Comprobar si **Hofmann** admite subir un PDF (5 minutos).
4. Con esos tres números, decidir precio (29,90 vs 34,90) y proveedor.
5. Mientras tanto: página «cómo imprimirlo» + copy nuevo del botón. Es lo único que se
   construye antes de tener los números.

---

## Addendum (mismo día): qué pide cada imprenta, y qué hemos cambiado por ello

Comprobado contra sus propias webs, no contra recuerdos:

| Imprenta | Acepta PDF | Formatos cuadrados | Regla que nos afecta | Un ejemplar |
|---|---|---|---|---|
| **Blurb** | Sí, «Sube tu PDF» | 13×13, 18×18, 30×30 cm | **Páginas múltiplo de cuatro** | Sí |
| **Lulu** | Sí, interior + portada aparte | 21,6×21,6 cm (8,5 in) tapa dura | La portada es un fichero propio | Sí, desde ~14,76 $ |
| **Pixartprinting** (ES) | Sí, con corrección automática de sangre y escala | Varios | Ninguna: escala sola | Sí, «desde un ejemplar» |
| **Hofmann, Fotoprix, Photobox** | **No** | — | Solo su editor; cada página habría que meterla como «foto a página completa» | Sí |

### El cambio: el libro pasa de 18 a 20 páginas

**Múltiplo de cuatro no es un capricho de Blurb.** Un libro encuadernado se hace con pliegos
de cuatro páginas: es la regla de la industria, y Blurb es simplemente quien la escribe en su
web. Con 18 páginas, toda imprenta tenía que rellenar con dos blancas o rechazar el fichero.

Las dos páginas que cierran el hueco **no son relleno**:

1. **Dedicatoria a página propia** («Este cuento es de ___» + la dedicatoria). Antes iba
   debajo del título, donde se leía como un subtítulo. Es la página que cualquier libro
   infantil tiene para que alguien escriba de quién es.
2. **El colofón se separa de la ficha de personajes.** Esa página cargaba con un titular, el
   retrato, la moraleja, la dedicatoria de cierre, el aviso de IA y la marca — era la página
   más apretada del libro. Ahora la ficha respira (el retrato pasa del 34 % al 42 % de la
   página) y el colofón es una página tranquila.

De paso se arregló un defecto que no tenía que ver con imprimir: **los textos propios del
libro estaban escritos en español a pelo**, así que el libro en inglés —que cuesta más— se
entregaba con la portadilla y el colofón en castellano. Solo la historia se traducía. Ahora
van por `words(locale)` en `lib/pdf.js`.

### Lo que NO hace falta hacer

**Sangre.** Nuestras páginas tienen margen por diseño: nada llega al borde. Eso significa que
el fichero se puede **escalar a cualquier tamaño cuadrado sin cortar nada**, que es
exactamente lo que hace falta para pasar de nuestros 20 cm a los 18 de Blurb o los 21,6 de
Lulu. Es la ventaja escondida de una decisión que se tomó por estética.
