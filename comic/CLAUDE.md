# Proyecto: cómic personalizado para adolescentes

Cuarto proyecto del portafolio, abierto el **2026-08-21 por decisión de JJ**. Es `cuentos/` con otro target: en vez de un cuento ilustrado para un niño de 5 años comprado por su madre, un **cómic donde el protagonista es un adolescente de 12-17 años**, comprado por un adulto como regalo.

**Lee antes de nada**: `docs/mvp.md` (alcance, precio, prueba de validación con umbrales), `../CLAUDE.md` (stack, privacidad con IA, legal: autoridad compartida) y `../cuentos/CLAUDE.md` (de donde sale casi toda la arquitectura; lo que aquí no se contradiga, se hereda).

## Excepción de portafolio, anotada a propósito

`../CLAUDE.md` dice: *«no se abre una idea nueva mientras haya 3 pruebas en curso»*. Esta carpeta la abre JJ con las tres en curso y ninguna vendiendo todavía. Queda escrito para que dentro de un mes se sepa que **fue una decisión, no un descuido**. La contrapartida es que este proyecto **no puede robar tiempo a la fase 1 de `cuentos`**: si compiten, gana `cuentos`.

## La regla de PI — la decisión que define el producto (2026-08-21)

El impulso original era «que el chaval elija su anime favorito y ambientamos la historia ahí». **No se hace.** La línea, que no está donde parece:

- **El estilo visual no se protege.** Ni en la UE ni en EE. UU.: el copyright cubre obras, no estilos. «Shōnen moderno, línea de tinta gruesa, sombreado cel, screentone» es libre, y es el 80 % de lo que pide un adolescente cuando dice «quiero un cómic tipo anime». **Eso se le da entero.**
- **Los personajes y los mundos sí.** Un producto de pago y personalizado ambientado en una franquicia es obra derivada sin licencia. No hay parodia ni cita que ampare a un producto comercial.
- **Lo que mata primero es la marca, no el copyright.** Los nombres de las series son marcas registradas en la EUIPO; escribirlos en la ficha de Etsy, en la landing o en el SEO es infracción de marca y es lo que cazan los bots automáticos. Shueisha, Toei, Bandai y Nintendo barren Etsy sistemáticamente.
- **El riesgo real no es una demanda: es el cierre de cuenta** de Etsy y del MoR (la infracción de PI está en el AUP de Stripe). Perder el canal principal de `cuentos` por un experimento paralelo es un riesgo asimétrico inaceptable.

**Regla operativa**: el **género** se nombra, la **obra** nunca — ni en el prompt, ni en el formulario, ni en Etsy, ni en el SEO. Y nada de «X con otro nombre»: ni rubio con marcas de bigote ni zorro de nueve colas. El formulario ofrece **géneros en lista cerrada**, nunca texto libre para el ambiente.

Y no es un premio de consolación, es mejor producto: contra una franquicia el resultado **compite con el original y pierde siempre** ante el público más despiadado que existe; con un género la historia es suya y no hay comparación posible. Además la lista cerrada es lo que hace funcionar el pipeline (un sufijo `STYLE` por género, validador con estructura fija) — la arquitectura de `cuentos`.

Precedente: `cuentos/lib/collection.js` ya tiene `disney, pixar, marvel, pokemon, frozen, elsa…` en la lista negra. Aquí la lista se amplía con franquicias de anime y manga.

## Decisiones ya tomadas (no reabrir sin preguntar)

- **Quién compra y quién juzga**: paga un adulto (padre, madre, tío, hermano mayor, pareja); lee y juzga el adolescente. El producto tiene que superar **dos filtros distintos**: que al adulto le parezca un buen regalo y que al chaval no le dé vergüenza. El segundo es el difícil.
- **Imagen: MiniMax `image-01`** (decisión de JJ, 2026-08-21) con la clave de la suscripción ya existente. El motivo nº 1 por el que `cuentos` lo descartó — 1024 px son 130 dpi en una página de 20 cm — **no aplica aquí**: una viñeta de 9 cm a 1024 px son ~290 dpi, calidad de imprenta. Lo que sí sigue vivo de aquella medición y hay que vigilar: **deriva de estilo** entre imágenes (fue el hallazgo eliminatorio), **marca de agua** ocasional pese a pedir que no, y **40-65 s por imagen**. Medido aquí en `scripts/spike-comic.js`. El proveedor va detrás de un adaptador conmutable como en `cuentos/lib/images.js`: si MiniMax no da la talla, se cambia la variable, no el código.
- **Privacidad, heredada sin cambios de `cuentos`**: **sin fotos** (decálogo AEPD 27-01-2026) y **ningún nombre real viaja al modelo** — van como `{{NOMBRE}}`, `{{AMIGO1}}`. La relación y el género sí van, porque no identifican a nadie. Esto importa más aquí que en `cuentos`: los datos son de **menores**.
- **Sin texto libre en el formulario** salvo nombres y dedicatoria, y ambos pasan por el filtro. Un adolescente escribiendo texto libre en un formulario es una fuente de problemas que no necesitamos.

## Lo que se hereda de `cuentos` (no se reinventa)

Máquina de estados de jobs en Supabase, embudo de dos puertas con URL temporal `/c/<token>`, trabajo por lotes para no reventar `maxDuration`, validador como única puerta, moderación en dos pasadas, generación del PDF, techos de gasto diarios, `push-env.js`. Lo que aquí cambia es **el guion, el estilo, la maqueta de página y el formulario** — el motor es el mismo.

Diferencia técnica de fondo: en `cuentos` el texto vive **fuera** de la ilustración (maquetado en el PDF); en un cómic vive **dentro** de la viñeta, en bocadillos. Es la incógnita que no existía antes y la mide el spike.

## Decisiones de arquitectura (2026-08-22, medidas)

- **El cómic se genera VIÑETA A VIÑETA**, no como página entera de una sola imagen. Las dos se
  midieron con un cómic completo de 14 páginas: por viñetas 0,17 € y 6 min 55 s; por páginas enteras
  0,05 € y 2 min 27 s. La página entera compone mejor, pero **es el único modo que no controla quién
  sale en cada viñeta**, y sin eso no hay guion: hay imágenes bonitas en orden. Los 12 céntimos de
  diferencia son el 0,8 % de un precio de 14,99 €. Detalle en `docs/demo-2026-08-22.md`.
- **Página entera SÍ para portada y muestra gratis**: una sola imagen, todo el peso visual, sin
  reparto que repartir. La muestra cuesta 0,0035 $ y 20 s.
- **La muestra gratis es una imagen (la portada) + el guion entero en texto.** El diferencial no es
  el dibujo, del que hay infinito y gratis, sino que la historia es suya — y el guion cuesta 0,01 €.
- **Estilo de salida: manga en blanco y negro.** Sin color no hay paleta que derive: elimina el eje
  por el que el modelo se escapaba, en vez de pelearlo con negativos. Los otros cinco estilos están
  en el catálogo y disponibles.
- **Formato página, no tira vertical (webtoon).** El lector mediano de webtoon tiene 18-22 años y es
  mayoritariamente femenino; el de manga está más repartido y encaja con 12-17.
- **La maqueta la decide el código**, a partir del número de viñetas que trae la página. Cuando se le
  pedía al modelo, elegía una maqueta y luego escribía otro número de viñetas en 11 de 14 páginas.
- **Los bocadillos se colocan midiendo el dibujo** (`lib/letterer.js`), no por una esquina escrita en
  el guion: quien decide la composición es el modelo, y el bocadillo acababa sobre la cara.
- **Las viñetas sin personas se generan SIN referencia.** Si se le pasa, el modelo mete al
  protagonista en el primer plano del portátil y en la viñeta del villano.

## El guion: dos pasadas y validación (2026-08-22)

Guionista y editor son **llamadas distintas** (`lib/prompt-script.js`): un modelo al que le pides que
mejore su propio texto sobre todo se da la razón. El editor puntúa 0-5 contra una rúbrica escrita y
**no reescribe**: diagnostica. Los umbrales los pone el código (`judgeCritique`), no el modelo, para
que un crítico generoso no cuele una historia rota.

Y hay tres estados de salida, no dos: dibujable y bueno, **dibujable pero suspendido por el editor**
(sale marcado `needsHumanReview`), y no dibujable. El estado del medio es real y esconderlo tras un
visto verde es como un guion malo llega a un cliente que ha pagado.

## Privacidad — incidencia corregida (2026-08-22)

El desglose estaba metiendo **el nombre real del menor dentro de cada descripción de escena**, y la
escena es exactamente lo que se envía al proveedor de imagen. Eso incumple la regla de este mismo
fichero («ningún nombre real viaja al modelo») con datos de menores y un proveedor sin DPA en la UE.
66 apariciones en un solo cómic.

Corregido en tres capas: el prompt lo prohíbe, **el validador lo rechaza como error** (no aviso), y
las historias ya generadas se limpiaron. El nombre solo vive en los bocadillos, que nunca salen del
PDF. Efecto colateral medido: los bloqueos del filtro de contenido de MiniMax bajaron **de 19 a 6**
sobre 83 imágenes — el filtro se pone conservador con menores nombrados.

Para los bloqueos que quedan (menor + noche + entrar en un sitio) hay una **escalera de reintentos**
en `scripts/gen-demo.js`: suavizar encuadre → abrir el plano → dibujar el sitio vacío. Un plano
general es una viñeta legítima; un hueco en mitad de una página es un producto roto. 83 de 83.

## El editor no es el guionista (2026-08-22)

Escribe MiniMax, juzga **GPT-5 mini vía OpenRouter** (`CRITIC_PROVIDER` / `CRITIC_MODEL`). Un modelo
no ve sus propios errores: el crítico cruzado cazó a la primera un «Cuelto» inventado, un «Mirá»
con voseo argentino en una historia ambientada en España y una réplica con inglés colado. El crítico
hermano no había visto ninguno.

**Corrección de una cifra que estaba mal aquí (2026-08-22):** decía «4 llamadas cortas por cómic,
menos de un céntimo». Contadas en el código, son **16**: 1 crítico del esqueleto, 1 crítico de
diálogo y **una por página** de pulido. Y el pulido no valida: **reescribe**. O sea que OpenRouter
no es «solo para criticar», es quien escribe la versión final de los diálogos. Coste real ~0,02 $
por cómic — sigue siendo calderilla, pero el reparto no es el que decía este fichero.

Y **cada crítico puntúa solo lo que puede ver**: el del esqueleto ya no puntúa diálogo, porque el
esqueleto no tiene diálogo — daba 2/5 siempre y ese 2 disparaba una reescritura que no podía
arreglarlo. El diálogo lo juzga `dialogueCriticPrompt` sobre las réplicas reales.


## Estilos: seis en el catálogo, los seis verificados (2026-08-22)

`scripts/spike-styles.js` dibuja la MISMA viñeta con las seis anclas de `lib/catalog.js`, sin
referencia de personaje, para que lo único que cambie sea el estilo. 6/6, 0,021 $, y salen
genuinamente distintos — no es el mismo dibujo con un filtro encima. Revisable en `out/styles/`.

Cinco de las seis eran promesas sin comprobar: estaban ofrecidas en el formulario y nunca se habían
generado. Regla que sale de aquí: **una opción del catálogo que nunca se ha dibujado no se ofrece.**

`manga-bn` sigue siendo el de salida (sin color no hay paleta que derive) y es el único con un cómic
completo detrás.

## Landing: día y noche (2026-08-22)

Paleta «Seinen nocturno» en tokens, con par diurno. Precedencia: elección guardada → preferencia del
sistema → noche. El interruptor lo inyecta `assets/js/theme.js`, que va **síncrono en el `<head>`**
para que no haya destello, y sin él la página sigue funcionando.

- El ámbar `#E8A33D` da **1,89:1** sobre fondo claro: ilegible como texto. En día `--amber-text` baja
  a `#9A5F06`. El botón mantiene el ámbar en los dos modos porque ahí es el FONDO.
- Comprobados los once pares de contraste. `--dim` de día se quedaba en 3,42 y subió a `#626D7A`
  (4,61). Los once pasan AA.
- Los valores de día están escritos **dos veces a propósito** (media query y `[data-theme="light"]`):
  una sola regla no cubre a la vez «el sistema lo pide» y «el visitante lo ha elegido».

## El validador de imagen: 9 de 83 traicionaban el estilo (2026-08-22)

Todo lo demás que sale de un modelo en este proyecto pasa por un validador antes de que el motor lo
toque — es la regla de oro heredada del RPG. **Las imágenes eran la excepción**, y la excepción se
pagó: en el primer cómic completo, **9 de 83 viñetas (10,8 %)** traicionaban el estilo de un cómic
vendido como blanco y negro. Lo cazó JJ a ojo, no el código.

No son un fallo, son dos, y separarlos es lo que hace `lib/panel-check.js`:

| | Qué pasa | Arreglo | Coste |
|---|---|---|---|
| **DRIFT** | línea de manga correcta con color colado (una farola encendida, una pantalla, un brillo) | desaturar | gratis |
| **COLLAPSE** | el modelo ignoró el ancla y devolvió **una fotografía** | redibujar | 0,0035 $ |

Lo que los separa es la **densidad de tinta**: el porcentaje de píxeles casi blancos o casi negros.
La línea entintada es bimodal por construcción — medido sobre las 74 correctas, **suelo 52 %,
mediana 72 %**. La fotografía dio **11,6 %**. Todo lo que tenía color pero tinta de verdad dio 45 %
o más. Un umbral en el 30 % deja a la población entera a un lado y al colapso solo al otro.

Sobre el cómic real: 74 correctas, 8 drift, 1 collapse. Es decir, **el 9,6 % se arregla gratis y solo
el 1,2 % cuesta dinero**. Conectado a `render-job` (nada se guarda sin mirarlo) y a la portada en
`api/job.js`, donde importa más que en ningún sitio: es la muestra gratis entera.

Y lo que este validador **no** ve, dicho en vez de tapado con una métrica que no lo mide: una viñeta
entintada, correcta en las dos medidas y aun así equivocada — el personaje que no es, una mano con
seis dedos, una composición que no cuenta el beat. Eso necesita ojos o un modelo de visión.

Nota medida al redibujar el colapso: volvió como manga bueno pero **virado a azul** (87 % de color,
52 % de tinta). El validador lo clasificó como drift y desaturarlo lo dejó perfecto. El fallo de una
viñeta no se repite igual: reintentar sirve.

## El medio de pago y la entrega (2026-08-22)

Lo que faltaba para que el embudo tuviera final. Todo con `fetch`, sin SDK de Stripe ni de Resend:
dos endpoints no justifican una dependencia y la firma del webhook son veinte líneas de crypto —
la misma decisión (y casi el mismo código) que `cuentos/lib/stripe.js`.

- **`comic/` ya tiene `package.json` propio.** Antes le robaba `sharp` a `../cuentos/node_modules`,
  que es un apaño de prototipo que no despliega. Dependencias: `sharp`, `pdf-lib`, `@supabase/supabase-js`.
- **Precio 14,99 €** en `lib/money.js`, con el IVA al 4 % (misma lectura que `cuentos`: libro
  electrónico, RDL 15/2020, DGT V3388-20). Margen ~13 € por venta.
- **Managed Payments va detrás de `STRIPE_MANAGED_PAYMENTS=1`, no cableado.** `../CLAUDE.md` lo da
  por decidido, pero el despliegue de Stripe sigue siendo mayoritariamente EE. UU. y una cuenta
  española puede no ser elegible. Con el flag apagado es una venta normal y el IVA es nuestro.
- **`/api/checkout` responde a GET y a POST.** El botón es un enlace normal: si nuestro JavaScript
  falla en un móvil, el único clic que produce ingresos sigue funcionando.
- **No se vende una historia que nuestro propio editor ha suspendido** (`needsHumanReview` → 409).
- **El PDF se genera con pdf-lib, sin navegador.** La demo usaba Chrome sin cabeza; eso no despliega.
  sharp recorta cada viñeta a su celda y pdf-lib coloca y **dibuja los bocadillos en vector**: texto
  nítido a cualquier zoom y cero dependencia de tipografías instaladas en el servidor. La geometría
  de página, que solo existía como CSS dentro de un script, ahora es `lib/layout.js`.
  Medido: **5,6 s y 5,56 MB** para 14 páginas. La primera versión daba 11,63 MB porque codificaba
  cada JPEG dos veces y a más resolución de la necesaria.
- **La letra es Helvetica Bold, no Bangers.** Las fuentes estándar del PDF no traen una condensada de
  cómic. Se lee bien y tiene menos carácter; incrustar una fuente de verdad es la mejora obvia.
- **El PDF va como ENLACE, nunca adjunto.** Doce megas rebotan en medio buzón corporativo.
- **Portón de no-entrega**: más de `MAX_HOLES` (2) viñetas sin dibujar y el cómic **no se manda**.
  Se queda en `needs_attention` con el PDF construido para que lo mire un humano. Mandar un cómic
  con la cuarta parte en blanco y llamarlo entregado es el fallo que este portón existe para evitar.
- **Nada público en almacenamiento**: `/api/file?token=…&k=cover|pdf` comprueba el token y, para el
  PDF, que esté pagado. Una URL de bucket es un permiso que no puedes revocar.
- **Dos fallos reales corregidos de paso**: el limitador por IP leía el **primer** salto de
  `x-forwarded-for`, que lo pone el cliente (era decorativo); y la portada se escribía en el disco
  de la función, que no sobrevive a la invocación que lo escribió — nadie la habría visto en
  producción.

### Cómo probarlo sin gastar ni cobrar

```
node scripts/dry-run-paid.js              # webhook -> sheets -> panels -> pdf -> correo -> done
node scripts/dry-run-paid.js --holes 5    # ¿se planta y NO entrega? (sí)
node scripts/build-pdf.js --story stories/nerea.json
node scripts/check-pdf.js                 # estructura + ningún bocadillo se sale de su viñeta
node scripts/check-panels.js --img out/nerea/img [--fix]
```

`dry-run-paid` siembra el almacén con un cómic ya dibujado, así que cada paso ejecuta su código real
y se encuentra el trabajo hecho. Lo que **no** demuestra es que el proveedor dibuje 78 viñetas
usables en producción: eso necesita un pedido de verdad y es lo siguiente.

## El comprador no puede ser el trabajador (2026-08-27)

Primera venta de verdad, y se quedó a medias. El pedido `y876mG…` se cobró a las 08:04:48, dibujó
las hojas de personaje, y a las 08:06:18 se paró en `panels` con **cero viñetas** y el cierre libre.
No estaba roto: **no había nadie empujándolo.**

La máquina era «quien mira, empuja», y eso pone de motor de un cómic de 14,99 € **una pestaña de
navegador abierta veinticinco minutos**. El comprador hizo lo que hace cualquiera: miró un rato,
cerró y se fue al panel. Los registros lo cuentan entero — dos llamadas a `/api/render` y
veinticuatro a `/api/admin`, que solo lee.

Y la red de seguridad no era lo que decía este fichero. El cron pide `*/5 * * * *`, pero GitHub
Actions estrangula los crons de los repos pequeños y los runs reales iban **cada tres horas**
(03:20, 22:10, 19:09, 16:54). En seis horas de registro de Vercel: **cero** llamadas a `/api/cron`.

**El arreglo es `lib/chain.js`: cada invocación llama a la siguiente.** El webhook de Stripe da el
primer golpe, cada paso arranca el que viene detrás, y el cron pasa de ser el motor a ser lo que
siempre debió ser: el desfibrilador de una cadena rota. Lo mismo en la mitad gratis
(`/api/preview` → `/api/job`), donde el fallo costaba el correo de «ya está tu historia», que es el
embudo de captación entero.

Se puede colgar la espera del disparo porque en Vercel **la desconexión del cliente solo cancela la
función si el proyecto declara `supportsCancellation`**, y no lo declaramos (verificado en la
documentación, no supuesto). Se esperan dos segundos —lo que tarda el apretón de manos— y se cuelga.

Tres guardas, porque una función que se llama a sí misma con dinero de por medio es exactamente
como se hace una factura infinita. Las tres **probadas**, no razonadas:

| Guarda | Qué impide | Comprobado |
|---|---|---|
| solo encadena quien tiene el cierre | dos cadenas dibujando lo mismo | dos llamantes a la vez: uno trabaja, el otro `busy` |
| `done` corta | seguir tirando de un cómic acabado | la cadena para en `done` |
| `CHAIN_MAX_HOPS` (60 render / 20 previa) | una cadena que no converge | con tope 1 se planta y lo grita |

`CHAIN_MAX_HOPS=0` apaga la cadena entera sin desplegar, si algún día hace falta.

**Un disparo rechazado se denuncia, no se celebra.** La primera versión daba por bueno cualquier
disparo que no fuera un plantón: un 401 de la protección de despliegue o una URL base mal puesta
rompían la cadena y el registro decía que todo iba bien. Ahora una respuesta que llega *antes* del
plantón es sospechosa por definición —el paso siguiente tarda minutos— y se registra como error.

### La prueba: `node scripts/dry-run-chain.js`

Da **un solo golpe** a `/api/render` y a partir de ahí no vuelve a tocar ningún endpoint: el
progreso se lee del almacén en disco, nunca por HTTP, porque consultar por HTTP sería empujar y la
prueba se aprobaría a sí misma. Antes del arreglo se quedaba en `panels` igual que en producción;
después termina el cómic y lo entrega **con una sola llamada**.

### Y dos tests que mentían, encontrados por el camino

1. **`lib/llm.js` pisaba el entorno al cargar `.env`.** Asignaba sin mirar, así que
   `STORE=files node scripts/devserver.js` —local a propósito, para no tocar producción— volvía a
   `STORE=supabase` en cuanto cualquier módulo cargaba ese fichero: **un servidor de pruebas
   escribiendo en la base de datos de verdad**, con el banner del arranque diciendo «almacén:
   files». Que fallara o no dependía del ORDEN de los require. `lib/images.js` ya traía la guarda
   correcta (`&& !process.env[k]`); ahora la traen los dos.
2. **`dry-run-paid.js --holes 5` daba verde sin probar nada** si se corría después de una pasada
   normal: las cinco viñetas que retiene a propósito seguían en el almacén de la vez anterior, el
   render las encontraba dibujadas y entregaba tan contento. La prueba del portón saltándose el
   portón. Ahora limpia los blobs del token antes de sembrar.

Y el 404 del servidor local: «no hay endpoint /api/x» y «ese pedido no existe» decían exactamente
lo mismo, que es lo que convirtió el diagnóstico de arriba en una tarde.

### Y Vercel corta la cadena a los cuatro saltos: HTTP 508 (medido en producción)

Esto NO se ve en el portátil, y por eso hubo que probarlo en producción con un pedido real:

```
08:43:05  cadena /api/job salto 1  ok
08:43:07  cadena /api/job salto 2  ok
08:43:37  cadena /api/job salto 3  ok
08:43:38  cadena /api/job salto 4  ok
08:44:21  la cadena /api/job ha sido RECHAZADA con 508
```

**508 Loop Detected**: Vercel detecta que una función se está invocando a sí misma y la corta. Es una
protección deliberada de la plataforma —existe para que un bucle no genere una factura infinita— y
no se intenta esquivar: es la misma protección que nosotros queremos.

La causa es el ANIDAMIENTO. El padre dispara a la hija *antes* de responder (no puede hacerlo
después sin `waitUntil`), así que cada salto es una petición dentro de otra y la profundidad crece:
al quinto nivel, 508.

La vista previa de prueba se quedó **parada en el 75 % durante más de dos minutos** y allí seguía.
Así que la cadena mejora mucho las cosas —de cero saltos automáticos a cuatro— pero **no cierra el
problema por sí sola**: hace falta algo EXTERNO que reanude, y ese algo es el barrido.

Lo cazó la comprobación de «respuesta temprana» de `lib/chain.js`. Sin ella, el 508 se habría
contado como un salto correcto y el pedido habría parecido ir lento en vez de estar roto.

**Lo que falta, y es una decisión, no código**: un disparador de `/api/cron` que corra de verdad
cada minuto. GitHub Actions no sirve (tres horas). Las opciones son Vercel Pro (cron nativo por
minuto, y de paso legaliza la venta), un pinger externo tipo cron-job.org (gratis) o Vercel Queues.
Con cualquiera de los tres, la cadena sigue valiendo: avanza cuatro pasos en ráfaga entre barridos
en vez de uno por barrido.

### Lo que esto NO arregla

- **La cuenta de Vercel está en plan Hobby, y Hobby prohíbe el uso comercial.** Ya se está cobrando
  con Stripe. `../CLAUDE.md` decidió Pro precisamente por esto y sigue sin hacerse: es el mismo
  riesgo asimétrico que se cuida con Etsy y el MoR — perder el canal por una cláusula, no por el
  producto. Pro además da crons por minuto, que dejarían el barrido de GitHub Actions en anécdota.
- El cron sigue corriendo cada tres horas en la práctica. Con la cadena tirando ya no es el motor,
  pero como desfibrilador tres horas es flojo.

## Nombre y dominio (2026-08-22)

**MyOwnManga**, `myownmanga.com` (11,25 $/año, libre y verificado). `mipropiomanga.com` también libre,
para comprar y redirigir: protege el término de búsqueda español y evita renombrar si el mercado
español acaba mandando. Un solo nombre para las dos landings, porque «manga» se lee igual en español
y *my own* lo entiende un padre español; al revés no funciona.

Lo que se pierde, escrito para que no se olvide: **es un nombre descriptivo, no una marca.** No se
puede registrar ni impedir que lo copien. A 14,99 € y sin presupuesto de marketing el SEO vale más
que el aura, pero si algún día hay presupuesto, esta decisión se revisa.

No existe ningún servicio con ese nombre (comprobado). Lo más cercano es MangaYourself, que hace
retratos a partir de fotos: otro producto y, además, uno que nosotros no podemos hacer (AEPD).

## Variables de entorno nuevas

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MANAGED_PAYMENTS`, `PUBLIC_BASE_URL`,
`RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `CRON_SECRET`, `BLOBS`, `BLOB_DIR`,
`ADMIN_TOKEN`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `SUPABASE_BUCKET`, `PDF_DPI`, `PDF_QUALITY`,
`LEGAL_NAME`, `LEGAL_NIF`, `LEGAL_ADDRESS`, `LEGAL_EMAIL`, `KEEP_UNPAID_DAYS`, `KEEP_PAID_DAYS`,
`TRUST_PROXY_HOPS` (solo si hay más de un proxy delante; en Vercel se deduce), `COST_LOG` (si se
quiere el registro de coste en disco).
Sin `RESEND_API_KEY` el correo sale por consola, que es lo que permite recorrer el flujo entero
en el portátil.

## Supabase: schema `comic` aplicado (2026-08-22)

Autorizado por JJ. Migración en `supabase/0001_comic_schema.sql`, **aplicada y verificada** contra
el proyecto compartido: schema nuevo, aditivo, sin tocar `public` ni `cuentos`.

**La tabla NO es una columna por campo.** La obvia refleja el objeto del trabajo campo a campo, y se
descartó contando: en una sola tarde le añadí seis campos (`base_url`, `paid_at`, `payment`,
`render_status`, `render_step`, `render`), y PostgREST rechaza un insert que nombre una columna que
no existe. Esa tabla convierte cada cambio de producto en una migración, y una migración olvidada en
**un pago que se cobra y no se registra**. Así que: columnas reales para lo que se consulta (los
contadores del día, las colas del cron, el cierre) y un `job` jsonb con el objeto entero, que es el
registro de verdad. Efecto colateral bueno: `order` es palabra reservada de SQL y dentro del jsonb
deja de ser un problema.

- RLS activo **sin políticas**: solo entra el service role. No hay usuario con sesión en este
  producto — el token del enlace es toda la autorización y lo comprueba nuestro handler, nunca la
  base de datos. El advisor lo marca como aviso; es intencionado.
- `anon` y `authenticated` no tienen ni `USAGE` sobre el schema (verificado: `has_schema_privilege`
  devuelve false), y los `default privileges` se los revocan también a futuro.
- Bucket de Storage `comic`, **privado**, 25 MB por fichero. Las viñetas y el PDF se sirven por
  `/api/file`, que comprueba el token y el pago. Una URL de bucket es un permiso que no se revoca.

### El cierre (`locked_until`) — esto era dinero de verdad

El visor empuja el trabajo mientras el comprador mira, y el cron barre cada cinco minutos. Los dos
ven las mismas ocho viñetas sin dibujar y **los dos las dibujan**: 0,028 € comprados dos veces y dos
escritores pisándose el progreso. `store.claim(token, 240)` es un solo UPDATE con la condición en el
WHERE (leer-y-luego-escribir tendría justo la carrera que evita), y `advanceRender` lo suelta en un
`finally` para que un pedido roto no se quede bloqueado en cada barrido.

Probado contra la base real: primer reclamo coge la fila, el segundo devuelve 0.

**Lo que NO está probado**: el adaptador desde Node. Necesita `SUPABASE_SERVICE_ROLE_KEY` y no la
tengo aquí. El SQL sí está verificado.

## El panel de operación (2026-08-22)

`/admin` + `/api/admin`, con la forma de `cuentos/lib/dashboard.js`: funciones puras sobre las filas
y los **nombres** de las variables de entorno, sin red ni base de datos, para que la aritmética de
«¿esto funciona?» sea testeable y viva en un sitio.

**Lo que NO se copia de `cuentos` es la aprobación.** Decisión de JJ (2026-08-22): aquí no se aprueba
nada. Un cómic que pasa los validadores se manda en cuanto está, y lo único que espera a una persona
es `needs_attention`, que no es «pendiente de aprobar» sino «ya sabemos que este está roto». Las dos
acciones del panel son **reintentar** (empujar un trabajo atascado) y **entregar igual** (soltar uno
que paramos, después de que un humano abra el PDF). Ninguna crea un paso rutinario.

- Token por cabecera `X-Admin-Token`, nunca en la URL: una query string acaba en los logs de acceso,
  en el `Referer` de todo lo que cargue la página y en el historial del navegador.
- Sin `ADMIN_TOKEN` configurado **no hay panel**, nunca un panel abierto.
- La respuesta reduce los secretos a la cadena `"set"` antes de salir: la salud solo pregunta si algo
  está presente, así que el valor no tiene por qué viajar. Comprobado que no se cuela ninguno.
- Muestra la deriva de estilo (drift / collapse / huecos) que mide `lib/panel-check.js`, que es la
  métrica de calidad que ahora sí existe.

## Tres fallos reales encontrados al revisar contra `cuentos` (2026-08-22)

1. **`MAX_PREVIEWS_PER_DAY` estaba declarado, exportado, descrito en un comentario como «el freno de
   verdad»… y nunca se comprobaba.** Un techo de gasto que nadie lee no es un techo, es una nota.
   Ahora se comprueban los dos y el global responde con lista de espera, no con un error.
2. **El limitador por IP leía el primer salto de `x-forwarded-for`**, que lo pone el cliente. Era
   decorativo. Ahora `lib/http.js` prefiere `x-real-ip` y, si no, el ÚLTIMO salto.
3. **El servidor local devolvía 404 en cualquier carpeta con `index.html` dentro** (`/admin`,
   `/legal`): solo buscaba el índice cuando la ruta no existía, y una carpeta sí existe.

### Lo que sigue mereciendo copiarse de `cuentos`

- **`lib/turnstile.js`** — Cloudflare Turnstile. **`comic` no tiene NADA que distinga a una persona
  de un script**, y aquí el formulario gasta dinero. Los topes acotan la factura pero dejan que un
  bot se coma la cuota del día, así que el daño son ventas perdidas. Es el hueco más grande que
  queda.
- **Fuente incrustada en el PDF** — `cuentos` usa `@pdf-lib/fontkit` con TTF propios
  (`Andika-*.ttf`). Es exactamente lo que le falta al rotulado: hoy es Helvetica Bold porque las
  fuentes estándar del PDF no traen una condensada de cómic.
- **`lib/moderation.js`** — dos pasadas sobre lo que escribe el cliente. `comic` solo tiene la lista
  negra del catálogo.
- `lib/analytics.js` (UTM) y `lib/env.js` (validación de variables), menos urgentes.

`viajeros/` y `kit-local/` **no tienen código todavía**, solo `docs/` y `CLAUDE.md`: de ahí no hay
nada que copiar. De `rpg-narrativo/` lo único aplicable sería el latido en streaming de `/generate`,
y aquí no hace falta porque la máquina de estados con sondeo evita el problema que resuelve.

## Turnstile y tipografías (2026-08-22)

Los dos huecos que quedaban de la comparación con `cuentos`, cerrados.

### Filtro de bots

`lib/turnstile.js`, en sustancia el de `cuentos`. Importa más aquí: **nuestro formulario no crea una
fila, gasta dinero** — cada envío compra una portada y un guion.

- Sin configurar, **no se exige**: el sitio nunca deja de vender por una clave que falta. El hueco
  sale en el panel para que no se olvide en silencio.
- Un token **ausente** se rechaza cuando Turnstile SÍ está configurado. Si no, la comprobación se
  salta simplemente no mandando token, que es lo primero que probaría cualquier script.
- Si Cloudflare **no responde**, se deja pasar. Perder ventas reales por una caída ajena es peor que
  los pocos bots que se cuelan mientras dura, y los topes diarios acotan lo que esos pueden gastar.
- La clave pública llega por `/api/config`, no incrustada: la landing no tiene paso de compilación y
  la clave cambia por despliegue. Ese endpoint sirve también el precio, para que un cambio en
  `lib/money.js` llegue a la página en vez de reescribirse a mano en dos HTML y olvidarse en un tercero.

### Tipografías incrustadas en el PDF

`assets/fonts/`, las dos con **SIL Open Font License**, que permite explícitamente incrustar. Nada de
fuentes de cómic «gratis para uso personal»: en un producto de pago no valen.

- **Bangers** en el título de portada — ya es la cara de la marca en la landing, así que el cómic y
  el sitio parecen la misma cosa.
- **Barlow Condensed** en todos los bocadillos. Y esto no es gusto, está medido: al mismo cuerpo
  cabe un **32 % más de texto por línea** que en Helvetica («NO VOY A DEJAR QUE APAGUE OTRO SEMÁFORO
  ESTA NOCHE»: 237,6 pt contra 161,0). Bocadillo más pequeño = menos dibujo tapado.
- `subset: true`: solo viajan los glifos usados. Cuatro caras TrueType y el PDF **no ha crecido**
  (5,59 MB antes y después). Verificado que las cuatro están dentro y que Helvetica no aparece.
- Si falta un fichero de fuente se cae a las estándar y avisa. Una fuente que falta debe degradar el
  rotulado, nunca perder un cómic que alguien ha pagado.
- **Se retira el plegado a WinAnsi.** Existía solo porque las fuentes estándar llegan a Latin-1: las
  comillas «», las rayas — y los puntos suspensivos se aplastaban a ASCII. Ahora se dibujan. Queda
  un plegado mínimo para los caracteres invisibles que emite el modelo (espacios de ancho cero), que
  no tienen glifo en ninguna cara.

### Un test que mentía

`scripts/check-pdf.js` seguía midiendo con Helvetica mientras el renderizador ya dibujaba Barlow.
**Un test que mide con otra fuente que el renderizador no es un test**: sus números eran
pesimistas en un tercio. Ahora llama a `CP.loadFonts()`, el mismo cargador que el PDF.

## Otro fallo caro: el formulario escondía el sitio donde se compra (2026-08-22)

`/api/preview` devuelve `url` con la vista previa. El JS **la tiraba**: decía «te llega al correo en
unos minutos» y reseteaba el formulario. El visor `/c/<token>` es **la única página con botón de
comprar**, así que el embudo terminaba en un mensaje de confirmación.

Ahora lleva directo a la historia. El correo sigue saliendo: es la vuelta, no la entrada.

Y de paso, los errores. El formulario respondía «no hemos podido guardarlo» a todo — incluido el
tope diario, el tope por visitante y un valor que el catálogo rechaza, que son tres cosas distintas
y el servidor ya escribía un mensaje bueno para cada una. Ahora se enseña el del servidor.

## SEGUNDA incidencia de privacidad, la misma regla (2026-08-22)

En agosto se encontró el nombre real del menor dentro de cada descripción de escena, se corrigió
**ahí**, y se dio por hecho que eso era la corrección entera. No lo era. Dos semanas después seguía
en dos sitios más, y esta vez lo encontró una revisión de las páginas legales, no una alarma:

| Dónde | Qué mandaba | A quién |
|---|---|---|
| `lib/prompt-script.js` | `PROTAGONISTA: Nerea, 15 años` y el nombre del secundario | MiniMax M3 **y** OpenRouter |
| `lib/style.js` `characterBlock()` | abría con `hero.name.toUpperCase()` | image-01, en cada hoja y cada viñeta |

Los tres proveedores, ninguno con DPA en la UE, con el nombre de pila de un menor. Y la página de
privacidad afirmaba a los clientes exactamente lo contrario.

**Dos veces es un patrón, y el patrón es que la regla vivía en la cabeza de la gente.** Parchear los
dos sitios arreglaba hoy y se rompía con el siguiente prompt que alguien escribiera. Así que ahora
es estructural (`lib/names.js`):

1. `pipelineOrder()` **enmascara al guardar**. Es la única función por la que pasa un pedido antes de
   almacenarse, así que desde que un trabajo existe su `order` ya lleva `{{NOMBRE}}`. Un constructor
   de prompts escrito el mes que viene no puede filtrar un nombre que nunca recibe.
2. Los nombres reales viven en `job.names`, un campo aparte que **ningún prompt lee**.
3. `assemble()` los devuelve — y es lo último que ocurre, cuando ya no queda ninguna llamada a un
   modelo. Lo que viene después (rotulador, PDF, visor) es código nuestro.
4. `characterBlock` ya no nombra a nadie: `THE PROTAGONIST is a 15-year-old girl…`. Un nombre no le
   dice nada a un modelo de imagen sobre una cara.

### El guardián

`node scripts/check-privacy.js` construye **los once prompts** que este producto puede enviar, con un
pedido real, y busca los nombres en las cadenas que irían por el cable. 11/11 limpios. Comprobado
además que **detecta** las dos versiones antiguas — un test verde que no puede ponerse rojo no vale
nada. Busca sin acentos y por límites de palabra, para que «Ana» no salte con «analiza»: un falso
positivo bloquea un cómic legítimo, que es como se acaba desactivando una comprobación.

## Lo que la página de privacidad prometía y no existía (2026-08-22)

«Los datos del pedido se borran a los 7 días si no hay compra, y a los 30 días si la hay.»
**No había nada que borrase nada.** Ni un cron, ni una función, ni una línea.

Ahora sí, en `/api/cron`, con dos relojes porque no son la misma promesa:

- **Sin comprar: 7 días** y se borra todo. Son datos que nos dieron y no necesitamos.
- **Comprado: 12 meses**, no 30 días. Cambié la promesa antes de implementarla: un cliente que paga
  14,99 € y pierde su cómic el día 31 es una reclamación garantizada, y 30 días era un número que
  nadie había pensado. Si prefieres otro, es una variable (`KEEP_PAID_DAYS`).
- Los blobs se borran **antes** que la fila. Al revés, una función que muera en medio deja las 78
  viñetas huérfanas en el bucket sin nada que apunte a ellas. Así solo puede quedar una fila sin
  blobs, que el siguiente barrido limpia.
- Probado: borra lo caducado (sin pagar de hace 9 días, pagado de hace 400) y **respeta lo vigente**.

## Páginas legales: identidad por variable de entorno (2026-08-22)

Los `{{NOMBRE}}` / `{{NIF}}` se han ido. La identidad del titular llega por `/api/config` desde
`LEGAL_NAME`, `LEGAL_NIF`, `LEGAL_ADDRESS` y `LEGAL_EMAIL`, y la rellena `assets/js/legal.js`.
Dos motivos: es tu dato personal y fiscal y **este repositorio es público**; y un marcador que llega
a un cliente es peor que un hueco honesto — se lee como un sitio abandonado, justo en la página
donde alguien va a teclear una tarjeta.

Sin configurar, la página dice «pendiente de completar» y **el panel lo marca como bloqueante**:
la LSSI art. 10 obliga a publicar quién vende, así que no es cosmética.

### Y dos frases que eran falsas

- Aviso legal: «se revisa antes de entregarlo». **No.** Tu decisión del 22-08 es que no hay revisión
  humana. Ahora lo dice: comprobaciones automáticas, entrega automática, y si algo sale mal se rehace.
- Privacidad: la afirmación sobre los nombres era cierta solo del modelo de imagen, y ni ahí del todo.
  Ahora es cierta de los tres proveedores y explica el mecanismo.

La retención que enseña la página se lee de `api/cron.js`, no está escrita dos veces: una promesa de
borrado y un borrador que no coinciden es exactamente el fallo que esto sustituye.

## El mismo cierre, en la mitad gratis (2026-08-22)

`lib/preview-job.js` no tenía el `claim` que sí puse en el render. Descuido, no criterio: el visor
sondea y el cron barre, así que dos llamantes ejecutaban el mismo paso dos veces — dos llamadas al
guionista, dos al editor, dos portadas dibujadas. Más barato por colisión que en la mitad de pago,
pero el mismo fallo y el mismo arreglo.

## La IP falseable: el mismo fallo, dos veces, en la misma función (2026-08-22)

Lo encontró la revisión de seguridad del push, no yo. Y es aleccionador porque **la segunda versión
la escribí arreglando la primera**:

1. La original leía `x-forwarded-for[0]` — la primera entrada es la que manda el CLIENTE.
2. La «corregida» leía `x-real-ip` **sin comprobar nada**, una línea por encima del razonamiento
   cuidadoso sobre la cadena. Sin cadena, sin proxy, sin verificación: mandas un valor distinto en
   cada petición y el tope por visitante desaparece.

Y encima con un comentario afirmando que el problema estaba resuelto, que es lo que hace que nadie
vuelva a mirarlo.

**Impacto real**: un atacante se comía las 120 vistas previas del día (unos 1,20 € de imagen) y los
clientes de verdad se encontraban «vuelve mañana». El techo global —el que puse esta misma tarde—
acotaba el gasto; lo que no acotaba era la denegación de servicio.

### La forma correcta

Ninguna de esas cabeceras vale nada salvo que un proxy nuestro las **sobrescriba**, y el código no
puede saber si hay uno delante: hay que decírselo. `TRUST_PROXY_HOPS` cuenta los saltos, por defecto
**1 en Vercel y 0 en todo lo demás**. Con 0, las cabeceras se ignoran enteras y se usa el socket.

El 1 de Vercel es seguro y está **verificado en su documentación**, no supuesto: Vercel *sobrescribe*
`x-forwarded-for` y no reenvía IPs externas, expresamente para impedir el falseo
(`vercel.com/docs/headers/request-headers`).

Y se cuenta desde el FINAL, no se coge la última sin más: con dos proxies, la última entrada es el
proxy interno y entonces todos los visitantes comparten una «IP» y el tope se vuelve global sin que
nadie se entere.

Probado en vivo: tres peticiones con tres `X-Real-IP` falsas distintas y el tope muerde tras la
primera.

### Y de paso, `baseUrlOf`

Construía la URL de vuelta de Stripe y los enlaces del correo desde la cabecera `Host`, que también
la pone el cliente. El daño estaba acotado —solo puedes envenenar tu propio pedido, porque el correo
va a la dirección que tú has dado— pero es la misma clase de error. Ahora el orden es:
`PUBLIC_BASE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → la cabecera, y esta última solo
cuando no hay proxy declarado (el caso de desarrollo). Si falta `PUBLIC_BASE_URL` detrás de un proxy,
lo avisa por consola.

## Lo que cuesta de verdad, medido (2026-08-22)

Un cómic entero por el camino de producción, con un medidor (`lib/meter.js`) al que reportan
`llm.js` e `images.js`. Ya no hay estimaciones: los proveedores dicen los tokens y las tarifas están
escritas con su fuente. Reproducible con `node scripts/measure-comic.js`.

«No contesta» — Bruno, 16-17, cazadores, oscuro, manga B/N. **16 páginas, 90 viñetas, 94 imágenes.**

| | Llamadas | Tiempo | Coste |
|---|---|---|---|
| Imágenes `image-01` | 94 | mediana 20,4 s | **0,3290 $** |
| Texto MiniMax M3 | 22 | 146 s | 0,0193 $ |
| Texto GPT-5 mini | 19 | 547 s | **0,0917 $** |
| | | **24 min** | **0,4399 $ = 0,405 €** |

### Lo que la medición desmintió

**La vista previa gratis costaba 0,105 €, no 0,01 €.** Diez veces lo escrito. Y como se REGALA, a una
conversión de 1 de cada 20 eso eran **2,10 € por venta**: el coste dominante del negocio no era el
cómic vendido, era el que se enseña gratis. La cifra del crítico llevaba dos correcciones al alza en
un solo día (de «menos de un céntimo» a ~0,02 $ estimados, y de ahí a **0,09 $ medidos**). Dos veces
me equivoqué por estimar en vez de medir; de ahí el medidor.

### El arreglo: el pulido de diálogo se paga cuando alguien paga

Los 16 pases de pulido eran **0,076 $ y 7,6 minutos**, el 83 % del coste de texto y el 68 % del
tiempo de la vista previa. Se han movido a `render-job` como primer paso de la máquina de pago.

Medido antes y después sobre la mitad gratis:

| | Antes | Después |
|---|---|---|
| Tiempo | 11 min 53 s | **3 min 2 s** |
| Coste | 0,114 $ | **0,030 $** |

Y por venta, con las 20 previas que hacen falta para una: **2,40 € → 0,92 €, un 62 % menos**, del
16 % del precio al 6,1 %.

Dos detalles del paso movido que no son obvios y están comentados en el código: trabaja sobre
`d.pages` (el desglose ENMASCARADO), no sobre `d.story`, porque la historia ya lleva los nombres
reales y esto es una llamada a un modelo; y rehace la historia con `assemble()` al terminar, así que
todo lo que viene después dibuja lo pulido.

### Lo que se probó y NO se cambió

Tres candidatos a optimización; solo pagó el primero. Los otros dos quedan escritos para que nadie
los vuelva a intentar a ciegas:

- **Pulir con MiniMax en vez de OpenRouter.** Deja el pulido en 0,008 $ en vez de 0,076 $, y MiniMax
  pule de verdad (cambia réplicas, algunas a mejor: *«El protocolo 7-C otra vez no cuadra»* →
  *«El 7-C no cuadra. Otra vez no.»*). Pero **el juez daba 2 antes y 2 después**, y con GPT-5 mini
  la nota subía de 2 a 3. Lo que abarató el pulido fue MOVERLO, no cambiar de proveedor: eso último
  ahorra 6,8 céntimos por venta y se lleva el único punto de calidad que teníamos en el diálogo.
  Descartado por decisión de JJ con el dato delante.
  · De paso quedó explicado por qué GPT-5 mini soltaba 2.300 tokens de salida por llamada y MiniMax
  94: el primero razona y **el razonamiento se paga a 2 $/M**. No pagábamos más pulido, pagábamos
  su reflexión.
- **Subir la concurrencia de imágenes de 3 a 6.** En una prueba corta parece que reduce el tiempo a
  la mitad (75 s → 38 s con 12 viñetas, cero fallos). **En carga sostenida no**: con 36 viñetas
  empieza a 1,78 s/viñeta y termina a 7,29 — cuatro veces más lenta. Cero fallos duros porque el
  reintento con espera los absorbe, pero el reintento convierte los fallos en cola. Proyectado a 90
  viñetas: 8,3 min contra 9,5. Un 13 %, no un 50 %. El techo es el límite del proveedor y por encima
  de tres solo se hace cola. **La concurrencia 3 estaba bien puesta.**
  · Lección de método: una prueba de 38 segundos no dice nada sobre un límite por minuto.
- **Reducir reintentos por JSON inválido.** Medido: 1 de 19 llamadas del escritor, 0,0009 $. No hay
  nada que rascar.

### Lo que NO mide `scripts/measure-comic.js`

Corre en un portátil en España. El tiempo de proveedor es el mismo en Vercel, pero la red no (las
funciones salen de `iad1`) y el almacén tampoco (aquí ficheros, allí Supabase, que añade una ida y
vuelta por paso). Para medir contra Vercel hace falta la `SUPABASE_SERVICE_ROLE_KEY`.

## Estado

- [x] Encuadre, target y regla de PI (2026-08-21)
- [x] Spike de imagen con MiniMax (`docs/spike-2026-08-21.md`)
- [x] Cómic completo de 14 páginas, de las dos formas, con coste y tiempos (`docs/demo-2026-08-22.md`)
- [x] Catálogo cerrado, pipeline de guion con crítico y validador (`docs/guion-2026-08-22.md`)
- [x] Pasada de pulido de diálogo (sustituye el 100 % de las réplicas señaladas; la nota sube de 2 a 3/5 y **ahí se atasca**)
- [x] Landing ES/EN con muestra real, formulario desde el catálogo y páginas legales de plantilla
- [x] Medidor de coste real (`lib/meter.js`) y `scripts/measure-comic.js` — se acabaron las estimaciones
- [x] Pulido de diálogo movido a la mitad de pago: coste por venta 2,40 € → 0,92 € (−62 %)
- [ ] **Subir el diálogo de 3/5 a 4/5** — sigue siendo el único suspenso vivo, y el pase de pulido
      que lo mueve de 2 a 3 es lo único que hay. Cambiarlo de proveedor ya está probado y no sirve.
- [x] Backend de la mitad gratis: `/api/preview`, `/api/job`, visor `/c/<token>`
- [x] Backend de la mitad de pago: `/api/checkout`, webhook de Stripe, render de 78 viñetas, PDF, correo, cron
- [x] Validador de imagen (`lib/panel-check.js`) — la última salida de modelo que no pasaba por un validador
- [x] Nombre y dominio elegidos: **MyOwnManga** / `myownmanga.com` (falta comprarlo)
- [x] Un pedido de pago REAL: hecho el 2026-08-27, y destapó que el render dependía de la
      pestaña del comprador. Arreglado con `lib/chain.js` (cada paso llama al siguiente)
- [ ] **Pasar la cuenta de Vercel a Pro** (decidido por JJ el 2026-08-27, pendiente de activar).
      Dos cosas de una: Hobby prohíbe el uso comercial y ya se está cobrando, y el cron nativo
      por minuto es lo que reanuda la cadena cuando Vercel la corta con el 508.
      **Al activarlo**, un solo cambio: en `vercel.json`, el cron de `/api/cron` pasa de
      `"0 3 * * *"` a `"* * * * *"`. NO se toca antes: en Hobby, Vercel RECHAZA el despliegue
      entero con `cron_jobs_limits_reached`. Mientras tanto un pedido pagado avanza cuatro
      pasos solo y luego espera al barrido de GitHub Actions, que en la práctica son horas.
- [x] Páginas legales sin marcadores: identidad por `LEGAL_*` (falta que JJ ponga los valores)
- [x] Borrado real a los 7 días / 12 meses, que la privacidad prometía y no existía
- [x] `lib/names.js` + `scripts/check-privacy.js` — ningún nombre real llega a ningún proveedor
- [x] Supabase: schema `comic` aplicado y verificado, con bucket privado y cierre anti-doble-dibujo
- [x] Panel de operación en `/admin` (mirar, no aprobar)
- [ ] Probar el adaptador de Supabase desde Node (falta `SUPABASE_SERVICE_ROLE_KEY`)
- [x] Turnstile (`lib/turnstile.js` + `/api/config`) — falta darle de alta las claves en Cloudflare
- [x] Tipografías OFL incrustadas en el PDF (Bangers + Barlow Condensed), 32 % más texto por línea
- [ ] Proyecto en Vercel y dominio apuntado
- [ ] Prueba de validación de 14 días (umbrales en `docs/mvp.md`)
- [ ] Fase 1 — el mínimo que cobra (solo si la prueba pasa)

## Convenciones

Las del portafolio: código y comentarios en inglés, textos de producto en español e inglés, nada de secretos en el repo, `out/` y `.env` ignorados. El repo git es el padre (`microsaas/`): **no crear repo anidado aquí**.
