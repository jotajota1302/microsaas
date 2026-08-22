# Páginas legales — qué falta y qué ya no

Las tres páginas **ya no tienen marcadores**. La identidad del titular llega en tiempo de ejecución
desde `/api/config`, que la lee de variables de entorno. No hay nada que editar en el HTML.

## Lo único que falta: poner los valores

En el proyecto de Vercel (y en `.env` para local):

    LEGAL_NAME=...        nombre y apellidos, o razón social
    LEGAL_NIF=...
    LEGAL_ADDRESS=...     domicilio a efectos de notificaciones
    LEGAL_EMAIL=...       correo de contacto

Sin ellos las páginas dicen «pendiente de completar» y el panel `/admin` lo marca como **bloqueante**:
la LSSI art. 10 obliga a publicar quién vende, así que esto no es cosmética.

## Lo que ya está resuelto

- **Borrado real**: 7 días sin compra, 12 meses con compra. Lo hace `/api/cron` y la página lee los
  plazos de ahí, no están escritos dos veces.
- **Nombres**: ningún nombre real llega a ningún proveedor de IA (`lib/names.js`), y hay una
  comprobación automática que lo verifica (`node scripts/check-privacy.js`).
- **Desistimiento**: el consentimiento de entrega inmediata lo recoge la propia pantalla de Stripe
  (`consent_collection[terms_of_service]`), que es el lado que tendría que probarlo en una devolución.

## Lo que sigue siendo tuyo, no del código

- Alta en Hacienda (modelo 036) antes de la primera venta.
- Registro de actividades de tratamiento (Facilita_RGPD de la AEPD).
- DPA con los proveedores. **Hoy ninguno recibe datos personales**, que es la razón por la que esto no
  bloquea: verificado por `scripts/check-privacy.js`, no por buena voluntad.
