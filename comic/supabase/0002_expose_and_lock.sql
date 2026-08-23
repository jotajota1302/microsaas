-- Dos cosas que la primera migración dejó a medias, y que solo aparecieron al
-- ejecutar el adaptador contra la base de verdad. El SQL estaba bien; lo que
-- faltaba era todo lo que hay entre Postgres y el cliente.

-- 1. Crear un schema NO lo expone en la API. PostgREST solo sirve los que
--    están en esta lista, y sin esto el cliente falla con un error VACÍO, que
--    es de los peores de diagnosticar.
--    La lista se reescribe entera porque el parámetro no admite append: los
--    otros cinco valores son los que ya había y se conservan tal cual, porque
--    este proyecto lo comparten varias apps y quitar uno las deja sin API.
alter role authenticator set pgrst.db_schemas = 'public, storage, ai_agents, falm, cuentos, comic';

-- 2. El cierre se reclamaba con un filtro `or` de PostgREST:
--      or=(locked_until.is.null, locked_until.lt.<ahora ISO>)
--    y PostgREST no lo parsea: el ISO 8601 lleva puntos, que son su separador
--    de filtros, y responde "column previews.locked_until does not exist" — un
--    mensaje que apunta al sitio equivocado.
--
--    En vez de pelear con el parser se quita el `or`: "libre" deja de ser NULL
--    y pasa a ser una fecha imposible, así que la condición es un único `lt`.
update comic.previews set locked_until = timestamptz 'epoch' where locked_until is null;

alter table comic.previews
  alter column locked_until set default timestamptz 'epoch',
  alter column locked_until set not null;

comment on column comic.previews.locked_until is
  'Reclamado por quien está avanzando el trabajo. `epoch` significa libre: un centinela en vez de NULL para que la reclamación sea un solo filtro y no un `or` que PostgREST no sabe leer.';

-- Config y esquema son dos cachés distintas y hacen falta las dos: la primera
-- para que sepa que el schema existe, la segunda para que vea sus columnas.
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
