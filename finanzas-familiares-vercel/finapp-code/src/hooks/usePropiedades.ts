import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";
import { registrarPagoDeuda, restanteDeCuota, reaplicarPagos } from "../utils/pagosDeuda";
import { hoyISO, sumarMeses } from "../utils/amortizacion";
import { arriendoVigente, fechaPagoArriendo, diasEntre, ValorArriendo } from "../utils/arriendo";

export interface ArriendoRow {
  id: string;
  propiedad_id: string;
  mes: string;
  monto: number;
  fecha: string;
  destino_persona: string | null;
  nota: string | null;
}

export interface CreditoDePropiedad {
  id: string;
  nombre: string;
  entidad_pago: string | null;
  numero_cuenta: string | null;
  alias_pago: string | null;
  proximaCuotaValor: number | null; // lo que falta de la próxima cuota
  proximaCuotaFecha: string | null;
  proximaCuotaNumero: number | null;
}

export interface Rendimiento {
  desde: string;
  hasta: string;
  arriendos: number;
  gastos: number;
  cuotas: number; // pagos a créditos de la propiedad
  neto: number;
}

export interface PropiedadConDetalle {
  id: string;
  nombre: string;
  direccion: string | null;
  arrendatario: string | null;
  valor_arriendo: number;
  valor_arriendo_inicial: number | null;
  fecha_inicio_contrato: string | null;
  valor_comercial: number | null;
  aplica_ipc: boolean | null;
  dia_pago_arriendo: number;
  credito_id: string | null;
  arriendos: ArriendoRow[];
  arriendo: ValorArriendo; // valor vigente con IPC
  creditos: CreditoDePropiedad[];
  credito: CreditoDePropiedad | null; // el primero (compatibilidad)
  // estado del arriendo de este mes
  fechaPagoMes: string;
  diasParaPago: number; // negativo = vencido
  recibidoMes: number;
  estadoMes: "recibido" | "parcial" | "por_vencer" | "vencido" | "pendiente";
  gastosRecientes: { id: string; item: string; valor: number; fecha: string }[];
  rendimientoAnio: Rendimiento;
  rendimiento12m: Rendimiento;
  rentabilidadAnual: number | null; // neto 12 meses / valor comercial
  netoMesActual: number;
}

export interface DatosPropiedad {
  nombre: string;
  direccion?: string;
  arrendatario?: string;
  valorArriendoInicial: number;
  fechaInicioContrato?: string | null;
  diaPagoArriendo?: number;
  valorComercial?: number | null;
  aplicaIpc?: boolean;
}

export type DestinoArriendo =
  | { tipo: "hogar" }
  | { tipo: "persona"; persona: string }
  | { tipo: "credito"; deudaId: string; valor: number };

const mesDe = (f: string) => String(f).slice(0, 7);

export function usePropiedades() {
  const [propiedades, setPropiedades] = useState<PropiedadConDetalle[]>([]);
  const [ipc, setIpc] = useState<Record<number, number>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [rP, rA, rI, rD, rC, rG, rPag] = await Promise.all([
      supabase.from("propiedades").select("*").order("creado_en", { ascending: false }),
      supabase.from("arriendos_recibidos").select("*").order("fecha", { ascending: false }),
      supabase.from("ipc_anual").select("*"),
      supabase.from("deudas").select("*"),
      supabase.from("cuotas_deuda").select("deuda_id, numero_cuota, cuota_total, valor_pagado, fecha_vencimiento, estado").eq("estado", "pendiente").order("numero_cuota"),
      supabase.from("gastos").select("id, item, valor, valor_cop, fecha, propiedad_id, borrado").not("propiedad_id", "is", null),
      supabase.from("pagos_deuda").select("deuda_id, valor, fecha, origen"),
    ]);
    if (rP.error || rA.error) {
      setError((rP.error ?? rA.error)!.message);
      setCargando(false);
      return;
    }
    const mapaIpc: Record<number, number> = {};
    (rI.error ? [] : rI.data ?? []).forEach((r: any) => (mapaIpc[Number(r.anio)] = Number(r.variacion)));
    setIpc(mapaIpc);

    const hoy = hoyISO();
    const mesActual = hoy.slice(0, 7);
    const inicioAnio = `${hoy.slice(0, 4)}-01-01`;
    const hace12 = sumarMeses(hoy, -12);
    const deudas = (rD.data ?? []) as any[];
    const pendientes = (rC.data ?? []) as any[];
    const gastos = ((rG.error ? [] : rG.data) ?? []).filter((g: any) => !g.borrado) as any[];
    const pagos = ((rPag.error ? [] : rPag.data) ?? []).filter((p: any) => p.origen !== "registro_inicial") as any[];

    const combinadas: PropiedadConDetalle[] = (rP.data ?? []).map((p: any) => {
      const arriendos = (rA.data ?? []).filter((a: any) => a.propiedad_id === p.id) as ArriendoRow[];
      const deudasProp = deudas.filter((d) => d.propiedad_id === p.id || d.id === p.credito_id);
      const creditos: CreditoDePropiedad[] = deudasProp.map((d) => {
        const prox = pendientes.find((c) => c.deuda_id === d.id);
        return {
          id: d.id,
          nombre: d.nombre,
          entidad_pago: d.entidad_pago,
          numero_cuenta: d.numero_cuenta,
          alias_pago: d.alias_pago,
          proximaCuotaValor: prox ? restanteDeCuota(prox) : null,
          proximaCuotaFecha: prox?.fecha_vencimiento ?? null,
          proximaCuotaNumero: prox?.numero_cuota ?? null,
        };
      });
      const arriendo = arriendoVigente(p, mapaIpc, hoy);
      const fechaPagoMes = fechaPagoArriendo(mesActual, p.dia_pago_arriendo);
      const recibidoMes = arriendos.filter((a) => a.mes === mesActual).reduce((s, a) => s + Number(a.monto), 0);
      const diasParaPago = diasEntre(hoy, fechaPagoMes);
      const estadoMes: PropiedadConDetalle["estadoMes"] =
        recibidoMes >= arriendo.valor - 1 && recibidoMes > 0
          ? "recibido"
          : recibidoMes > 0
          ? "parcial"
          : diasParaPago < 0
          ? "vencido"
          : diasParaPago <= 5
          ? "por_vencer"
          : "pendiente";

      const ids = new Set(deudasProp.map((d) => d.id));
      const rend = (desde: string, hasta: string): Rendimiento => {
        const a = arriendos.filter((x) => x.fecha >= desde && x.fecha <= hasta).reduce((s, x) => s + Number(x.monto), 0);
        const g = gastos.filter((x) => x.propiedad_id === p.id && x.fecha >= desde && x.fecha <= hasta).reduce((s, x) => s + Number(x.valor_cop ?? x.valor), 0);
        const c = pagos.filter((x) => ids.has(x.deuda_id) && x.fecha >= desde && x.fecha <= hasta).reduce((s, x) => s + Number(x.valor), 0);
        return { desde, hasta, arriendos: a, gastos: g, cuotas: c, neto: a - g - c };
      };
      const rendimiento12m = rend(hace12, hoy);
      const proxCuotasMes = creditos.reduce((s, c) => s + (c.proximaCuotaFecha && mesDe(c.proximaCuotaFecha) === mesActual ? c.proximaCuotaValor ?? 0 : 0), 0);

      return {
        ...p,
        arriendos,
        arriendo,
        creditos,
        credito: creditos[0] ?? null,
        fechaPagoMes,
        diasParaPago,
        recibidoMes,
        estadoMes,
        gastosRecientes: gastos
          .filter((g) => g.propiedad_id === p.id)
          .sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)))
          .slice(0, 5)
          .map((g) => ({ id: g.id, item: g.item, valor: Number(g.valor_cop ?? g.valor), fecha: g.fecha })),
        rendimientoAnio: rend(inicioAnio, hoy),
        rendimiento12m,
        rentabilidadAnual: Number(p.valor_comercial) > 0 ? rendimiento12m.neto / Number(p.valor_comercial) : null,
        netoMesActual: (recibidoMes || arriendo.valor) - proxCuotasMes,
      };
    });

    setPropiedades(combinadas);
    setError(null);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function fila(d: DatosPropiedad) {
    return {
      nombre: d.nombre,
      direccion: d.direccion ?? null,
      arrendatario: d.arrendatario ?? null,
      valor_arriendo_inicial: d.valorArriendoInicial,
      valor_arriendo: d.valorArriendoInicial,
      fecha_inicio_contrato: d.fechaInicioContrato ?? null,
      dia_pago_arriendo: d.diaPagoArriendo ?? 5,
      valor_comercial: d.valorComercial ?? null,
      aplica_ipc: d.aplicaIpc ?? true,
    };
  }

  async function crearPropiedad(d: DatosPropiedad) {
    const { error: err } = await supabase.from("propiedades").insert(fila(d));
    if (err) throw err;
    await cargar();
  }

  async function editarPropiedad(id: string, d: DatosPropiedad) {
    const { error: err } = await supabase.from("propiedades").update(fila(d)).eq("id", id);
    if (err) throw err;
    await cargar();
  }

  /**
   * Registra el arriendo recibido y a dónde fue el dinero:
   * queda en el hogar, se le entregó a una persona, o pagó (parte de) la cuota de un crédito.
   */
  async function registrarArriendoRecibido(
    propiedadId: string,
    monto: number,
    opciones: { mes?: string; fecha?: string; destino?: DestinoArriendo; nota?: string } = {}
  ) {
    const fecha = opciones.fecha ?? hoyISO();
    const destino = opciones.destino ?? { tipo: "hogar" };
    const { data: arriendo, error: err } = await supabase
      .from("arriendos_recibidos")
      .insert({
        propiedad_id: propiedadId,
        monto,
        mes: opciones.mes ?? fecha.slice(0, 7),
        fecha,
        destino_persona: destino.tipo === "persona" ? destino.persona : null,
        nota: opciones.nota ?? null,
      })
      .select()
      .single();
    if (err) throw err;

    if (destino.tipo === "credito" && destino.valor > 0) {
      const prop = propiedades.find((p) => p.id === propiedadId);
      try {
        await registrarPagoDeuda({
          deudaId: destino.deudaId,
          valor: destino.valor,
          fecha,
          origen: "arriendo",
          pagadoPor: `Arriendo ${prop?.nombre ?? ""}`.trim(),
          arriendoId: arriendo.id,
        });
      } catch (e) {
        await supabase.from("arriendos_recibidos").delete().eq("id", arriendo.id);
        throw e;
      }
    }
    await cargar();
  }

  /** Borra un arriendo mal registrado (si pagó un crédito, ese pago también se borra). */
  async function eliminarArriendo(a: ArriendoRow) {
    const { data: pagosLigados } = await supabase.from("pagos_deuda").select("deuda_id").eq("arriendo_id", a.id);
    const { error: err } = await supabase.from("arriendos_recibidos").delete().eq("id", a.id);
    if (err) throw err;
    for (const p of pagosLigados ?? []) await reaplicarPagos((p as any).deuda_id);
    await cargar();
  }

  async function guardarIpc(anio: number, variacion: number) {
    const { error: err } = await supabase.from("ipc_anual").upsert({ anio, variacion });
    if (err) throw err;
    await cargar();
  }

  return { propiedades, ipc, cargando, error, crearPropiedad, editarPropiedad, registrarArriendoRecibido, eliminarArriendo, guardarIpc, recargar: cargar };
}
