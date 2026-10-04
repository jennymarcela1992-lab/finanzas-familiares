import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";
import { TipoTasa, tasaMensual, generarCuotas, hoyISO } from "../utils/amortizacion";
import { registrarPagoDeuda, reaplicarPagos } from "../utils/pagosDeuda";
import { personasDelHogar, esDelHogar } from "../utils/aportes";

export interface AbonoRow {
  id: string;
  prestamo_id: string;
  monto: number;
  fecha: string;
  nota: string | null;
  destino_persona: string | null;
  deuda_id: string | null;
}

export interface CuotaPrestamo {
  id: string;
  deuda_id: string;
  numero_cuota: number;
  fecha_vencimiento: string;
  capital: number;
  interes: number;
  seguro: number;
  abono_extra: number;
  cuota_total: number;
  saldo: number;
  estado: "pendiente" | "pagada";
  valor_pagado: number;
  pagada_por: string | null;
  fecha_pago: string | null;
}

export interface PrestamoConAbonos {
  id: string;
  quien_presta: string;
  quien_recibe: string;
  monto: number;
  fecha: string;
  motivo: string | null;
  tasa: number | null;
  tipo_tasa: TipoTasa | null;
  plazo_meses: number | null;
  fecha_primer_pago: string | null;
  abonos: AbonoRow[];
  totalAbonado: number;
  saldoPendiente: number; // lo que falta por pagar (con intereses si tiene cuotas)
  direccion: "prestamos" | "nos_prestan" | "interno"; // prestamos = el hogar le prestó a un tercero
  conCuotas: boolean;
  cuotas: CuotaPrestamo[];
  proximaCuota: CuotaPrestamo | null;
  restanteProxima: number;
  iMensual: number;
}

export interface DatosPrestamo {
  quienPresta: string;
  quienRecibe: string;
  monto: number;
  motivo?: string;
  fecha?: string;
  tasa?: number;
  tipoTasa?: TipoTasa;
  plazoMeses?: number | null;
  fechaPrimerPago?: string | null;
}

export type DestinoAbono = { tipo: "hogar" } | { tipo: "persona"; persona: string } | { tipo: "credito"; deudaId: string };

/** Tabla de cuotas del préstamo y cómo los abonos recibidos las van cubriendo (en orden). */
function construirCuotas(p: any, abonos: AbonoRow[], nombreDestino: (a: AbonoRow) => string): CuotaPrestamo[] {
  if (!p.plazo_meses || !p.fecha_primer_pago) return [];
  const filas = generarCuotas({
    saldo: Number(p.monto),
    iMensual: tasaMensual(Number(p.tasa ?? 0), (p.tipo_tasa ?? "MV") as TipoTasa),
    seguroMensual: 0,
    fechaPrimerPago: p.fecha_primer_pago,
    numeroInicial: 1,
    cuotasRestantes: Number(p.plazo_meses),
  });
  const ordenados = [...abonos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let i = 0;
  let disponible = ordenados.length ? Number(ordenados[0].monto) : 0;
  return filas.map((f) => {
    let aplicado = 0;
    let ultimo: AbonoRow | null = null;
    while (aplicado < f.cuota_total - 0.5 && i < ordenados.length) {
      const toma = Math.min(disponible, f.cuota_total - aplicado);
      aplicado += toma;
      disponible -= toma;
      ultimo = ordenados[i];
      if (disponible <= 0.5) {
        i++;
        disponible = i < ordenados.length ? Number(ordenados[i].monto) : 0;
      }
    }
    const pagada = aplicado >= f.cuota_total - 1;
    return {
      ...f,
      id: `${p.id}-${f.numero_cuota}`,
      deuda_id: p.id,
      estado: pagada ? "pagada" : "pendiente",
      valor_pagado: Math.round(aplicado),
      pagada_por: pagada && ultimo ? nombreDestino(ultimo) : null,
      fecha_pago: pagada && ultimo ? ultimo.fecha : null,
    };
  });
}

export function usePrestamos() {
  const [prestamos, setPrestamos] = useState<PrestamoConAbonos[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [rP, rA, rD, hogar] = await Promise.all([
      supabase.from("prestamos_personales").select("*").order("fecha", { ascending: false }),
      supabase.from("abonos_prestamo").select("*").order("fecha", { ascending: false }),
      supabase.from("deudas").select("id, nombre"),
      personasDelHogar(),
    ]);
    if (rP.error || rA.error) {
      setError((rP.error ?? rA.error)!.message);
      setCargando(false);
      return;
    }
    const nombreDeuda = new Map((rD.data ?? []).map((d: any) => [d.id, d.nombre]));
    const nombreDestino = (a: AbonoRow) =>
      a.deuda_id ? `→ ${nombreDeuda.get(a.deuda_id) ?? "crédito"}` : a.destino_persona ? a.destino_persona : "Hogar";

    const lista: PrestamoConAbonos[] = (rP.data ?? []).map((p: any) => {
      const abonos = (rA.data ?? []).filter((a: any) => a.prestamo_id === p.id) as AbonoRow[];
      const totalAbonado = abonos.reduce((s, a) => s + Number(a.monto), 0);
      const cuotas = construirCuotas(p, abonos, nombreDestino);
      const pendientes = cuotas.filter((c) => c.estado === "pendiente");
      const presta = esDelHogar(p.quien_presta, hogar.personas);
      const recibe = esDelHogar(p.quien_recibe, hogar.personas);
      return {
        ...p,
        abonos,
        totalAbonado,
        conCuotas: cuotas.length > 0,
        cuotas,
        proximaCuota: pendientes[0] ?? null,
        restanteProxima: pendientes[0] ? Math.round(pendientes[0].cuota_total - pendientes[0].valor_pagado) : 0,
        saldoPendiente: cuotas.length
          ? pendientes.reduce((s, c) => s + c.cuota_total - c.valor_pagado, 0)
          : Math.max(Number(p.monto) - totalAbonado, 0),
        direccion: presta && !recibe ? "prestamos" : !presta && recibe ? "nos_prestan" : "interno",
        iMensual: tasaMensual(Number(p.tasa ?? 0), (p.tipo_tasa ?? "MV") as TipoTasa),
      };
    });
    setPrestamos(lista);
    setError(null);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function fila(d: DatosPrestamo) {
    return {
      quien_presta: d.quienPresta,
      quien_recibe: d.quienRecibe,
      monto: Math.round(d.monto),
      motivo: d.motivo ?? null,
      fecha: d.fecha ?? hoyISO(),
      tasa: d.tasa ?? 0,
      tipo_tasa: d.tipoTasa ?? "MV",
      plazo_meses: d.plazoMeses ?? null,
      fecha_primer_pago: d.plazoMeses ? d.fechaPrimerPago ?? null : null,
    };
  }

  async function crearPrestamo(d: DatosPrestamo) {
    const { error: err } = await supabase.from("prestamos_personales").insert(fila(d));
    if (err) throw err;
    await cargar();
  }

  async function editarPrestamo(id: string, d: DatosPrestamo) {
    const { error: err } = await supabase.from("prestamos_personales").update(fila(d)).eq("id", id);
    if (err) throw err;
    await cargar();
  }

  async function eliminarPrestamo(p: PrestamoConAbonos) {
    const deudas = Array.from(new Set(p.abonos.map((a) => a.deuda_id).filter(Boolean))) as string[];
    const { error: err } = await supabase.from("prestamos_personales").delete().eq("id", p.id);
    if (err) throw err;
    for (const id of deudas) await reaplicarPagos(id);
    await cargar();
  }

  /**
   * Registra un pago del préstamo y a dónde fue el dinero:
   * queda en el hogar, se le entregó a una persona, o pagó directamente la cuota de un crédito.
   */
  async function registrarAbono(prestamoId: string, monto: number, fecha: string, destino: DestinoAbono, nota?: string) {
    const prestamo = prestamos.find((p) => p.id === prestamoId);
    const { data: abono, error: err } = await supabase
      .from("abonos_prestamo")
      .insert({
        prestamo_id: prestamoId,
        monto: Math.round(monto),
        fecha,
        nota: nota ?? null,
        destino_persona: destino.tipo === "persona" ? destino.persona : null,
        deuda_id: destino.tipo === "credito" ? destino.deudaId : null,
      })
      .select()
      .single();
    if (err) throw err;
    if (destino.tipo === "credito") {
      try {
        await registrarPagoDeuda({
          deudaId: destino.deudaId,
          valor: monto,
          fecha,
          origen: "prestamo",
          pagadoPor: `Préstamo ${prestamo?.quien_recibe ?? ""}`.trim(),
          abonoPrestamoId: abono.id,
        });
      } catch (e) {
        await supabase.from("abonos_prestamo").delete().eq("id", abono.id);
        throw e;
      }
    }
    await cargar();
  }

  async function eliminarAbono(a: AbonoRow) {
    const { error: err } = await supabase.from("abonos_prestamo").delete().eq("id", a.id);
    if (err) throw err;
    if (a.deuda_id) await reaplicarPagos(a.deuda_id);
    await cargar();
  }

  /** Compatibilidad con la versión anterior. */
  async function agregarAbono(prestamoId: string, monto: number, nota?: string) {
    await registrarAbono(prestamoId, monto, hoyISO(), { tipo: "hogar" }, nota);
  }

  return { prestamos, cargando, error, crearPrestamo, editarPrestamo, eliminarPrestamo, registrarAbono, eliminarAbono, agregarAbono, recargar: cargar };
}
