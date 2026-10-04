-- =====================================================================
-- FOTOS DE COMPROBANTES (privadas)
-- Correr UNA vez en Supabase: SQL Editor -> New query -> pegar -> Run.
-- Se puede volver a correr sin problema: no borra datos.
-- =====================================================================

-- 1. Columnas que usa la pantalla de Gastos (solo se crean si faltan)
alter table gastos add column if not exists valor_cop numeric;
alter table gastos add column if not exists comprobante_url text;
alter table gastos add column if not exists borrado boolean default false;
alter table gastos add column if not exists fecha_borrado timestamptz;
alter table gastos add column if not exists borrado_por text;
alter table gastos add column if not exists restaurado_por text;
alter table gastos add column if not exists restaurado_en timestamptz;

-- 2. Espacio PRIVADO para las fotos (maximo 10 MB por foto, solo imagenes)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes', 'comprobantes', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. Permisos: solo usuarios con sesion iniciada pueden ver, subir y borrar fotos
drop policy if exists "comprobantes: ver" on storage.objects;
create policy "comprobantes: ver" on storage.objects
  for select to authenticated using (bucket_id = 'comprobantes');

drop policy if exists "comprobantes: subir" on storage.objects;
create policy "comprobantes: subir" on storage.objects
  for insert to authenticated with check (bucket_id = 'comprobantes');

drop policy if exists "comprobantes: cambiar" on storage.objects;
create policy "comprobantes: cambiar" on storage.objects
  for update to authenticated using (bucket_id = 'comprobantes');

drop policy if exists "comprobantes: borrar" on storage.objects;
create policy "comprobantes: borrar" on storage.objects
  for delete to authenticated using (bucket_id = 'comprobantes');
