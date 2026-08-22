# Desplegar MyOwnManga

Estado a 22-08-2026: **nada de esto está publicado**. `comic/` no está ni en git (90 ficheros sin
commitear), no hay proyecto en Vercel, y el dominio no está comprado. Lo que sigue es todo lo que
falta, en el orden en que hay que hacerlo.

Los despliegues van por **`git push`**, nunca con `vercel --prod` desde esta carpeta (regla del
portafolio: la CLI desde dentro de un proyecto ha subido carpetas equivocadas antes).

---

## 0. Antes de nada: el plan de Vercel

La cuenta está en **Hobby**. `../CLAUDE.md` ya decidió que eso no vale: **Hobby prohíbe el uso
comercial**, y esto cobra 14,99 €. Hay que pasar a **Pro** (20 $/mes, un asiento) antes de vender.

Y hay una segunda cosa que **hay que comprobar**, porque no la he podido verificar y afecta al
funcionamiento, no solo a las condiciones: **con qué frecuencia deja tu plan ejecutar un cron**.
`vercel.json` pide `*/5 * * * *`. El cron es lo que termina un cómic cuando el comprador cierra la
pestaña; si el plan solo permite uno diario, un pedido pagado puede quedarse a medias hasta 24 h.
Si resulta ser así, la salida es que `/api/render` lo empuje el propio visor (ya lo hace) y avisar en
el correo de «lo estamos dibujando», no dejar el cron mintiendo.

Activa **Spend Management** en cuanto crees el proyecto.

## 1. Subir el código

```
cd IDEAS/microsaas
git add comic/
git commit -m "feat(comic): MyOwnManga, de la landing al PDF entregado"
git push
```

Comprobado que **no se sube nada sensible**: `.env`, `node_modules/`, `out/` y `.vercel/` están en
`comic/.gitignore`. Los correos que aparecen en el código son el nuestro o inventados, y los nombres
de `stories/` y `orders/` son ficticios. El repo es público: si algún día entra un pedido real en
`out/`, sigue estando ignorado.

## 2. Crear el proyecto en Vercel

Un proyecto **por producto**, apuntando al mismo repo que `cuentos`:

- Repositorio: `jotajota1302/microsaas`
- **Root Directory: `comic`** ← lo importante; sin esto despliega la raíz
- Framework preset: **Other** (no hay build; es HTML y funciones)
- Build Command: vacío · Output Directory: vacío · Install Command: `npm install`

## 3. Las variables de entorno

Ocho son **obligatorias**: sin ellas el panel `/admin` lo marca en rojo y el producto no funciona o
no se puede vender legalmente.

| Variable | Para qué | Dónde se saca |
|---|---|---|
| `MINIMAX_API_KEY` | guion + dibujo | la que ya usas, en `.env` local |
| `OPENROUTER_API_KEY` | el editor y el pulido de diálogo | openrouter.ai |
| `STRIPE_SECRET_KEY` | cobrar | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | creer que se ha pagado | al dar de alta el webhook (paso 4) |
| `RESEND_API_KEY` | entregar | resend.com · **sin esto nadie recibe su cómic** |
| `EMAIL_FROM` | remitente | `MyOwnManga <hola@myownmanga.com>` |
| `PUBLIC_BASE_URL` | enlaces del correo | `https://myownmanga.com` |
| `ADMIN_TOKEN` | entrar al panel | inventa uno largo |
| `LEGAL_NAME` `LEGAL_NIF` `LEGAL_ADDRESS` `LEGAL_EMAIL` | LSSI art. 10 | tus datos |
| `SUPABASE_URL` `SUPABASE_SERVICE_ROLE_KEY` | almacén real | Supabase → Project settings → API |
| `STORE=supabase` `BLOBS=supabase` | usar Supabase y no ficheros | literal |

Recomendables, no obligatorias:

| Variable | Efecto si falta |
|---|---|
| `CRON_SECRET` | `/api/cron` queda abierto: «gástame el presupuesto» para quien lo encuentre |
| `TURNSTILE_SITE_KEY` `TURNSTILE_SECRET_KEY` | nada distingue a una persona de un script en un formulario que gasta dinero |
| `IP_SALT` | el hash de IP usa la sal de desarrollo |
| `EMAIL_REPLY_TO` | las respuestas van al remitente |
| `STRIPE_MANAGED_PAYMENTS=1` | Stripe no es el vendedor y **el IVA es nuestro** |

Topes de gasto, con valores por defecto razonables ya puestos:
`MAX_PREVIEWS_PER_DAY` (120), `MAX_PREVIEWS_PER_IP` (3), `MAX_HOLES` (2),
`KEEP_UNPAID_DAYS` (7), `KEEP_PAID_DAYS` (365).

## 4. Stripe

1. Cuenta activada y verificada (tarda: hazlo pronto).
2. **Managed Payments**: mira si tu cuenta española es elegible. Si lo es, `STRIPE_MANAGED_PAYMENTS=1`
   y Stripe se ocupa del IVA de 80 países. Si no, es una venta normal y el IVA lo declaras tú.
3. Webhook: **Developers → Webhooks → Add endpoint**
   - URL: `https://myownmanga.com/api/webhook-stripe`
   - Evento: **`checkout.session.completed`** (solo ese)
   - Copia el *signing secret* a `STRIPE_WEBHOOK_SECRET`.
4. Prueba con `sk_test_` antes de tocar dinero real: el panel avisa de que está en modo prueba.

## 5. Cloudflare Turnstile

Dashboard → Turnstile → Add site → dominio `myownmanga.com`. Copia las dos claves. Hasta que
existan, el filtro **no se exige** y el formulario funciona igual.

## 6. Los dominios

- `myownmanga.com` — el principal.
- `mipropiomanga.com` — comprado y **redirigido** al anterior.

## 7. Comprobar que está vivo

```
curl -s https://myownmanga.com/api/config
curl -s -H "X-Admin-Token: $ADMIN_TOKEN" https://myownmanga.com/api/admin | jq .health.missing
```

`health.missing` tiene que salir **vacío**. Después: un pedido de verdad con `sk_test_`, de punta a
punta, que es lo único de todo esto que sigue sin probarse nunca.

## 8. Lo que no es de Vercel y bloquea igual

- **Modelo 036** en Hacienda antes de la primera venta.
- Registro de actividades de tratamiento (Facilita_RGPD de la AEPD).
- Facturación compatible con Verifactu — obligatorio para autónomos desde el 1-jul-2027, pero la
  primera factura hay que emitirla bien desde el principio.
