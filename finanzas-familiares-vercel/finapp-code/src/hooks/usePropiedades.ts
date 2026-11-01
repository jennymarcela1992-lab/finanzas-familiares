import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";
import { todo } from "../utils/consultas";
import { registrarPagoDeuda, restanteDeCuota, reaplicarPagos } from "../utils/pagosDeuda";
import { hoyISO, sumarMeses } from "../utils/amortizacion";
import { arriendoDePropiedad, fechaPagoArriendo, diasEntre, ValorArriendo, ContratoArriendo } from "../utils/arriendo";
import { cargarVinculos } from "../utils/deudaActivos";

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
  porcentaje: number; // % del crédito que le corresponde a esta propiedad
}

export interface Rendimiento {
  desde: string;
  hasta: string;
  arriendos: number;
  gastos: number;
  cuotas: number; // pagos a créditos de la propiedad (solo su porcentaje)
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
  genera_ingresos: boolean; // false = uso propio: solo patrimonio y gastos
  contratos: ContratoArriendo[];
  contrato: ContratoArriendo | null; // contrato vigente (null = desocupada o uso propio)
  arriendos: ArriendoRow[];
  arriendo: ValorArriendo; // valor vigente con IPC (0 si no hay contrato)
  creditos: CreditoDePropiedad[];
  credito: CreditoDePropiedad | null; // el primero (compatibilidad)
  // estado del arriendo de este mes
  fechaPagoMes: string;
  diasParaPago: number; // negativo = vencido
  recibidoMes: number;
  estadoMes: "recibido" | "parcial" | "por_vencer" | "vencido" | "pendiente" | "sin_contrato" | "uso_propio";
  gastosRecientes: { id: string; item: string; valor: number; fecha: string }[];
  rendimientoAnio: Rendimiento;
  rendimiento12m: Rendimiento;
  rentabilidadAnual: number | null; // neto 12 meses / valor comercial
  netoMesActual: number;
}

export interface DatosPropiedad {
  nombre: string;
  direccion?: string;
  valorComercial?: number | null;
  generaIngresos: boolean;
  /** Solo al crear: el primer contrato de arriendo (opcional). */
  contrato?: DatosContrato | null;
}

export interface DatosContrato {
  arrendatario?: string;
  fechaInicio: string;
  canonInicial: number;
  diaPago: number;
  duracionMeses: number;
  aplicaIpc: boolean;
}

const VALOR_VACIO: ValorArriendo = { valor: 0, ultimoAjuste: null, proximoAjuste: null, ipcFaltante: [], ajustes: [], proximoIpc: null };

export type DestinoArriendo =
  | { tipo: "hogar" }
  | { tipo: "persona"; persona: string }
  | { tipo: "credito"; deudaId: string; valor: number };

const mesDe = (f: string) => String(f).slice(0, 7);

function contratoActivoDe(filas: any[]) {
  const hoy = hoyISO();
  return filas
    .filter((c) => !c.fecha_fin || String(c.fecha_fin).slice(0, 10) >= hoy)
    .sort((a, b) => String(b.fecha_inicio).localeCompare(String(a.fecha_inicio)))[0] ?? null;
}

export function usePropiedades() {
  const [propiedades, setPropiedades] = useState<PropiedadConDetalle[]>([]);
  const [ipc, setIpc] = useState<Record<number, number>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [rP, rA, rI, rD, rC, rG, rPag, rK, vinculos] = await Promise.all([
      supabase.from("propiedades").select("*").order("creado_en", { ascending: false }),
      todo(() => supabase.from("arriendos_recibidos").select("*").order("fecha", { ascending: false }).order("id")),
      supabase.from("ipc_anual").select("*"),
      supabase.from("deudas").select("*"),
      todo(() => supabase.from("cuotas_deuda").select("id, deuda_id, numero_cuota, cuota_total, valor_pagado, fecha_vencimiento, estado").eq("estado", "pendiente").order("numero_cuota").order("id")),
      todo(() => supabase.from("gastos").select("id, item, valor, valor_cop, fecha, propiedad_id, borrado").not("propiedad_id", "is", null).order("id")),
      todo(() => supabase.from("pagos_deuda").select("id, deuda_id, valor, fecha, origen").order("id")),
      supabase.from("contratos_arriendo").select("*"),
      cargarVinculos(),
    ]);
    const contratosFilas = rK.error ? null : ((rK.data ?? []) as any[]);
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
      const pctDe = new Map(vinculos.filter((v) => v.tipo === "propiedad" && v.activo_id === p.id).map((v) => [v.deuda_id, v.porcentaje]));
      const deudasProp = deudas.filter((d) => pctDe.has(d.id));
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
          porcentaje: pctDe.get(d.id) ?? 100,
        };
      });
      const generaIngresos = p.genera_ingresos !== false;
      const info = arriendoDePropiedad(p, contratosFilas, mapaIpc, hoy);
      const arriendo = info.valor ?? VALOR_VACIO;
      const contrato = info.contrato;
      const fechaPagoMes = fechaPagoArriendo(mesActual, contrato?.dia_pago ?? p.dia_pago_arriendo);
      const recibidoMes = arriendos.filter((a) => a.mes === mesActual).reduce((s, a) => s + Number(a.monto), 0);
      const diasParaPago = diasEntre(hoy, fechaPagoMes);
      const estadoMes: PropiedadConDetalle["estadoMes"] = !generaIngresos
        ? "uso_propio"
        : !contrato || contrato.fecha_inicio > hoy
        ? recibidoMes > 0 ? "recibido" : "sin_contrato"
        : recibidoMes >= arriendo.valor - 1 && recibidoMes > 0
          ? "recibido"
          : recibidoMes > 0
          ? "parcial"
          : diasParaPago < 0
          ? "vencido"
          : diasParaPago <= 5
          ? "por_vencer"
          : "pendiente";


      const rend = (desde: string, hasta: string): Rendimiento => {
        const a = arriendos.filter((x) => x.fecha >= desde && x.fecha <= hasta).reduce((s, x) => s + Number(x.monto), 0);
        const g = gastos.filter((x) => x.propiedad_id === p.id && x.fecha >= desde && x.fecha <= hasta).reduce((s, x) => s + Number(x.valor_cop ?? x.valor), 0);
        const c = pagos.filter((x) => pctDe.has(x.deuda_id) && x.fecha >= desde && x.fecha <= hasta).reduce((s, x) => s + (Number(x.valor) * pctDe.get(x.deuda_id)!) / 100, 0);
        return { desde, hasta, arriendos: a, gastos: g, cuotas: c, neto: a - g - c };
      };
      const rendimiento12m = rend(hace12, hoy);
      const proxCuotasMes = creditos.reduce((s, c) => s + (c.proximaCuotaFecha && mesDe(c.proximaCuotaFecha) === mesActual ? ((c.proximaCuotaValor ?? 0) * c.porcentaje) / 100 : 0), 0);

      return {
        ...p,
        genera_ingresos: generaIngresos,
        contratos: info.contratos,
        contrato,
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
        rentabilidadAnual: generaIngresos && Number(p.valor_comercial) > 0 ? rendimiento12m.neto / Number(p.valor_comercial) : null,
        netoMesActual: (recibidoMes || (contrato ? arriendo.valor : 0)) - proxCuotasMes,
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
      valor_comercial: d.valorComercial ?? null,
      genera_ingresos: d.generaIngresos,
    };
  }

  /** Copia el contrato vigente a los campos viejos de la propiedad (para pantallas que aún los leen). */
  async function sincronizarPropiedad(propiedadId: string) {
    const { data } = await supabase.from("contratos_arriendo").select("*").eq("propiedad_id", propiedadId);
    const activo = contratoActivoDe((data ?? []) as any[]);
    await supabase
      .from("propiedades")
      .update(
        activo
          ? {
              arrendatario: activo.arrendatario,
              valor_arriendo: activo.canon_inicial,
              valor_arriendo_inicial: activo.canon_inicial,
              fecha_inicio_contrato: activo.fecha_inicio,
              dia_pago_arriendo: activo.dia_pago,
              aplica_ipc: activo.aplica_ipc,
            }
          : { arrendatario: null, valor_arriendo: 0, valor_arriendo_inicial: null, fecha_inicio_contrato: null }
      )
      .eq("id", propiedadId);
  }

  async function crearPropiedad(d: DatosPropiedad) {
    const c = d.generaIngresos ? d.contrato : null;
    const { data: creada, error: err } = await supabase
      .from("propiedades")
      .insert({ ...fila(d), valor_arriendo: c?.canonInicial ?? 0, arrendatario: c?.arrendatario ?? null, dia_pago_arriendo: c?.diaPago ?? 5 })
      .select()
      .single();
    if (err) throw err;
    if (c && c.canonInicial > 0) await guardarContrato(creada.id, c, null, false);
    await cargar();
  }

  async function editarPropiedad(id: string, d: DatosPropiedad) {
    const { error: err } = await supabase.from("propiedades").update(fila(d)).eq("id", id);
    if (err) throw err;
    await cargar();
  }

  async function eliminarPropiedad(id: string) {
    const { error: err } = await supabase.from("propiedades").delete().eq("id", id);
    if (err) throw err;
    await cargar();
  }

  /**
   * Se anotó por error como propiedad pero es un vehículo: lo crea en Vehículos (de uso propio, con su valor)
   * y le pasa los gastos, gastos automáticos y créditos asociados. Luego borra la propiedad.
   */
  async function moverAVehiculo(p: PropiedadConDetalle) {
    const placa = (p.nombre.match(/\b([A-Z]{3}\s?-?\d{2,3}[A-Z]?)\b/i)?.[1] ?? "").replace(/[\s-]/g, "").toUpperCase() || null;
    const { data: v, error: errV } = await supabase
      .from("vehiculos")
      .insert({
        // "Moto FLJ51F" → nombre "Moto", placa "FLJ51F"
        nombre: (placa ? p.nombre.replace(/\b[A-Z]{3}\s?-?\d{2,3}[A-Z]?\b/i, "").replace(/\s+/g, " ").trim() : p.nombre) || p.nombre,
        placa,
        cuota_diaria: 0,
        dia_descanso: 0,
        genera_ingresos: false,
        valor_comercial: p.valor_comercial ?? null,
      })
      .select()
      .single();
    if (errV) throw errV;
    await supabase.from("gastos").update({ vehiculo_id: v.id, propiedad_id: null }).eq("propiedad_id", p.id);
    await supabase.from("gastos_recurrentes").update({ vehiculo_id: v.id, propiedad_id: null }).eq("propiedad_id", p.id);
    await supabase.from("deuda_activos").update({ vehiculo_id: v.id, propiedad_id: null }).eq("propiedad_id", p.id);
    await supabase.from("deudas").update({ vehiculo_id: v.id, propiedad_id: null }).eq("propiedad_id", p.id);
    await supabase.from("propiedades").update({ credito_id: null }).eq("id", p.id);
    const { error: errDel } = await supabase.from("propiedades").delete().eq("id", p.id);
    if (errDel) throw errDel;
    await cargar();
  }

  /** Crea un contrato nuevo (o corrige uno existente si se pasa su id). */
  async function guardarContrato(propiedadId: string, c: DatosContrato, contratoId: string | null, recargar = true) {
    const filaC = {
      propiedad_id: propiedadId,
      arrendatario: c.arrendatario?.trim() || null,
      fecha_inicio: c.fechaInicio,
      canon_inicial: Math.round(c.canonInicial),
      dia_pago: c.diaPago,
      duracion_meses: c.duracionMeses,
      aplica_ipc: c.aplicaIpc,
    };
    const { error: err } = contratoId
      ? await supabase.from("contratos_arriendo").update(filaC).eq("id", contratoId)
      : await supabase.from("contratos_arriendo").insert(filaC);
    if (err) throw new Error(err.message.includes("contratos_arriendo") ? "Falta correr el archivo sql/9 en Supabase para manejar contratos." : err.message);
    await sincronizarPropiedad(propiedadId);
    if (recargar) await cargar();
  }

  /** El arrendatario se fue: el contrato termina y deja de esperarse arriendo desde esa fecha. */
  async function terminarContrato(contrato: ContratoArriendo, fechaFin: string, motivo?: string) {
    if (!contrato.id) throw new Error("Falta correr el archivo sql/9 en Supabase para manejar contratos.");
    const { error: err } = await supabase.from("contratos_arriendo").update({ fecha_fin: fechaFin, motivo_fin: motivo || null }).eq("id", contrato.id);
    if (err) throw err;
    await sincronizarPropiedad(contrato.propiedad_id);
    await cargar();
  }

  async function eliminarContrato(contrato: ContratoArriendo) {
    if (!contrato.id) return;
    const { error: err } = await supabase.from("contratos_arriendo").delete().eq("id", contrato.id);
    if (err) throw err;
    await sincronizarPropiedad(contrato.propiedad_id);
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
        ...(propiedades.find((p) => p.id === propiedadId)?.contrato?.id ? { contrato_id: propiedades.find((p) => p.id === propiedadId)!.contrato!.id } : {}),
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

  return {
    propiedades,
    ipc,
    cargando,
    error,
    crearPropiedad,
    editarPropiedad,
    eliminarPropiedad,
    moverAVehiculo,
    guardarContrato,
    terminarContrato,
    eliminarContrato,
    registrarArriendoRecibido,
    eliminarArriendo,
    guardarIpc,
    recargar: cargar,
  };
}
