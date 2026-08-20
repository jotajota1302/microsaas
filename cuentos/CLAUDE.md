# Proyecto: Cuentos y páginas para colorear personalizados

Micro-SaaS B2C, español primero (y en inglés): cuentos infantiles personalizados (nombre, rasgos, mascota, afición del niño) generados como JSON validado + ilustraciones de estilo fijo, entregados en PDF y como **libro impreso** por POD europeo; y páginas para colorear por créditos. Reutiliza el motor del RPG (`../../rpg-narrativo/`): IA que genera datos bajo schema, validador, catálogo de estilo de imágenes MiniMax.

**Lee antes de nada**: `docs/mvp.md` y `../CLAUDE.md` (stack, privacidad con IA, legal: autoridad compartida con `viajeros/` y `kit-local/`). Investigación con fuentes: `../docs/portfolio-2026.md` (§3 A2). Motor a reutilizar: `../../rpg-narrativo/api/generate.js`, `lib/validate-chapter.js`, `lib/asset-catalog.js`, `scripts/generate-assets.js`.

## Primer paso de la sesión

Usar `superpowers:brainstorming` para cerrar con JJ: formato del cuento (páginas, longitud), estilo visual único, qué se personaliza y qué no, y el POD. Luego construir el **mínimo que cobra**: landing ES/EN + 1 cuento de muestra + generación de 1 cuento personalizado de pago. La validación de 2 semanas está en `docs/mvp.md` §6.

## Decisiones ya tomadas (no reabrir sin preguntar)

- **Sin fotos del niño en el MVP.** Personalización por texto (nombre, pelo, gafas, mascota, afición). Enviar la foto de un menor a MiniMax (sin DPA, datos en EE. UU./Singapur) está prohibido por `../CLAUDE.md`. Si más adelante se quiere parecido real, proveedor con DPA en la UE y consentimiento explícito.
- **El nombre del niño no viaja a la IA**: se genera el cuento con un marcador (`{{NOMBRE}}`) y se sustituye en el servidor al renderizar. Así el prompt no contiene datos personales.
- **Precio**: cuento digital PDF **4,99 €**; libro impreso **24,90 €** (envío aparte); páginas para colorear **4,99 € / 20 créditos**. Una vista previa gratis (primeras 2 páginas con marca de agua), nada más gratis. Cobro digital por **MoR** (Polar / Stripe Managed Payments); impreso por Stripe o checkout del POD.
- **Estilo visual único y fijo** por colección (como la tinta gótica del RPG): prompts con el mismo sufijo de estilo, personaje descrito igual en todas las páginas; el validador comprueba que cada página trae `image_hint` y que el cuento cumple estructura (planteamiento, problema, intento, resolución, moraleja suave).
- **Contenido**: lista de temas permitidos y filtro de prompts; nada de violencia, miedo intenso ni marcas. Revisión automática del texto por el modelo (segunda pasada) + muestreo manual al principio.
- **Colorear**: image-01 con prompt de line-art + umbralizado a blanco y negro puro en servidor (sharp/canvas) + PDF A4. Galería pre-generada gratuita como activo SEO ("dibujos para colorear de {tema}"); lo personalizado es de pago.
- Stack: vanilla + Vercel Pro + Supabase compartido (schema `cuentos`) + MiniMax PAYG. Sin frameworks.

## Fases (cada una termina usable)

1. Cuento de muestra + landing con precio + checkout; prueba de 2 semanas.
2. Generación personalizada de pago: formulario → JSON validado → imágenes → PDF → email con enlace de descarga (expira). Reintentos y fallback a ilustración de catálogo si una imagen falla (como el RPG).
3. Libro impreso vía API de POD (ver `docs/mvp.md` §4) con QR al cuento digital (QR dinámico de `kit-local` cuando exista).
4. Páginas para colorear: galería SEO + generador por créditos.
5. SEO programático ES/EN (temas × edades), vídeo corto, afiliados de blogs de crianza.

## Estado

- [x] Investigación de mercado y ranking (2026-08-20)
- [ ] Fase 1 — muestra + landing + checkout (prueba: __ visitas / __ altas / __ pagos)
- [ ] Fase 2 — generación de pago
- [ ] Fase 3 — impreso
- [ ] Fase 4 — colorear
- [ ] Fase 5 — SEO y canales

Al completar una fase, actualiza este checklist. Lo que afecte a los tres proyectos va en `../CLAUDE.md`.

## Convenciones

- Código y comentarios en inglés; textos del producto en español e inglés.
- Esquema JSON del cuento en `schema/`; el validador es la única puerta hacia el render.
- Coste objetivo por cuento generado < 0,25 € (texto + 8-12 imágenes).
- El repo git es el padre (`microsaas/`); no crear repos anidados. Repo público: nada de secretos ni datos reales.
