-- ============================================================
-- FINANZAS FAMILIARES — SQL COMPLETO (todas las tablas)
-- Puedes correr este archivo completo de una sola vez.
-- Es seguro ejecutarlo más de una vez: no falla si algo ya existe.
-- ============================================================

-- 1. USUARIOS -------------------------------------------------
create table if not exists usuarios (
  id uuid primary key references auth.users(id),
  nombre text,
  email text,
  creado_en timestamp default now()
);
alter table usuarios enable row level security;
drop policy if exists "usuarios pueden ver su propio perfil" on usuarios;
create policy "usuarios pueden ver su propio perfil" on usuarios for select using (auth.uid() = id);
drop policy if exists "usuarios pueden crear su propio perfil" on usuarios;
create policy "usuarios pueden crear su propio perfil" on usuarios for insert with check (auth.uid() = id);

-- 2. GASTOS -----------------------------------------------------
create table if not exists gastos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  item text not null,
  valor numeric not null,
  moneda text default 'COP',
  usuario_pago_id uuid references auth.users(id),
  usuario_pago_nombre text,
  persona_asociada text,
  es_compartido boolean default true,
  rubro text,
  metodo_pago text,
  nota text,
  es_recurrente boolean default false,
  creado_en timestamp default now()
);
alter table gastos enable row level security;
drop policy if exists "usuarios autenticados ven todos los gastos" on gastos;
create policy "usuarios autenticados ven todos los gastos" on gastos for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean gastos" on gastos;
create policy "usuarios autenticados crean gastos" on gastos for insert with check (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados editan gastos" on gastos;
create policy "usuarios autenticados editan gastos" on gastos for update using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados borran gastos" on gastos;
create policy "usuarios autenticados borran gastos" on gastos for delete using (auth.role() = 'authenticated');

-- 3. AHORROS ------------------------------------------------------
create table if not exists metas_ahorro (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  moneda text default 'COP',
  monto_objetivo numeric not null,
  creado_en timestamp default now()
);
create table if not exists aportes_ahorro (
  id uuid primary key default gen_random_uuid(),
  meta_id uuid references metas_ahorro(id) on delete cascade,
  usuario_id uuid references auth.users(id),
  usuario_nombre text,
  monto numeric not null,
  fecha date not null default current_date,
  nota text,
  creado_en timestamp default now()
);
alter table metas_ahorro enable row level security;
alter table aportes_ahorro enable row level security;
drop policy if exists "usuarios autenticados ven metas" on metas_ahorro;
create policy "usuarios autenticados ven metas" on metas_ahorro for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean metas" on metas_ahorro;
create policy "usuarios autenticados crean metas" on metas_ahorro for insert with check (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados ven aportes" on aportes_ahorro;
create policy "usuarios autenticados ven aportes" on aportes_ahorro for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean aportes" on aportes_ahorro;
create policy "usuarios autenticados crean aportes" on aportes_ahorro for insert with check (auth.role() = 'authenticated');

-- 4. DEUDAS Y CRÉDITOS --------------------------------------------
create table if not exists deudas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  valor_inicial numeric not null,
  tasa_interes numeric not null,
  plazo_meses int not null,
  entidad_pago text,
  numero_cuenta text,
  alias_pago text,
  dias_aviso_previo int default 3,
  fecha_inicio date not null default current_date,
  creado_en timestamp default now()
);
create table if not exists cuotas_deuda (
  id uuid primary key default gen_random_uuid(),
  deuda_id uuid references deudas(id) on delete cascade,
  numero_cuota int not null,
  cuota_total numeric not null,
  capital numeric not null,
  interes numeric not null,
  saldo numeric not null,
  fecha_vencimiento date not null,
  estado text default 'pendiente',
  pagada_por text,
  fecha_pago date
);
alter table deudas enable row level security;
alter table cuotas_deuda enable row level security;
drop policy if exists "usuarios autenticados ven deudas" on deudas;
create policy "usuarios autenticados ven deudas" on deudas for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean deudas" on deudas;
create policy "usuarios autenticados crean deudas" on deudas for insert with check (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados ven cuotas" on cuotas_deuda;
create policy "usuarios autenticados ven cuotas" on cuotas_deuda for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean cuotas" on cuotas_deuda;
create policy "usuarios autenticados crean cuotas" on cuotas_deuda for insert with check (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados actualizan cuotas" on cuotas_deuda;
create policy "usuarios autenticados actualizan cuotas" on cuotas_deuda for update using (auth.role() = 'authenticated');

-- 5. PRÉSTAMOS PERSONALES -------------------------------------------
create table if not exists prestamos_personales (
  id uuid primary key default gen_random_uuid(),
  quien_presta text not null,
  quien_recibe text not null,
  monto numeric not null,
  fecha date not null default current_date,
  motivo text,
  creado_en timestamp default now()
);
create table if not exists abonos_prestamo (
  id uuid primary key default gen_random_uuid(),
  prestamo_id uuid references prestamos_personales(id) on delete cascade,
  monto numeric not null,
  fecha date not null default current_date,
  nota text
);
alter table prestamos_personales enable row level security;
alter table abonos_prestamo enable row level security;
drop policy if exists "usuarios autenticados ven prestamos" on prestamos_personales;
create policy "usuarios autenticados ven prestamos" on prestamos_personales for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean prestamos" on prestamos_personales;
create policy "usuarios autenticados crean prestamos" on prestamos_personales for insert with check (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados ven abonos" on abonos_prestamo;
create policy "usuarios autenticados ven abonos" on abonos_prestamo for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean abonos" on abonos_prestamo;
create policy "usuarios autenticados crean abonos" on abonos_prestamo for insert with check (auth.role() = 'authenticated');

-- 6. INGRESOS Y NÓMINA -------------------------------------------------
create table if not exists nomina_mensual (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id),
  usuario_nombre text,
  mes text not null,
  sueldo_bruto numeric not null,
  creado_en timestamp default now()
);
create table if not exists deducciones_nomina (
  id uuid primary key default gen_random_uuid(),
  nomina_id uuid references nomina_mensual(id) on delete cascade,
  nombre text not null,
  monto numeric not null
);
alter table nomina_mensual enable row level security;
alter table deducciones_nomina enable row level security;
drop policy if exists "usuarios autenticados ven nomina" on nomina_mensual;
create policy "usuarios autenticados ven nomina" on nomina_mensual for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean nomina" on nomina_mensual;
create policy "usuarios autenticados crean nomina" on nomina_mensual for insert with check (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados ven deducciones" on deducciones_nomina;
create policy "usuarios autenticados ven deducciones" on deducciones_nomina for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean deducciones" on deducciones_nomina;
create policy "usuarios autenticados crean deducciones" on deducciones_nomina for insert with check (auth.role() = 'authenticated');

-- 7. PROPIEDADES EN ARRIENDO (depende de 'deudas') -----------------------
create table if not exists propiedades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text,
  arrendatario text,
  valor_arriendo numeric not null,
  dia_pago_arriendo int default 5,
  credito_id uuid references deudas(id),
  creado_en timestamp default now()
);
create table if not exists arriendos_recibidos (
  id uuid primary key default gen_random_uuid(),
  propiedad_id uuid references propiedades(id) on delete cascade,
  mes text not null,
  monto numeric not null,
  fecha date not null default current_date
);
alter table propiedades enable row level security;
alter table arriendos_recibidos enable row level security;
drop policy if exists "usuarios autenticados ven propiedades" on propiedades;
create policy "usuarios autenticados ven propiedades" on propiedades for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean propiedades" on propiedades;
create policy "usuarios autenticados crean propiedades" on propiedades for insert with check (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados ven arriendos" on arriendos_recibidos;
create policy "usuarios autenticados ven arriendos" on arriendos_recibidos for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean arriendos" on arriendos_recibidos;
create policy "usuarios autenticados crean arriendos" on arriendos_recibidos for insert with check (auth.role() = 'authenticated');

-- 8. VEHÍCULO RENTADO ---------------------------------------------------
create table if not exists vehiculos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  placa text,
  arrendatario text,
  cuota_diaria numeric not null,
  dia_descanso int default 0,
  creado_en timestamp default now()
);
create table if not exists pagos_vehiculo (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid references vehiculos(id) on delete cascade,
  fecha date not null,
  estado text not null default 'pagado',
  monto numeric,
  creado_en timestamp default now()
);
alter table vehiculos enable row level security;
alter table pagos_vehiculo enable row level security;
drop policy if exists "usuarios autenticados ven vehiculos" on vehiculos;
create policy "usuarios autenticados ven vehiculos" on vehiculos for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean vehiculos" on vehiculos;
create policy "usuarios autenticados crean vehiculos" on vehiculos for insert with check (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados ven pagos" on pagos_vehiculo;
create policy "usuarios autenticados ven pagos" on pagos_vehiculo for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean pagos" on pagos_vehiculo;
create policy "usuarios autenticados crean pagos" on pagos_vehiculo for insert with check (auth.role() = 'authenticated');

-- 9. INVERSIONES / MINIPROYECTOS -----------------------------------------
create table if not exists inversiones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text,
  inversion_inicial numeric not null,
  horizonte_meses int,
  creado_en timestamp default now()
);
create table if not exists movimientos_inversion (
  id uuid primary key default gen_random_uuid(),
  inversion_id uuid references inversiones(id) on delete cascade,
  tipo text not null,
  concepto text,
  monto numeric not null,
  fecha date not null default current_date
);
alter table inversiones enable row level security;
alter table movimientos_inversion enable row level security;
drop policy if exists "usuarios autenticados ven inversiones" on inversiones;
create policy "usuarios autenticados ven inversiones" on inversiones for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean inversiones" on inversiones;
create policy "usuarios autenticados crean inversiones" on inversiones for insert with check (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados ven movimientos" on movimientos_inversion;
create policy "usuarios autenticados ven movimientos" on movimientos_inversion for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean movimientos" on movimientos_inversion;
create policy "usuarios autenticados crean movimientos" on movimientos_inversion for insert with check (auth.role() = 'authenticated');

-- 10. EVENTOS Y VIAJES ----------------------------------------------------
create table if not exists presupuestos_evento (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fecha date not null default current_date,
  creado_en timestamp default now()
);
create table if not exists items_presupuesto (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid references presupuestos_evento(id) on delete cascade,
  nombre text not null,
  valor_planeado numeric not null,
  valor_real numeric
);
alter table presupuestos_evento enable row level security;
alter table items_presupuesto enable row level security;
drop policy if exists "usuarios autenticados ven presupuestos" on presupuestos_evento;
create policy "usuarios autenticados ven presupuestos" on presupuestos_evento for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean presupuestos" on presupuestos_evento;
create policy "usuarios autenticados crean presupuestos" on presupuestos_evento for insert with check (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados ven items" on items_presupuesto;
create policy "usuarios autenticados ven items" on items_presupuesto for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean items" on items_presupuesto;
create policy "usuarios autenticados crean items" on items_presupuesto for insert with check (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados actualizan items" on items_presupuesto;
create policy "usuarios autenticados actualizan items" on items_presupuesto for update using (auth.role() = 'authenticated');

-- 11. CIERRE MENSUAL (aporte configurable por persona) --------------------
create table if not exists aportes_mes (
  id uuid primary key default gen_random_uuid(),
  mes text not null,
  usuario_id uuid references auth.users(id),
  usuario_nombre text,
  aporte numeric not null,
  creado_en timestamp default now(),
  unique (mes, usuario_id)
);
alter table aportes_mes enable row level security;
drop policy if exists "usuarios autenticados ven aportes_mes" on aportes_mes;
create policy "usuarios autenticados ven aportes_mes" on aportes_mes for select using (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados crean aportes_mes" on aportes_mes;
create policy "usuarios autenticados crean aportes_mes" on aportes_mes for insert with check (auth.role() = 'authenticated');
drop policy if exists "usuarios autenticados actualizan aportes_mes" on aportes_mes;
create policy "usuarios autenticados actualizan aportes_mes" on aportes_mes for update using (auth.role() = 'authenticated');

-- ============================================================
-- FIN. Si todo corrió sin errores, tu base de datos ya tiene
-- las 19 tablas que la app necesita.
-- ============================================================
