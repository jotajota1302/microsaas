# Backlog de ideas — lo que NO se construye todavía

Ideas investigadas y puntuadas el 2026-08-20 que quedan en espera detrás de los tres proyectos activos (`viajeros/`, `cuentos/`, `kit-local/`). Cada una lleva su **disparador**: la condición que la saca del backlog. Detalle, cifras y fuentes en `portfolio-2026.md` §3. Cuando una se active, se le abre carpeta propia con `CLAUDE.md` + `docs/mvp.md` como las demás.

Regla: no se abre una idea nueva mientras haya 3 pruebas en curso. Primero se mata o se consolida una.

## Tier B — validar con landing o Etsy antes de escribir código

### B1. Canción-regalo + placa QR/onda sonora impresa en 3D
- **Qué**: canción personalizada con letra en español (cumpleaños, boda, San Valentín, Día de la Madre) entregada en una placa impresa con QR u onda sonora. Pago único 19-39 € + placa 29-49 €.
- **Evidencia**: Songfinch cobra 29,99 $ la canción instantánea y 249-399 $ la humana; Suno factura 300 M$/año; las placas Spotify son categoría top en Etsy. Ingresos de indies: sin verificar.
- **Bloqueo**: la API de música de MiniMax dejó de admitir nuevos usuarios el 20-08-2026. Sin proveedor de música con API y licencia comercial clara, no hay producto.
- **Disparador**: (1) confirmar que nuestra cuenta MiniMax conserva acceso a música, o encontrar alternativa con licencia comercial; y (2) `kit-local` tiene el generador de placas y la logística de envío rodando.
- **Prueba**: listar la placa en Etsy con 3 canciones de muestra; cero código hasta la primera venta.
- **Reutiliza**: host QR y generador STL de `kit-local`.

### B2. Photo wall de eventos por QR + vídeo-resumen IA
- **Qué**: los invitados suben fotos escaneando el QR de la mesa; al acabar, vídeo-resumen con música y álbum impreso de upsell. 39-79 € por evento.
- **Evidencia**: categoría con 8+ competidores (muchos gratis); nadie domina comunión/bautizo en España; un fundador indie reporta que los anfitriones pagarían por analítica de escaneos por mesa. Ingresos sin verificar.
- **Disparador**: host QR de `kit-local` en producción + temporada de bodas/comuniones (marzo-junio) por delante.
- **Prueba**: landing + 20 DMs a wedding planners y fotógrafos + 50 € en Meta España. Matar si < 10 eventos pagados en 60 días.
- **Reutiliza**: host QR, Storage de Supabase, pipeline de imagen/música.

### B3. Relieves y litofanías "diseño original" con IA para vendedores de Etsy
- **Qué**: foto → relieve o litofanía imprimible generada con IA; suscripción 5-50 $/mes para makers; fulfilment propio en España/UE.
- **Evidencia**: Etsy exige diseños originales desde junio de 2025 (los STL descargados no valen); tiendas de litofanías facturan 1.800-9.000 $/mes; ItsLitho cobra 5-50 $/mes. Competencia baja en software.
- **Disparador**: `kit-local` demuestra que sabemos vender a makers (≥ 200 descargas en MakerWorld) y tenemos cola de impresión.
- **Prueba**: 10 relieves de muestra en MakerWorld + DMs a 20 tiendas de litofanías en Etsy.
- **Reutiliza**: generador de mallas de `kit-local`, pipeline de imagen.

### B4. CV / LinkedIn → página de perfil → tarjeta 3D
- **Qué**: subes el PDF del CV o de LinkedIn, la IA monta tu página con vCard y QR dinámico, y te llevas la tarjeta impresa con hueco para NFC. 15-30 € + 19 €/año.
- **Evidencia**: el 31 % de los reclutadores ha escaneado un QR de un CV; pero la tarjeta digital tiene 200+ vendedores y 22 % de churn anual. El CV no cabe en el QR; LinkedIn no tiene API de perfil (se parsea el PDF exportado).
- **Disparador**: solo como **SKU de `kit-local`** si alguien lo pide desde la tienda. No abrir carpeta propia.
- **Reutiliza**: todo de `kit-local` + extracción estructurada de PDF de `viajeros`.

## Tier C — regulatorio, oportunista (España)

### C1. Checker "¿Estoy obligado a Verifactu?" + asistente IA + comparador de software
- **Qué**: responde con las FAQ de la AEAT si te afecta (manual/Excel, recargo, foral, SII), desde cuándo (sociedades 1-ene-2027, autónomos 1-jul-2027) y qué programa te vale; monetiza por afiliación (Billin, Contasimple, Holded) y leads a gestorías.
- **Evidencia**: confusión masiva documentada (ATA, Fedepesca, el "agujero Excel"); cero responsabilidad de productor; coste nulo.
- **Disparador**: calendario. Publicar entre **septiembre y diciembre de 2026** para que rankee antes del pico enero-julio 2027. Es un activo SEO de 2-3 días de trabajo, no un producto: se hace cuando haya un hueco entre pruebas.
- **Límite duro**: nunca emitir facturas ni generar QR Verifactu (prohibido fuera de un sistema certificado).
- **Reutiliza**: plantilla de landing.

### C2. Informe de huella de carbono alcances 1+2 a partir de facturas PDF
- **Qué**: facturas de luz, gas y gasóleo → la IA extrae consumos → huella con factores oficiales MITECO + plan de reducción + VSME básico, en el formato que pide un pliego, un banco (Eco-Track) o un cliente grande. 49-149 € por informe.
- **Evidencia**: hueco de precio real bajo Manglai (cientos €/mes) y Zeolos (4.400 €); la micro solo paga cuando se lo exigen → compra puntual, no suscripción.
- **Disparador**: ≥ 3 peticiones entrantes (de clientes de `viajeros`/`kit-local` o de gestorías) o un pliego concreto que lo pida. Validar con 30 emails a pymes que licitan con la AGE y a 10 gestorías; construir al tercer "sí".
- **Límites**: siempre "estimación con factores oficiales, no verificada"; nunca sellos ni etiquetas de "sostenible"/"neutro" (práctica desleal desde el 27-09-2026 sin certificación de tercero).
- **Reutiliza**: extracción estructurada de PDF de `viajeros`.

### C3. Migración Excel/Word → software de facturación certificado
- **Qué**: la IA lee facturas históricas, clientes y productos en Excel/Word y los carga por API en el programa certificado que elija el autónomo (Billin, Holded, Contasimple). Pago único 29-79 € + afiliación. **No emite facturas.**
- **Evidencia**: 3,4 M de autónomos con fecha límite, muchos analógicos; el programa destino es el productor responsable.
- **Disparador**: acuerdo de afiliación/API con al menos un SIF + primavera de 2027 (el pico de migraciones). Zona gris si el flujo se acerca a "emitir": no cruzar esa línea.
- **Reutiliza**: extracción estructurada de `viajeros`, landing de C1.

## Tier D — el upsell recurrente

### D. Agente de atención por Telegram / WhatsApp oficial (OpenClaw aislado por cliente)
- **Qué**: contesta reservas, horarios, FAQ y estado de pedido para un negocio local. 49-99 €/mes. Una instancia por cliente en VPS propio, un solo canal, herramientas de solo lectura; lo que escribe pasa por nuestro backend con validación.
- **Disparador**: `kit-local` con **≥ 5 negocios pagando Pro**. Está en su `CLAUDE.md` como Fase 5.
- **Prohibido**: usar la instancia personal de OpenClaw; puentes no oficiales de WhatsApp para clientes.

## Ideas de la conversación que se descartaron (y por qué, para no volver)

- **Mensajes cifrados por QR para WhatsApp** — WhatsApp ya cifra de extremo a extremo; la clave tendría que viajar por otro canal; fricción alta; ads + privacidad no casan.
- **Generador de QR → STL genérico** — cinco herramientas gratuitas y buenas (QRCode2STL open source, PrintPal, GenQRCode, PrivQR, Omnvert); Hovercode con 5.000 visitas/día ingresa ~150 $/mes.
- **Tarjeta digital NFC como producto** — 200+ vendedores, 22 % de churn; queda como SKU (B4).
- **Carta digital para restaurantes como producto** — 10-30 €/mes, competencia española masiva; es un módulo del kit local.
- **Retratos IA / headshots genéricos** — mercado cerrado por Lensa, PhotoAI, HeadshotPro; solo nichos muy concretos.
- **Herramientas gratuitas con anuncios como modelo** — RPM 0,5-3 € en España; AI Overviews han bajado el CTR del 15 % al 8 %; ningún caso de éxito vive de ads.
- **Lifetime deals / AppSumo** — se quedan el 70 %, ventas −50 % 2024-25, cada cliente LTD es soporte a 0 € para siempre.
- **Ser productor de software de facturación Verifactu** — declaración responsable por versión, 150.000 € de sanción por ejercicio y sistema, responsabilidad personal; mercado ya a 6-10 €/mes y app gratuita de la AEAT.
- **Badge "web carbono neutral" / etiquetas de sostenibilidad propias** — saturado y, desde el 27-09-2026, práctica desleal sin certificación de tercero.
- **Depender de Kit Digital** — cerrado desde el 31-10-2025; sin categoría de huella ni ESG.
- **Overlays de accesibilidad (EAA)** — la Comisión los rechaza como cumplimiento; las microempresas están exentas.
- **Digital Product Passport (QR)** — demasiado pronto (baterías feb-2027, textil ~2028); a lo sumo una página SEO "DPP-ready".

## Semillas sin investigar (anotar aquí lo que surja)

- Música: herramientas clásicas con SEO en español (afinador, metrónomo, transportar acordes) como activos SEO de bajo coste; visualizador de música para músicos (Vibely, 1.300 $/mes verificado).
- Imagen: foto de carnet para DNI/pasaporte (32×26 mm, normas de la Policía), gratis con anuncios y 1 € la hoja 10×15 para imprimir; HEIC → JPG; redimensionar para Instagram.
- Local: calculadora de huella de impresiones 3D (filamento + kWh + envío) como lead-magnet para makers, no como SaaS.
- España: vertical de tickets para peluquería/hostelería (donde la app gratuita de la AEAT no sirve) vía API de un SIF certificado; solo si C3 funciona y sin convertirnos en productor.
