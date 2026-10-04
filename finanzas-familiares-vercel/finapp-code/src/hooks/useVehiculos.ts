import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";
import { hoyISO } from "../utils/amortizacion";

export const NOMBRES_DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export interface PagoVehiculoRow {
  id: string;
  vehiculo_id: string;
  fecha: string;
  estado: "pagado" | "no_pagado" | "descanso";
  monto: number | null;
  nota: string | null;
}

export interface PicoPlacaRow {
  id: string;
  vehiculo_id: string;
  desde: string;
  dia_semana: number;
}

export interface GastoVehiculo {
  id: string;
  item: string;
  valor: number;
  fecha: string;
  rubro: string | null;
}

export type EstadoDia = "pagado" | "parcial" | "de_mas" | "no_pagado" | "sin_registro" | "libre" | "futuro";

export interface DiaVehiculo {
  fecha: string;
  diaSemana: number;
  tipo: "cobro" | "descanso" | "pico_placa";
  pago: PagoVehiculoRow | null;
  esperado: number;
  recibido: number;
  estado: EstadoDia;
}

export interface Rentabilidad {
  ingresos: number;
  gastos: number;
  cuotas: number; // pagos de créditos asociados al carro
  neto: number;
}

export interface VehiculoConResumen {
  id: string;
  nombre: string;
  placa: string | null;
  arrendatario: string | null;
  cuota_diaria: number;
  dia_descanso: number;
  pagos: PagoVehiculoRow[];
  picoPlaca: PicoPlacaRow[];
  picoPlacaHoy: number | null;
  gastos: GastoVehiculo[];
  pagosCredito: { fecha: string; valor: number }[];
  // mes actual (compatibilidad con el Resumen)
  totalEsperadoMes: number;
  totalRecibidoMes: number;
  diasEnMora: number;
  yaRegistradoHoy: boolean;
}

export interface DatosVehiculo {
  nombre: string;
  placa?: string;
  arrendatario?: string;
  cuotaDiaria: number;
  diaDescanso: number;
}

const diaSemanaDe = (f: string) => new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)))).getUTCDay();

/** Día de pico y placa vigente en una fecha (el último periodo que empezó antes o ese día). */
export function picoPlacaEn(periodos: PicoPlacaRow[], fecha: string): number | null {
  const vigente = periodos.filter((p) => p.desde <= fecha).sort((a, b) => b.desde.localeCompare(a.desde))[0];
  return vigente ? Number(vigente.dia_semana) : null;
}

/** Calcula cada día de un mes (AAAA-MM): si se cobra, cuánto se esperaba y cuánto se recibió. */
export function diasDelMes(v: VehiculoConResumen, mes: string, hoy = hoyISO()): DiaVehiculo[] {
  const [a, m] = mes.split("-").map(Number);
  const total = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const dias: DiaVehiculo[] = [];
  for (let d = 1; d <= total; d++) {
    const fecha = `${mes}-${String(d).padStart(2, "0")}`;
    const diaSemana = diaSemanaDe(fecha);
    const pp = picoPlacaEn(v.picoPlaca, fecha);
    const tipo: DiaVehiculo["tipo"] = diaSemana === Number(v.dia_descanso) ? "descanso" : pp === diaSemana ? "pico_placa" : "cobro";
    const pago = v.pagos.find((p) => p.fecha === fecha) ?? null;
    const cuota = Number(v.cuota_diaria);
    const recibido = pago && pago.estado === "pagado" ? Number(pago.monto ?? cuota) : 0;
    const esperado = tipo === "cobro" && fecha <= hoy ? cuota : 0;
    let estado: EstadoDia;
    if (fecha > hoy && !pago) estado = "futuro";
    else if (tipo !== "cobro") estado = recibido > 0 ? "de_mas" : "libre";
    else if (!pago) estado = "sin_registro";
    else if (pago.estado !== "pagado" || recibido <= 0) estado = "no_pagado";
    else if (recibido < cuota) estado = "parcial";
    else if (recibido > cuota) estado = "de_mas";
    else estado = "pagado";
    dias.push({ fecha, diaSemana, tipo, pago, esperado, recibido, estado });
  }
  return dias;
}

/** Ingresos − gastos − cuotas de crédito del carro entre dos fechas (incluidas). */
export function rentabilidad(v: VehiculoConResumen, desde: string, hasta: string): Rentabilidad {
  const ingresos = v.pagos
    .filter((p) => p.estado === "pagado" && p.fecha >= desde && p.fecha <= hasta)
    .reduce((s, p) => s + Number(p.monto ?? v.cuota_diaria), 0);
  const gastos = v.gastos.filter((g) => g.fecha >= desde && g.fecha <= hasta).reduce((s, g) => s + g.valor, 0);
  const cuotas = v.pagosCredito.filter((p) => p.fecha >= desde && p.fecha <= hasta).reduce((s, p) => s + p.valor, 0);
  return { ingresos, gastos, cuotas, neto: ingresos - gastos - cuotas };
}

export function useVehiculos() {
  const [vehiculos, setVehiculos] = useState<VehiculoConResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [rV, rP, rPP, rG, rD, rPag] = await Promise.all([
      supabase.from("vehiculos").select("*").order("creado_en", { ascending: false }),
      supabase.from("pagos_vehiculo").select("*").order("fecha", { ascending: false }),
      supabase.from("vehiculo_pico_placa").select("*").order("desde", { ascending: false }),
      supabase.from("gastos").select("id, item, valor, valor_cop, fecha, rubro, vehiculo_id, borrado").not("vehiculo_id", "is", null),
      supabase.from("deudas").select("id, vehiculo_id"),
      supabase.from("pagos_deuda").select("deuda_id, valor, fecha, origen"),
    ]);
    if (rV.error || rP.error) {
      setError((rV.error ?? rP.error)!.message);
      setCargando(false);
      return;
    }
    const hoy = hoyISO();
    const mes = hoy.slice(0, 7);
    const picoPlaca = (rPP.error ? [] : rPP.data ?? []) as PicoPlacaRow[];
    const gastos = ((rG.error ? [] : rG.data) ?? []).filter((g: any) => !g.borrado) as any[];
    const deudas = ((rD.error ? [] : rD.data) ?? []) as any[];
    const pagosDeuda = ((rPag.error ? [] : rPag.data) ?? []).filter((p: any) => p.origen !== "registro_inicial") as any[];

    const lista: VehiculoConResumen[] = (rV.data ?? []).map((v: any) => {
      const creditos = new Set(deudas.filter((d) => d.vehiculo_id === v.id).map((d) => d.id));
      const base: VehiculoConResumen = {
        ...v,
        pagos: (rP.data ?? []).filter((p: any) => p.vehiculo_id === v.id),
        picoPlaca: picoPlaca.filter((p) => p.vehiculo_id === v.id),
        picoPlacaHoy: null,
        gastos: gastos
          .filter((g) => g.vehiculo_id === v.id)
          .map((g) => ({ id: g.id, item: g.item, valor: Number(g.valor_cop ?? g.valor), fecha: g.fecha, rubro: g.rubro }))
          .sort((x, y) => y.fecha.localeCompare(x.fecha)),
        pagosCredito: pagosDeuda.filter((p) => creditos.has(p.deuda_id)).map((p) => ({ fecha: p.fecha, valor: Number(p.valor) })),
        totalEsperadoMes: 0,
        totalRecibidoMes: 0,
        diasEnMora: 0,
        yaRegistradoHoy: false,
      };
      base.picoPlacaHoy = picoPlacaEn(base.picoPlaca, hoy);
      const dias = diasDelMes(base, mes, hoy);
      base.totalEsperadoMes = dias.reduce((s, d) => s + d.esperado, 0);
      base.totalRecibidoMes = dias.reduce((s, d) => s + d.recibido, 0);
      // hoy no cuenta como mora hasta que termine el día
      base.diasEnMora = dias.filter((d) => d.fecha < hoy && (d.estado === "sin_registro" || d.estado === "no_pagado")).length;
      base.yaRegistradoHoy = base.pagos.some((p) => p.fecha === hoy);
      return base;
    });

    setVehiculos(lista);
    setError(null);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crearVehiculo(d: DatosVehiculo) {
    const { error: err } = await supabase.from("vehiculos").insert({
      nombre: d.nombre,
      placa: d.placa ?? null,
      arrendatario: d.arrendatario ?? null,
      cuota_diaria: d.cuotaDiaria,
      dia_descanso: d.diaDescanso,
    });
    if (err) throw err;
    await cargar();
  }

  async function editarVehiculo(id: string, d: DatosVehiculo) {
    const { error: err } = await supabase
      .from("vehiculos")
      .update({ nombre: d.nombre, placa: d.placa ?? null, arrendatario: d.arrendatario ?? null, cuota_diaria: d.cuotaDiaria, dia_descanso: d.diaDescanso })
      .eq("id", id);
    if (err) throw err;
    await cargar();
  }

  /** Registra (o corrige) lo que pasó un día: pagó la cuota, pagó otro valor, o no pagó. */
  async function registrarDia(vehiculoId: string, fecha: string, estado: "pagado" | "no_pagado", monto: number | null, nota?: string) {
    const { error: errBorrar } = await supabase.from("pagos_vehiculo").delete().eq("vehiculo_id", vehiculoId).eq("fecha", fecha);
    if (errBorrar) throw errBorrar;
    const { error: err } = await supabase
      .from("pagos_vehiculo")
      .insert({ vehiculo_id: vehiculoId, fecha, estado, monto: estado === "pagado" ? monto : null, nota: nota || null });
    if (err) throw err;
    await cargar();
  }

  /** Marca varios días como pagados con la cuota normal (ej. todos los pendientes del mes). */
  async function registrarVarios(vehiculoId: string, fechas: string[], monto: number) {
    if (!fechas.length) return;
    const { error: errBorrar } = await supabase.from("pagos_vehiculo").delete().eq("vehiculo_id", vehiculoId).in("fecha", fechas);
    if (errBorrar) throw errBorrar;
    const { error: err } = await supabase.from("pagos_vehiculo").insert(fechas.map((fecha) => ({ vehiculo_id: vehiculoId, fecha, estado: "pagado", monto })));
    if (err) throw err;
    await cargar();
  }

  async function borrarDia(vehiculoId: string, fecha: string) {
    const { error: err } = await supabase.from("pagos_vehiculo").delete().eq("vehiculo_id", vehiculoId).eq("fecha", fecha);
    if (err) throw err;
    await cargar();
  }

  /** El pico y placa cambia cada seis meses: se guarda desde qué fecha aplica cada día. */
  async function agregarPicoPlaca(vehiculoId: string, desde: string, diaSemana: number) {
    const { error: err } = await supabase.from("vehiculo_pico_placa").insert({ vehiculo_id: vehiculoId, desde, dia_semana: diaSemana });
    if (err) throw err;
    await cargar();
  }

  async function borrarPicoPlaca(id: string) {
    const { error: err } = await supabase.from("vehiculo_pico_placa").delete().eq("id", id);
    if (err) throw err;
    await cargar();
  }

  /** Compatibilidad: registrar el día de hoy. */
  async function registrarPagoHoy(vehiculoId: string, estado: "pagado" | "no_pagado", monto?: number) {
    await registrarDia(vehiculoId, hoyISO(), estado, monto ?? null);
  }

  return {
    vehiculos,
    cargando,
    error,
    crearVehiculo,
    editarVehiculo,
    registrarDia,
    registrarVarios,
    borrarDia,
    agregarPicoPlaca,
    borrarPicoPlaca,
    registrarPagoHoy,
    recargar: cargar,
    NOMBRES_DIAS,
  };
}
