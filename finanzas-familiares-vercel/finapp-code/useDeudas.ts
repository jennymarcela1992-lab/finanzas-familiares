import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";
import { TipoTasa, tasaMensual, generarCuotas, sumarMeses, hoyISO } from "../utils/amortizacion";

export interface CuotaRow {
  id: string;
  deuda_id: string;
  numero_cuota: number;
  cuota_total: number;
  capital: number;
  interes: number;
  seguro: number | null;
  saldo: number;
  fecha_vencimiento: string;
  estado: "pendiente" | "pagada";
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
}

export interface DeudaConCuotas extends DeudaRow {
  cuotas: CuotaRow[];
  abonos: AbonoRow[];
  cuotasPagadas: number;
  porcentajePagado: number; // según capital pagado (incluye abonos)
  proximaCuota: CuotaRow | null;
  saldoActual: number;
  interesesPendientes: number;
  iMensual: number;
  primerPago: string;
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
}

async function nombreUsuario(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.user_metadata?.nombre ?? data.user?.email ?? "Alguien";
}

function primerPagoDe(d: DeudaRow): string {
  return d.fecha_primer_pago ?? sumarMeses(String(d.fecha_inicio).slice(0, 10), 1);
}

/** Saldo de capital que se debe hoy: valor inicial − capital de cuotas pagadas − abonos extra. */
function saldoDe(d: DeudaRow, cuotas: CuotaRow[], abonos: AbonoRow[]): number {
  const capitalPagado = cuotas.filter((c) => c.estado === "pagada").reduce((s, c) => s + Number(c.capital), 0);
  const abonado = abonos.reduce((s, a) => s + Number(a.valor), 0);
  return Math.max(0, Math.round(Number(d.valor_inicial) - capitalPagado - abonado));
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
    const [rD, rC, rA] = await Promise.all([
      supabase.from("deudas").select("*").order("creado_en", { ascending: false }),
      supabase.from("cuotas_deuda").select("*").order("numero_cuota", { ascending: true }),
      supabase.from("abonos_deuda").select("*").order("fecha", { ascending: true }),
    ]);
    const err = rD.error ?? rC.error;
    if (err) {
      setError(err.message);
      setCargando(false);
      return;
    }
    // si la tabla de abonos aún no existe (falta correr el SQL), seguimos sin abonos
    const abonosData = (rA.error ? [] : rA.data ?? []) as AbonoRow[];

    const combinadas: DeudaConCuotas[] = (rD.data ?? []).map((d: DeudaRow) => {
      const cuotas = (rC.data ?? []).filter((c: CuotaRow) => c.deuda_id === d.id) as CuotaRow[];
      const abonos = abonosData.filter((a) => a.deuda_id === d.id);
      const pagadas = cuotas.filter((c) => c.estado === "pagada").length;
      const saldoActual = saldoDe(d, cuotas, abonos);
      const pendientes = cuotas.filter((c) => c.estado === "pendiente");
      return {
        ...d,
        cuotas,
        abonos,
        cuotasPagadas: pagadas,
        porcentajePagado: Number(d.valor_inicial) > 0 ? 1 - saldoActual / Number(d.valor_inicial) : 0,
        proximaCuota: pendientes[0] ?? null,
        saldoActual,
        interesesPendientes: pendientes.reduce((s, c) => s + Number(c.interes), 0),
        iMensual: tasaMensual(Number(d.tasa_interes), d.tipo_tasa ?? "MV"),
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
    const [rD, rC, rA] = await Promise.all([
      supabase.from("deudas").select("*").eq("id", deudaId).single(),
      supabase.from("cuotas_deuda").select("*").eq("deuda_id", deudaId).order("numero_cuota"),
      supabase.from("abonos_deuda").select("*").eq("deuda_id", deudaId),
    ]);
    chequear(rD.error, "No se pudo leer la deuda");
    chequear(rC.error, "No se pudieron leer las cuotas");
    chequear(rA.error, "No se pudieron leer los abonos");
    const d = rD.data as DeudaRow;
    const cuotas = (rC.data ?? []) as CuotaRow[];
    const abonos = (rA.data ?? []) as AbonoRow[];

    const pagadas = cuotas.filter((c) => c.estado === "pagada");
    const pendientes = cuotas.filter((c) => c.estado === "pendiente");
    const numeroInicial = pagadas.length ? Math.max(...pagadas.map((c) => c.numero_cuota)) + 1 : 1;
    const saldo = saldoDe(d, cuotas, abonos);
    const i = tasaMensual(Number(d.tasa_interes), d.tipo_tasa ?? "MV");

    let cuotaObjetivo: number | undefined;
    if (opciones.mantenerCuota && pendientes[0]) {
      cuotaObjetivo = Number(pendientes[0].capital) + Number(pendientes[0].interes);
    }
    const nuevas = generarCuotas({
      saldo,
      iMensual: i,
      seguroMensual: Number(d.seguro_mensual ?? 0),
      fechaPrimerPago: primerPagoDe(d),
      diaPago: d.dia_pago,
      numeroInicial,
      cuotaObjetivo,
      cuotasRestantes: Math.max(1, Number(d.plazo_meses) - pagadas.length),
    });

    const { error: errBorrar } = await supabase.from("cuotas_deuda").delete().eq("deuda_id", deudaId).eq("estado", "pendiente");
    chequear(errBorrar, "No se pudieron reemplazar las cuotas");
    if (nuevas.length) {
      const { error: errInsert } = await supabase.from("cuotas_deuda").insert(nuevas.map((c) => ({ ...c, deuda_id: deudaId, estado: "pendiente" })));
      chequear(errInsert, "No se pudieron guardar las cuotas nuevas");
    }
    const { error: errPlazo } = await supabase
      .from("deudas")
      .update({ plazo_meses: pagadas.length + nuevas.length })
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

    const hoy = hoyISO();
    const cuotas = generarCuotas({
      saldo: datos.valorInicial,
      iMensual: tasaMensual(datos.tasa, datos.tipoTasa),
      seguroMensual: datos.seguroMensual,
      fechaPrimerPago: datos.fechaPrimerPago,
      numeroInicial: 1,
      cuotasRestantes: datos.plazoMeses,
    }).map((c) => {
      const yaPaso = marcarVencidas && c.fecha_vencimiento < hoy;
      return {
        ...c,
        deuda_id: creada.id,
        estado: yaPaso ? "pagada" : "pendiente",
        pagada_por: yaPaso ? "Registro inicial" : null,
        fecha_pago: yaPaso ? c.fecha_vencimiento : null,
      };
    });
    const { error: errCuotas } = await supabase.from("cuotas_deuda").insert(cuotas);
    if (errCuotas) {
      await supabase.from("deudas").delete().eq("id", creada.id);
      chequear(errCuotas, "No se pudieron crear las cuotas");
    }
    await cargar();
  }

  /** Cambia los datos del crédito y recalcula las cuotas que faltan (las pagadas no se tocan). */
  async function editarDeuda(id: string, datos: DatosDeuda) {
    const { error: err } = await supabase.from("deudas").update(filaDeuda(datos)).eq("id", id);
    chequear(err, "No se pudo guardar el cambio");
    await recalcularPendientes(id);
    await cargar();
  }

  async function eliminarDeuda(id: string) {
    const { error: err } = await supabase.from("deudas").delete().eq("id", id);
    chequear(err, "No se pudo eliminar la deuda");
    await cargar();
  }

  /** Marca como pagada la cuota indicada y todas las anteriores que sigan pendientes. */
  async function marcarPagadaHasta(deudaId: string, numeroCuota: number, fechaPago?: string) {
    const nombre = await nombreUsuario();
    const { error: err } = await supabase
      .from("cuotas_deuda")
      .update({ estado: "pagada", pagada_por: nombre, fecha_pago: fechaPago ?? hoyISO() })
      .eq("deuda_id", deudaId)
      .eq("estado", "pendiente")
      .lte("numero_cuota", numeroCuota);
    chequear(err, "No se pudo marcar el pago");
    await cargar();
  }

  /** Por si se marcó por error: la cuota vuelve a quedar pendiente. */
  async function desmarcarPagada(cuotaId: string) {
    const { error: err } = await supabase
      .from("cuotas_deuda")
      .update({ estado: "pendiente", pagada_por: null, fecha_pago: null })
      .eq("id", cuotaId);
    chequear(err, "No se pudo desmarcar la cuota");
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
    marcarPagadaHasta,
    desmarcarPagada,
    registrarAbono,
    eliminarAbono,
    recargar: cargar,
  };
}
