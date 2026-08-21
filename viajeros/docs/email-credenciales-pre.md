# Borrador — Solicitud de credenciales de preproducción a SES.Hospedajes

**Enviar cuanto antes: es el camino crítico más largo del proyecto.** Sin entorno de pruebas no se puede validar el envío real, y la respuesta del Ministerio no depende de nosotros.

- **Para**: ses.hospedajes@interior.es
- **De**: el correo que vaya a quedar asociado al proyecto (no una cuenta personal desechable)
- **Asunto**: Solicitud de acceso al entorno de preproducción del servicio web de Hospedajes

---

Buenos días,

Estoy desarrollando una aplicación de comunicación de partes de viajeros para pequeños alojamientos turísticos, que se integrará con SES.Hospedajes mediante el servicio web descrito en el documento «Interfaz servicios externos – Servicio de Comunicación Hospedajes» (v3.1.3, de 08/01/2025).

Para poder probar la integración sin afectar al entorno real, les agradecería que me indicaran:

1. Cómo solicitar **credenciales de acceso al entorno de preproducción** (`https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion`): usuario, contraseña y código de arrendador de pruebas, así como un código de establecimiento de pruebas.
2. Si es necesario descargar algún **certificado** concreto para la conexión TLS con el entorno de preproducción, y dónde obtenerlo, dado que la cadena de confianza corresponde a la FNMT-RCM y no viene incluida por defecto en los entornos de desarrollo habituales.
3. Si existe una **versión de la especificación posterior a la v3.1.3** o alguna nota técnica reciente que deba tener en cuenta.
4. Si el Ministerio mantiene algún **registro o comunicación previa de aplicaciones informáticas** de terceros que envíen comunicaciones en nombre de los arrendadores, o si basta con identificar la aplicación en el campo `aplicacion` de la cabecera de la petición.

Quedo a su disposición para cualquier información adicional que necesiten sobre el proyecto.

Muchas gracias por su ayuda.

Un saludo,
{Nombre y apellidos}
{NIF}
{Teléfono}
{Correo}

---

## Notas para el seguimiento

- Si en **10 días hábiles** no hay respuesta, reenviar y, en paralelo, buscar el contacto por el formulario de la sede electrónica del MIR.
- Mientras tanto **no se bloquea nada**: las fases de núcleo (validador + XML + SOAP) y de check-in del huésped se construyen enteras sin credenciales, y la fase 2 ya entrega valor exportando el fichero XML para subirlo al alta masiva de la sede.
- Cuando lleguen las credenciales: **nunca** al repositorio (es público). Van a `.env` local y a las variables de entorno de Vercel. Ya ha habido credenciales de SES filtradas en pastes públicos.
- Primera prueba en preproducción, en este orden: `catalogo` (comprueba autenticación sin escribir nada) → `comunicacion` con un parte sintético → `consultaLote` → `anulacionLote`.
