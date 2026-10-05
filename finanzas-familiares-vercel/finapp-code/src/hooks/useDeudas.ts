import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";
import { cargarVinculos, guardarVinculos, VinculoActivo } from "../utils/deudaActivos";
import { TipoTasa, Frecuencia, PeriodoAbono, tasaPeriodo, abonoVigenteEn, generarCuotas, sumarMeses, hoyISO, fechaCuota, proyectarCuotas, EventoCredito } from "../utils/amortizacion";
import { asegurarAutomaticos } from "../utils/automaticos";
import { PagoDeudaRow, reaplicarPagos, registrarPagoDeuda, restanteDeCuota, nombreUsuarioActual } from "../utils/pagosDeuda";

export interface CuotaRow {
  id: string;
  deuda_id: string;
  numero_cuota: number;
  cuota_total: number;
  capital: number;
  interes: number;
  seguro: number | null;
  abono_extra: number | null; // abono fijo mensual incluido en esta cuota
  saldo: number;
  fecha_vencimiento: string;
  estado: "pendiente" | "pagada";
  valor_pagado: number | null; // lo abonado a esta cuota (pagos registrados)
  pagada_por: string | null;
  fecha_pago: string | null;
}

export interface AbonoRow {
  id: string;
  deuda_id: string;
  fecha: string;
  valor: number;
  modalidad: "plazo" | "cuota";
  nota: string | null;
  registrado_por: string | null;
}

/** Aumento del préstamo (ej. el prestamista entrega más dinero). */
export interface DesembolsoRow {
  id: string;
  deuda_id: string;
  fecha: string;
  valor: number;
  mantiene: "cuota" | "plazo"; // cuota = la cuota no cambia y aumenta el plazo; plazo = el plazo no cambia y sube la cuota
  nota: string | null;
  registrado_por: string | null;
}

export interface DeudaRow {
  id: string;
  nombre: string;
  valor_inicial: number;
  tasa_interes: number;
  tipo_tasa: TipoTasa | null;
  plazo_meses: number;
  seguro_mensual: number | null;
  fecha_inicio: string;
  fecha_primer_pago: string | null;
  dia_pago: number | null;
  entidad_pago: string | null;
  numero_cuenta: string | null;
  alias_pago: string | null;
  dias_aviso_previo: number;
  frecuencia: Frecuencia | null; // mensual o quincenal
  pago_automatico_por: string | null; // débito automático desde la cuenta de esta persona
  propiedad_id: string | null; // crédito asociado a una propiedad
  vehiculo_id: string | null; // crédito asociado al carro
  abono_mensual: number | null; // abono fijo extra a capital cada mes
  abono_mensual_desde: string | null;
}

export interface DeudaConCuotas extends DeudaRow {
  cuotas: CuotaRow[];
  abonos: AbonoRow[];
  desembolsos: DesembolsoRow[];
  abonosPeriodos: (PeriodoAbono & { id?: string })[]; // historial del abono fijo (valor desde cada fecha)
  abonoVigente: number; // abono fijo que aplica a la próxima cuota
  montoTotal: number; // valor inicial + aumentos del préstamo
  pagos: PagoDeudaRow[];
  restanteProxima: number; // lo que falta por pagar de la próxima cuota
  cuotasPagadas: number;
  porcentajePagado: number; // según capital pagado (incluye abonos)
  proximaCuota: CuotaRow | null;
  saldoActual: number;
  interesesPendientes: number;
  iMensual: number; // tasa por periodo de pago (mensual o quincenal)
  primerPago: string;
  vinculos: VinculoActivo[]; // propiedades/vehículos y el % del crédito que les corresponde
}

export interface DatosDeuda {
  nombre: string;
  valorInicial: number;
  tasa: number;
  tipoTasa: TipoTasa;
  plazoMeses: number;
  seguroMensual: number;
  fechaPrimerPago: string; // AAAA-MM-DD
  entidadPago?: string;
  numeroCuenta?: string;
  aliasPago?: string;
  diasAvisoPrevio?: number;
  propiedadId?: string | null;
  vehiculoId?: string | null;
  frecuencia?: Frecuencia;
  pagoAutomaticoPor?: string | null;
  vinculos?: { tipo: "propiedad" | "vehiculo"; activoId: string; porcentaje: number }[];
}

async function nombreUsuario(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.user_metadata?.nombre ?? data.user?.email ?? "Alguien";
}

/** Periodos del abono fijo; los créditos viejos guardaban un solo valor en la deuda. */
function periodosDe(d: DeudaRow, filas: any[]): (PeriodoAbono & { id?: string })[] {
  const propios = filas.filter((p) => p.deuda_id === d.id).map((p) => ({ id: p.id, desde: String(p.desde), valor: Number(p.valor) }));
  if (propios.length) return propios.sort((a, b) => a.desde.localeCompare(b.desde));
  if (Number(d.abono_mensual ?? 0) > 0) return [{ desde: d.abono_mensual_desde ?? "0000-01-01", valor: Number(d.abono_mensual) }];
  return [];
}

function primerPagoDe(d: DeudaRow): string {
  return d.fecha_primer_pago ?? sumarMeses(String(d.fecha_inicio).slice(0, 10), 1);
}

/** Saldo de capital que se debe hoy: valor inicial + aumentos − capital pagado (incluye abonos fijos) − abonos extra. */
function saldoDe(d: DeudaRow, cuotas: CuotaRow[], abonos: AbonoRow[], desembolsos: DesembolsoRow[]): number {
  const capitalPagado = cuotas
    .filter((c) => c.estado === "pagada")
    .reduce((s, c) => s + Number(c.capital) + Number(c.abono_extra ?? 0), 0);
  const abonado = abonos.reduce((s, a) => s + Number(a.valor), 0);
  const aumentos = desembolsos.reduce((s, x) => s + Number(x.valor), 0);
  return Math.max(0, Math.round(Number(d.valor_inicial) + aumentos - capitalPagado - abonado));
}

function chequear(error: any, que: string) {
  if (error) throw new Error(`${que}: ${error.message}`);
}

export function useDeudas() {
  const [deudas, setDeudas] = useState<DeudaConCuotas[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    await asegurarAutomaticos(); // registra débitos automáticos y gastos recurrentes que ya vencieron
    const [rD, rC, rA, rP, rX, rM] = await Promise.all([
      supabase.from("deudas").select("*").order("creado_en", { ascending: false }),
      supabase.from("cuotas_deuda").select("*").order("numero_cuota", { ascending: true }),
      supabase.from("abonos_deuda").select("*").order("fecha", { ascending: true }),
      supabase.from("pagos_deuda").select("*").order("fecha", { ascending: false }),
      supabase.from("desembolsos_deuda").select("*").order("fecha", { ascending: true }),
      supabase.from("abonos_mensuales_deuda").select("*"),
    ]);
    const vinculosTodos = await cargarVinculos();
    const err = rD.error ?? rC.error;
    if (err) {
      setError(err.message);
      setCargando(false);
      return;
    }
    // si la tabla de abonos aún no existe (falta correr el SQL), seguimos sin abonos
    const abonosData = (rA.error ? [] : rA.data ?? []) as AbonoRow[];
    const pagosData = (rP.error ? [] : rP.data ?? []) as PagoDeudaRow[];
    const desembolsosData = (rX.error ? [] : rX.data ?? []) as DesembolsoRow[];
    const periodosData = (rM.error ? [] : rM.data ?? []) as any[];

    const combinadas: DeudaConCuotas[] = (rD.data ?? []).map((d: DeudaRow) => {
      const cuotas = (rC.data ?? []).filter((c: CuotaRow) => c.deuda_id === d.id) as CuotaRow[];
      const abonos = abonosData.filter((a) => a.deuda_id === d.id);
      const desembolsos = desembolsosData.filter((x) => x.deuda_id === d.id);
      const montoTotal = Number(d.valor_inicial) + desembolsos.reduce((s, x) => s + Number(x.valor), 0);
      const pagadas = cuotas.filter((c) => c.estado === "pagada").length;
      const saldoActual = saldoDe(d, cuotas, abonos, desembolsos);
      const pendientes = cuotas.filter((c) => c.estado === "pendiente");
      return {
        ...d,
        cuotas,
        abonos,
        desembolsos,
        abonosPeriodos: periodosDe(d, periodosData),
        abonoVigente: abonoVigenteEn(periodosDe(d, periodosData), pendientes[0]?.fecha_vencimiento ?? hoyISO()),
        montoTotal,
        pagos: pagosData.filter((p) => p.deuda_id === d.id),
        vinculos: vinculosTodos.filter((v) => v.deuda_id === d.id),
        restanteProxima: restanteDeCuota(pendientes[0]),
        cuotasPagadas: pagadas,
        porcentajePagado: montoTotal > 0 ? 1 - saldoActual / montoTotal : 0,
        proximaCuota: pendientes[0] ?? null,
        saldoActual,
        interesesPendientes: pendientes.reduce((s, c) => s + Number(c.interes), 0),
        iMensual: tasaPeriodo(Number(d.tasa_interes), d.tipo_tasa ?? "MV", d.frecuencia ?? "mensual"),
        primerPago: primerPagoDe(d),
      };
    });

    setDeudas(combinadas);
    setError(null);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Lee la deuda desde la base y vuelve a calcular todas las cuotas pendientes. */
  async function recalcularPendientes(deudaId: string, opciones: { mantenerCuota?: boolean } = {}) {
    const [rD, rC, rA, rX] = await Promise.all([
      supabase.from("deudas").select("*").eq("id", deudaId).single(),
      supabase.from("cuotas_deuda").select("*").eq("deuda_id", deudaId).order("numero_cuota"),
      supabase.from("abonos_deuda").select("*").eq("deuda_id", deudaId),
      supabase.from("desembolsos_deuda").select("*").eq("deuda_id", deudaId),
    ]);
    const rM = await supabase.from("abonos_mensuales_deuda").select("*").eq("deuda_id", deudaId);
    chequear(rD.error, "No se pudo leer la deuda");
    chequear(rC.error, "No se pudieron leer las cuotas");
    chequear(rA.error, "No se pudieron leer los abonos");
    const d = rD.data as DeudaRow;
    const cuotas = (rC.data ?? []) as CuotaRow[];
    const abonos = (rA.data ?? []) as AbonoRow[];
    const desembolsos = (rX.error ? [] : rX.data ?? []) as DesembolsoRow[];

    const pagadas = cuotas.filter((c) => c.estado === "pagada");
    const pendientes = cuotas.filter((c) => c.estado === "pendiente");
    const numeroInicial = pagadas.length ? Math.max(...pagadas.map((c) => c.numero_cuota)) + 1 : 1;
    const frecuencia = d.frecuencia ?? "mensual";
    const i = tasaPeriodo(Number(d.tasa_interes), d.tipo_tasa ?? "MV", frecuencia);
    const primerPago = primerPagoDe(d);

    // Los aumentos/abonos con fecha hasta la próxima cuota ya cuentan en el saldo de arranque;
    // los que tienen fecha posterior se aplican en el mes que corresponde (créditos con historial).
    const corte = fechaCuota(primerPago, numeroInicial, d.dia_pago, frecuencia);
    const capitalPagado = pagadas.reduce((s, c) => s + Number(c.capital) + Number(c.abono_extra ?? 0), 0);
    const abonosAntes = abonos.filter((a) => a.fecha <= corte).reduce((s, a) => s + Number(a.valor), 0);
    const aumentosAntes = desembolsos.filter((x) => x.fecha <= corte).reduce((s, x) => s + Number(x.valor), 0);
    const saldoInicio = Math.max(0, Math.round(Number(d.valor_inicial) + aumentosAntes - capitalPagado - abonosAntes));
    const eventos: EventoCredito[] = [
      ...abonos
        .filter((a) => a.fecha > corte)
        .map((a) => ({ fecha: a.fecha, delta: -Number(a.valor), modo: (a.modalidad === "plazo" ? "mantener_cuota" : "recalcular_cuota") as EventoCredito["modo"] })),
      ...desembolsos
        .filter((x) => x.fecha > corte)
        .map((x) => ({ fecha: x.fecha, delta: Number(x.valor), modo: (x.mantiene === "cuota" ? "mantener_cuota" : "recalcular_cuota") as EventoCredito["modo"] })),
    ];

    const cuotaActual = pendientes[0] ? Number(pendientes[0].capital) + Number(pendientes[0].interes) : null;
    const { filas: nuevas, cuotasPlanInicial } = proyectarCuotas({
      saldoInicio,
      iMensual: i,
      seguroMensual: Number(d.seguro_mensual ?? 0),
      fechaPrimerPago: primerPago,
      diaPago: d.dia_pago,
      numeroInicial,
      cuotaInicio: opciones.mantenerCuota ? cuotaActual : null,
      cuotasRestantes: Math.max(1, Number(d.plazo_meses) - pagadas.length),
      eventos,
      abonoPeriodos: periodosDe(d, rM.error ? [] : rM.data ?? []),
      frecuencia,
    });

    const { error: errBorrar } = await supabase.from("cuotas_deuda").delete().eq("deuda_id", deudaId).eq("estado", "pendiente");
    chequear(errBorrar, "No se pudieron reemplazar las cuotas");
    if (nuevas.length) {
      const { error: errInsert } = await supabase.from("cuotas_deuda").insert(nuevas.map((c) => ({ ...c, deuda_id: deudaId, estado: "pendiente" })));
      chequear(errInsert, "No se pudieron guardar las cuotas nuevas");
    }
    await reaplicarPagos(deudaId); // vuelve a ubicar pagos parciales en las cuotas nuevas
    const { error: errPlazo } = await supabase
      .from("deudas")
      .update({ plazo_meses: pagadas.length + cuotasPlanInicial }) // plazo de referencia del plan vigente (sin abonos fijos)
      .eq("id", deudaId);
    chequear(errPlazo, "No se pudo actualizar el plazo");
  }

  function filaDeuda(datos: DatosDeuda) {
    return {
      nombre: datos.nombre,
      valor_inicial: Math.round(datos.valorInicial),
      tasa_interes: datos.tasa,
      tipo_tasa: datos.tipoTasa,
      plazo_meses: datos.plazoMeses,
      seguro_mensual: Math.round(datos.seguroMensual || 0),
      fecha_primer_pago: datos.fechaPrimerPago,
      dia_pago: Number(datos.fechaPrimerPago.slice(8, 10)),
      entidad_pago: datos.entidadPago ?? null,
      numero_cuenta: datos.numeroCuenta ?? null,
      alias_pago: datos.aliasPago ?? null,
      frecuencia: datos.frecuencia ?? "mensual",
      pago_automatico_por: datos.pagoAutomaticoPor || null,
      propiedad_id: datos.vinculos ? datos.vinculos.find((v) => v.tipo === "propiedad")?.activoId ?? null : datos.propiedadId ?? null,
      vehiculo_id: datos.vinculos ? datos.vinculos.find((v) => v.tipo === "vehiculo")?.activoId ?? null : datos.vehiculoId ?? null,
    };
  }

  /** Crea la deuda y su tabla. Si `marcarVencidas`, las cuotas con fecha anterior a hoy quedan pagadas. */
  async function crearDeuda(datos: DatosDeuda, marcarVencidas = false) {
    const { data: creada, error: errDeuda } = await supabase
      .from("deudas")
      .insert({ ...filaDeuda(datos), dias_aviso_previo: datos.diasAvisoPrevio ?? 3, fecha_inicio: sumarMeses(datos.fechaPrimerPago, -1) })
      .select()
      .single();
    chequear(errDeuda, "No se pudo crear la deuda");
    if (datos.vinculos?.length) await guardarVinculos(creada.id, datos.vinculos);

    const hoy = hoyISO();
    const cuotas = generarCuotas({
      saldo: datos.valorInicial,
      iMensual: tasaPeriodo(datos.tasa, datos.tipoTasa, datos.frecuencia ?? "mensual"),
      frecuencia: datos.frecuencia ?? "mensual",
      seguroMensual: datos.seguroMensual,
      fechaPrimerPago: datos.fechaPrimerPago,
      numeroInicial: 1,
      cuotasRestantes: datos.plazoMeses,
    });
    const { error: errCuotas } = await supabase
      .from("cuotas_deuda")
      .insert(cuotas.map((c) => ({ ...c, deuda_id: creada.id, estado: "pendiente", valor_pagado: 0 })));
    if (errCuotas) {
      await supabase.from("deudas").delete().eq("id", creada.id);
      chequear(errCuotas, "No se pudieron crear las cuotas");
    }

    // Cuotas que ya se habían pagado antes de usar la app: quedan como "registro inicial"
    const vencidas = marcarVencidas ? cuotas.filter((c) => c.fecha_vencimiento < hoy) : [];
    if (vencidas.length) {
      const yo = await nombreUsuarioActual();
      const { error: errPagos } = await supabase.from("pagos_deuda").insert(
        vencidas.map((c) => ({
          deuda_id: creada.id,
          fecha: c.fecha_vencimiento,
          valor: c.cuota_total,
          origen: "registro_inicial",
          pagado_por: "Registro inicial",
          registrado_por: yo.nombre,
        }))
      );
      chequear(errPagos, "No se pudieron registrar las cuotas ya pagadas");
      await reaplicarPagos(creada.id);
    }
    await cargar();
  }

  /** Cambia los datos del crédito y recalcula las cuotas que faltan (las pagadas no se tocan). */
  async function editarDeuda(id: string, datos: DatosDeuda) {
    const { error: err } = await supabase.from("deudas").update(filaDeuda(datos)).eq("id", id);
    chequear(err, "No se pudo guardar el cambio");
    if (datos.vinculos) await guardarVinculos(id, datos.vinculos);
    await recalcularPendientes(id);
    await cargar();
  }

  async function eliminarDeuda(id: string) {
    const { error: err } = await supabase.from("deudas").delete().eq("id", id);
    chequear(err, "No se pudo eliminar la deuda");
    await cargar();
  }

  /**
   * Pago hecho por una persona: queda como gasto (rubro "Créditos") y se aplica a las cuotas.
   * Los pagos con arriendos se registran desde Propiedades.
   */
  async function registrarPago(deudaId: string, valor: number, fecha: string, persona: string) {
    const deuda = deudas.find((d) => d.id === deudaId);
    const yo = await nombreUsuarioActual();
    const { data: gasto, error: errG } = await supabase
      .from("gastos")
      .insert({
        fecha,
        item: `Cuota ${deuda?.nombre ?? "crédito"}`,
        valor: Math.round(valor),
        moneda: "COP",
        valor_cop: Math.round(valor),
        usuario_pago_id: persona === yo.nombre ? yo.id : null,
        usuario_pago_nombre: persona,
        rubro: "Créditos",
        es_compartido: true,
        deuda_id: deudaId,
      })
      .select()
      .single();
    chequear(errG, "No se pudo registrar el gasto del pago");
    try {
      await registrarPagoDeuda({ deudaId, valor, fecha, origen: "persona", pagadoPor: persona, gastoId: gasto.id });
    } catch (e) {
      await supabase.from("gastos").delete().eq("id", gasto.id);
      throw e;
    }
    await cargar();
  }

  /**
   * Cuotas que ya se pagaron antes de usar la app: quedan pagadas como "registro inicial".
   * No crean gastos ni cuentan en el Resumen; solo dejan la cuota como pagada.
   */
  async function marcarPagadasHasta(deudaId: string, fechaHasta: string) {
    const deuda = deudas.find((d) => d.id === deudaId);
    const objetivo = (deuda?.cuotas ?? []).filter((c) => c.estado === "pendiente" && c.fecha_vencimiento <= fechaHasta);
    if (!objetivo.length) throw new Error("No hay cuotas pendientes hasta esa fecha.");
    const yo = await nombreUsuarioActual();
    const { error: err } = await supabase.from("pagos_deuda").insert(
      objetivo.map((c) => ({
        deuda_id: deudaId,
        fecha: c.fecha_vencimiento,
        valor: Math.max(1, Math.round(Number(c.cuota_total) - Number(c.valor_pagado ?? 0))),
        origen: "registro_inicial",
        pagado_por: "Ya pagada",
        registrado_por: yo.nombre,
      }))
    );
    chequear(err, "No se pudieron marcar las cuotas");
    await reaplicarPagos(deudaId);
    await cargar();
    return objetivo.length;
  }

  /** Deshace las cuotas marcadas como "ya pagadas antes de la app" (vuelven a quedar pendientes). */
  async function deshacerYaPagadas(deudaId: string) {
    const { error: err } = await supabase.from("pagos_deuda").delete().eq("deuda_id", deudaId).eq("origen", "registro_inicial");
    chequear(err, "No se pudo deshacer");
    await reaplicarPagos(deudaId);
    await cargar();
  }

  /** Borra un pago registrado por error (y su gasto, si lo tiene). La cuota vuelve a quedar pendiente si ya no está cubierta. */
  async function eliminarPago(pago: PagoDeudaRow) {
    const { error: err } = await supabase.from("pagos_deuda").delete().eq("id", pago.id);
    chequear(err, "No se pudo borrar el pago");
    if (pago.gasto_id) await supabase.from("gastos").delete().eq("id", pago.gasto_id);
    await reaplicarPagos(pago.deuda_id);
    await cargar();
  }

  /**
   * Abono extra a capital.
   *  - "plazo": se mantiene la cuota y se termina antes.
   *  - "cuota": se mantiene la fecha final y baja la cuota.
   */
  async function registrarAbono(deudaId: string, valor: number, fecha: string, modalidad: "plazo" | "cuota", nota?: string) {
    const deuda = deudas.find((d) => d.id === deudaId);
    if (deuda && valor > deuda.saldoActual) {
      throw new Error(`El abono supera el saldo actual (${Math.round(deuda.saldoActual).toLocaleString("es-CO")}).`);
    }
    const { data: creado, error: err } = await supabase
      .from("abonos_deuda")
      .insert({ deuda_id: deudaId, valor: Math.round(valor), fecha, modalidad, nota: nota ?? null, registrado_por: await nombreUsuario() })
      .select()
      .single();
    chequear(err, "No se pudo registrar el abono");
    try {
      await recalcularPendientes(deudaId, { mantenerCuota: modalidad === "plazo" });
    } catch (e) {
      await supabase.from("abonos_deuda").delete().eq("id", creado.id);
      throw e;
    }
    await cargar();
  }

  /**
   * Aumento del préstamo en una fecha (ej. el prestamista entrega más dinero).
   *  - mantiene "cuota": se paga la misma cuota y aumenta el número de cuotas.
   *  - mantiene "plazo": se termina en la misma fecha y sube la cuota.
   */
  async function registrarDesembolso(deudaId: string, valor: number, fecha: string, mantiene: "cuota" | "plazo", nota?: string) {
    const { data: creado, error: err } = await supabase
      .from("desembolsos_deuda")
      .insert({ deuda_id: deudaId, valor: Math.round(valor), fecha, mantiene, nota: nota ?? null, registrado_por: await nombreUsuario() })
      .select()
      .single();
    chequear(err, "No se pudo registrar el aumento del préstamo");
    try {
      await recalcularPendientes(deudaId, { mantenerCuota: mantiene === "cuota" });
    } catch (e) {
      await supabase.from("desembolsos_deuda").delete().eq("id", creado.id);
      throw e;
    }
    await cargar();
  }

  async function eliminarDesembolso(x: DesembolsoRow) {
    const { error: err } = await supabase.from("desembolsos_deuda").delete().eq("id", x.id);
    chequear(err, "No se pudo borrar el aumento");
    await recalcularPendientes(x.deuda_id, { mantenerCuota: x.mantiene === "cuota" });
    await cargar();
  }

  /**
   * Abono fijo extra a capital en cada cuota, desde `desde`. Cada cambio (subirlo, bajarlo o dejarlo en 0)
   * queda en el historial: las cuotas anteriores conservan el valor que tenían. La cuota base no cambia; se acorta el plazo.
   */
  async function definirAbonoMensual(deudaId: string, valor: number, desde: string | null) {
    const fecha = desde ?? hoyISO();
    const { error: err } = await supabase.from("abonos_mensuales_deuda").insert({ deuda_id: deudaId, desde: fecha, valor: Math.max(0, Math.round(valor)) });
    chequear(err, "No se pudo guardar el abono mensual");
    // compatibilidad: la deuda guarda el último valor
    await supabase.from("deudas").update({ abono_mensual: Math.max(0, Math.round(valor)), abono_mensual_desde: valor > 0 ? fecha : null }).eq("id", deudaId);
    await recalcularPendientes(deudaId, { mantenerCuota: true });
    await cargar();
  }

  /** Borra un cambio del abono fijo registrado por error. */
  async function eliminarPeriodoAbono(deudaId: string, periodoId: string) {
    const { error: err } = await supabase.from("abonos_mensuales_deuda").delete().eq("id", periodoId);
    chequear(err, "No se pudo borrar");
    await recalcularPendientes(deudaId, { mantenerCuota: true });
    await cargar();
  }

  /** Quita la marca de "pagada" de una cuota borrando el pago que la cubrió. */
  async function desmarcarCuota(deudaId: string, cuota: CuotaRow) {
    const deuda = deudas.find((d) => d.id === deudaId);
    const pagos = deuda?.pagos ?? [];
    const pago =
      pagos.find((p) => p.origen === "registro_inicial" && p.fecha === cuota.fecha_vencimiento) ??
      pagos.find((p) => p.fecha === cuota.fecha_pago && (p.pagado_por ?? null) === (cuota.pagada_por ?? null)) ??
      pagos.find((p) => p.fecha === cuota.fecha_pago);
    if (!pago) throw new Error("No encontré el pago de esta cuota. Revisa la lista de Pagos registrados.");
    await eliminarPago(pago);
  }

  /** Borra un abono registrado por error y deshace su efecto en las cuotas. */
  async function eliminarAbono(abono: AbonoRow) {
    const { error: err } = await supabase.from("abonos_deuda").delete().eq("id", abono.id);
    chequear(err, "No se pudo borrar el abono");
    await recalcularPendientes(abono.deuda_id, { mantenerCuota: abono.modalidad === "plazo" });
    await cargar();
  }

  return {
    deudas,
    cargando,
    error,
    crearDeuda,
    editarDeuda,
    eliminarDeuda,
    registrarPago,
    eliminarPago,
    registrarAbono,
    eliminarAbono,
    registrarDesembolso,
    eliminarDesembolso,
    marcarPagadasHasta,
    deshacerYaPagadas,
    definirAbonoMensual,
    eliminarPeriodoAbono,
    desmarcarCuota,
    recargar: cargar,
  };
}
