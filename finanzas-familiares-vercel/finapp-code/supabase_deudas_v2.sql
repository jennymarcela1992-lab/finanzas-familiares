-- =====================================================================
-- DEUDAS v2: editar créditos, tipo de tasa, seguros, abonos extra
-- Correr UNA vez en Supabase: SQL Editor -> New query -> pegar -> Run.
-- Se puede volver a correr sin problema: no borra datos.
-- =====================================================================

-- 1. Datos nuevos del crédito
alter table deudas add column if not exists tipo_tasa text default 'MV';
alter table deudas add column if not exists seguro_mensual numeric default 0;
alter table deudas add column if not exists fecha_primer_pago date;
alter table deudas add column if not exists dia_pago int;

-- 2. Seguros dentro de cada cuota
alter table cuotas_deuda add column if not exists seguro numeric default 0;
alter table cuotas_deuda add column if not exists fecha_pago date;

-- 3. Abonos extra a capital
create table if not exists abonos_deuda (
  id uuid primary key default gen_random_uuid(),
  deuda_id uuid references deudas(id) on delete cascade,
  fecha date not null default current_date,
  valor numeric not null check (valor > 0),
  modalidad text not null check (modalidad in ('plazo', 'cuota')),
  nota text,
  registrado_por text,
  creado_en timestamptz default now()
);
alter table abonos_deuda enable row level security;

-- 4. Permisos que faltaban: editar y eliminar deudas, borrar cuotas, y manejar abonos
drop policy if exists "usuarios autenticados editan deudas" on deudas;
create policy "usuarios autenticados editan deudas" on deudas for update using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados borran deudas" on deudas;
create policy "usuarios autenticados borran deudas" on deudas for delete using (auth.role() = 'authenticated');

drop policy if exists "usuarios autenticados borran cuotas" on cuotas_deuda;
create policy "usuarios autenticados borran cuotas" on cuotas_deuda for delete using (auth.role() = 'authenticated');

drop policy if exists "usuarios autenticados ven abonos de deuda" on abonos_deuda;
create policy "usuarios autenticados ven abonos de deuda" on abonos_deuda for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean abonos de deuda" on abonos_deuda;
create policy "usuarios autenticados crean abonos de deuda" on abonos_deuda for insert with check (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados borran abonos de deuda" on abonos_deuda;
create policy "usuarios autenticados borran abonos de deuda" on abonos_deuda for delete using (auth.role() = 'authenticated');
