// Caja de la casa: cuánto entró en el mes por arriendos, Uber (vehículo) y préstamos,
// y a dónde fue cada peso (crédito, ahorro, una persona) o si todavía está sin asignar.
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";
import { todo } from "../utils/consultas";
import { personasDelHogar, esDelHogar, LA_CASA } from "../utils/aportes";
import { registrarPagoDeuda, reaplicarPagos, nombreUsuarioActual } from "../utils/pagosDeuda";

export type Fuente = "arriendo" | "prestamo" | "vehiculo";

export interface DestinoLinea {
  texto: string;
  valor: number;
  asignacion?: AsignacionRow; // si se asignó desde esta pantalla, se puede quitar
}

export interface LineaCaja {
  clave: string;
  fuente: Fuente;
  fuenteId: string;
  titulo: string;
  subtitulo: string;
  fecha: string;
  monto: number;
  destinos: DestinoLinea[];
  sinAsignar: number;
}

export interface AsignacionRow {
  id: string;
  fuente: Fuente;
  fuente_id: string | null;
  mes: string;
  fecha: string;
  valor: number;
  destino_tipo: "credito" | "ahorro";
  destino_id: string;
  gasto_id: string | null;
  aporte_ahorro_id: string | null;
  vinculado?: boolean | null;
  pago_deuda_id?: string | null;
  nota: string | null;
}

export interface PagoDisponible {
  id: string;
  fecha: string;
  valor: number;
  pagado_por: string | null;
}

export interface TotalFuente {
  entro: number;
  asignado: number;
  sinAsignar: number;
}

export type DestinoElegido = { tipo: "credito"; deudaId: string } | { tipo: "ahorro"; metaId: string };

const vacio = (): TotalFuente => ({ entro: 0, asignado: 0, sinAsignar: 0 });

export function useCajaCasa(mes: string) {
  const [lineas, setLineas] = useState<LineaCaja[]>([]);
  const [deudas, setDeudas] = useState<{ id: string; nombre: string }[]>([]);
  const [metas, setMetas] = useState<{ id: string; nombre: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faltaSql, setFaltaSql] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [anio, m] = mes.split("-").map(Number);
    const inicio = `${mes}-01`;
    const fin = `${mes}-${String(new Date(anio, m, 0).getDate()).padStart(2, "0")}`;

    const [rArr, rProp, rPagos, rDeu, rMet, rPre, rAb, rVeh, rPV, rAsig, hogar] = await Promise.all([
      supabase.from("arriendos_recibidos").select("*").eq("mes", mes),
      supabase.from("propiedades").select("id, nombre"),
      todo(() => supabase.from("pagos_deuda").select("id, deuda_id, valor, arriendo_id").not("arriendo_id", "is", null).order("id")),
      supabase.from("deudas").select("id, nombre"),
      supabase.from("metas_ahorro").select("id, nombre"),
      supabase.from("prestamos_personales").select("*"),
      todo(() => supabase.from("abonos_prestamo").select("*").gte("fecha", inicio).lte("fecha", fin).order("id")),
      supabase.from("vehiculos").select("id, nombre, cuota_diaria"),
      todo(() => supabase.from("pagos_vehiculo").select("*").eq("estado", "pagado").gte("fecha", inicio).lte("fecha", fin).order("id")),
      supabase.from("asignaciones_caja").select("*").eq("mes", mes),
      personasDelHogar(),
    ]);

    if (rArr.error) {
      setError(rArr.error.message);
      setCargando(false);
      return;
    }
    setError(null);
    setFaltaSql(!!rAsig.error);
    const asignaciones = (rAsig.error ? [] : rAsig.data ?? []) as AsignacionRow[];

    const nombreDeuda = new Map((rDeu.data ?? []).map((d: any) => [d.id, d.nombre]));
    const nombreMeta = new Map((rMet.data ?? []).map((x: any) => [x.id, x.nombre]));
    setDeudas((rDeu.data ?? []) as any[]);
    setMetas((rMet.data ?? []) as any[]);

    const destinoDeAsignacion = (a: AsignacionRow): DestinoLinea => ({
      texto:
        a.destino_tipo === "credito"
          ? `→ Crédito ${nombreDeuda.get(a.destino_id) ?? ""}${a.vinculado ? " (pago ya registrado)" : ""}`.trim()
          : `→ Ahorro ${nombreMeta.get(a.destino_id) ?? ""}`.trim(),
      valor: Number(a.valor),
      asignacion: a,
    });

    const salida: LineaCaja[] = [];
    const cerrar = (l: Omit<LineaCaja, "sinAsignar">) => {
      const asignado = l.destinos.reduce((s, d) => s + d.valor, 0);
      salida.push({ ...l, sinAsignar: Math.max(0, Math.round(l.monto - asignado)) });
    };

    // ---- Arriendos ----
    const nombreProp = new Map((rProp.data ?? []).map((p: any) => [p.id, p.nombre]));
    const pagosArriendo = (rPagos.data ?? []) as any[];
    (rArr.data ?? []).forEach((a: any) => {
      const monto = Number(a.monto);
      const destinos: DestinoLinea[] = [];
      pagosArriendo
        .filter((p) => p.arriendo_id === a.id)
        .forEach((p) => destinos.push({ texto: `→ Crédito ${nombreDeuda.get(p.deuda_id) ?? ""}`.trim(), valor: Number(p.valor) }));
      asignaciones.filter((x) => x.fuente === "arriendo" && x.fuente_id === a.id).forEach((x) => destinos.push(destinoDeAsignacion(x)));
      if (a.destino_persona) {
        const resto = monto - destinos.reduce((s, d) => s + d.valor, 0);
        if (resto > 0.5) destinos.push({ texto: `→ Entregado a ${a.destino_persona}`, valor: resto });
      }
      cerrar({
        clave: `arriendo-${a.id}`,
        fuente: "arriendo",
        fuenteId: a.id,
        titulo: `Arriendo ${nombreProp.get(a.propiedad_id) ?? ""}`.trim(),
        subtitulo: String(a.fecha).slice(0, 10),
        fecha: String(a.fecha).slice(0, 10),
        monto,
        destinos,
      });
    });

    // ---- Préstamos que nos pagan (el hogar prestó a un tercero) ----
    const prestamos = new Map((rPre.data ?? []).map((p: any) => [p.id, p]));
    const direccion = (p: any): "prestamos" | "nos_prestan" | "interno" => {
      if (["prestamos", "nos_prestan", "interno"].includes(p.direccion)) return p.direccion;
      if (p.es_inversion) return "prestamos";
      const presta = esDelHogar(p.quien_presta, hogar.personas);
      const recibe = esDelHogar(p.quien_recibe, hogar.personas);
      if (presta && !recibe) return "prestamos";
      if (!presta && recibe) return "nos_prestan";
      return "interno";
    };
    (rAb.data ?? []).forEach((a: any) => {
      const p: any = prestamos.get(a.prestamo_id);
      if (!p || a.registro_inicial || direccion(p) !== "prestamos") return;
      const monto = Number(a.monto);
      const destinos: DestinoLinea[] = [];
      if (a.deuda_id) destinos.push({ texto: `→ Crédito ${nombreDeuda.get(a.deuda_id) ?? ""}`.trim(), valor: Number(a.valor_credito ?? a.monto) });
      asignaciones.filter((x) => x.fuente === "prestamo" && x.fuente_id === a.id).forEach((x) => destinos.push(destinoDeAsignacion(x)));
      if (a.destino_persona) {
        const resto = monto - destinos.reduce((s, d) => s + d.valor, 0);
        if (resto > 0.5) destinos.push({ texto: `→ Entregado a ${a.destino_persona}`, valor: resto });
      }
      cerrar({
        clave: `prestamo-${a.id}`,
        fuente: "prestamo",
        fuenteId: a.id,
        titulo: `Pago de ${p.quien_recibe}`,
        subtitulo: `${String(a.fecha).slice(0, 10)}${p.motivo ? ` · ${p.motivo}` : ""}`,
        fecha: String(a.fecha).slice(0, 10),
        monto,
        destinos,
      });
    });

    // ---- Vehículos (Uber): lo recaudado en el mes por cada vehículo ----
    (rVeh.data ?? []).forEach((v: any) => {
      const pagos = ((rPV.data ?? []) as any[]).filter((p) => p.vehiculo_id === v.id);
      if (!pagos.length) return;
      const monto = pagos.reduce((s, p) => s + Number(p.monto ?? v.cuota_diaria), 0);
      const destinos = asignaciones.filter((x) => x.fuente === "vehiculo" && x.fuente_id === v.id).map(destinoDeAsignacion);
      cerrar({
        clave: `vehiculo-${v.id}`,
        fuente: "vehiculo",
        fuenteId: v.id,
        titulo: v.nombre,
        subtitulo: `${pagos.length} día(s) pagado(s) en el mes`,
        fecha: fin,
        monto,
        destinos,
      });
    });

    setLineas(salida);
    setCargando(false);
  }, [mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totales: Record<Fuente, TotalFuente> = { arriendo: vacio(), vehiculo: vacio(), prestamo: vacio() };
  lineas.forEach((l) => {
    const t = totales[l.fuente];
    t.entro += l.monto;
    t.sinAsignar += l.sinAsignar;
    t.asignado += l.monto - l.sinAsignar;
  });
  const total = (["arriendo", "vehiculo", "prestamo"] as Fuente[]).reduce(
    (s, k) => ({ entro: s.entro + totales[k].entro, asignado: s.asignado + totales[k].asignado, sinAsignar: s.sinAsignar + totales[k].sinAsignar }),
    vacio()
  );

  /** Manda parte de lo que entró a un crédito (como pago de la casa) o a una meta de ahorro. */
  async function asignar(linea: LineaCaja, destino: DestinoElegido, valor: number, fecha: string) {
    if (!(valor > 0)) throw new Error("Escribe un valor mayor que cero.");
    if (valor > linea.sinAsignar + 0.5) throw new Error(`Solo quedan ${Math.round(linea.sinAsignar).toLocaleString("es-CO")} sin asignar en este ingreso.`);
    const yo = await nombreUsuarioActual();
    const base = { fuente: linea.fuente, fuente_id: linea.fuenteId, mes, fecha, valor: Math.round(valor), registrado_por: yo.nombre, nota: `Desde ${linea.titulo}` };

    if (destino.tipo === "credito") {
      const deuda = deudas.find((d) => d.id === destino.deudaId);
      const { data: gasto, error: errG } = await supabase
        .from("gastos")
        .insert({
          fecha,
          item: `Cuota ${deuda?.nombre ?? "crédito"}`,
          valor: Math.round(valor),
          moneda: "COP",
          valor_cop: Math.round(valor),
          usuario_pago_id: null,
          usuario_pago_nombre: LA_CASA,
          rubro: "Créditos",
          es_compartido: true,
          deuda_id: destino.deudaId,
          nota: `Pagado con ${linea.titulo}`,
        })
        .select()
        .single();
      if (errG) throw new Error(`No se pudo registrar el pago: ${errG.message}`);
      try {
        await registrarPagoDeuda({ deudaId: destino.deudaId, valor, fecha, origen: "persona", pagadoPor: LA_CASA, gastoId: gasto.id });
        const { error: errA } = await supabase.from("asignaciones_caja").insert({ ...base, destino_tipo: "credito", destino_id: destino.deudaId, gasto_id: String(gasto.id) });
        if (errA) throw new Error(errA.message);
      } catch (e: any) {
        await supabase.from("pagos_deuda").delete().eq("gasto_id", gasto.id);
        await supabase.from("gastos").delete().eq("id", gasto.id);
        await reaplicarPagos(destino.deudaId).catch(() => undefined);
        throw new Error(e.message ?? "No se pudo asignar el pago al crédito.");
      }
    } else {
      const { data: aporte, error: errP } = await supabase
        .from("aportes_ahorro")
        .insert({ meta_id: destino.metaId, monto: Math.round(valor), fecha, usuario_id: null, usuario_nombre: LA_CASA, nota: `Desde ${linea.titulo}` })
        .select()
        .single();
      if (errP) throw new Error(`No se pudo registrar el ahorro: ${errP.message}`);
      const { error: errA } = await supabase.from("asignaciones_caja").insert({ ...base, destino_tipo: "ahorro", destino_id: destino.metaId, aporte_ahorro_id: String(aporte.id) });
      if (errA) {
        await supabase.from("aportes_ahorro").delete().eq("id", aporte.id);
        throw new Error(errA.message);
      }
    }
    await cargar();
  }

  /** Pagos de un crédito que ya estaban registrados y se pueden enlazar con un ingreso (los de este mes y el siguiente). */
  async function pagosDisponibles(deudaId: string): Promise<PagoDisponible[]> {
    const [anio, m] = mes.split("-").map(Number);
    const inicio = `${mes}-01`;
    const finSig = `${String(new Date(anio, m + 1, 0).getFullYear())}-${String(new Date(anio, m + 1, 0).getMonth() + 1).padStart(2, "0")}-${String(new Date(anio, m + 1, 0).getDate()).padStart(2, "0")}`;
    const [rP, rV] = await Promise.all([
      supabase.from("pagos_deuda").select("id, fecha, valor, pagado_por, origen, arriendo_id, abono_prestamo_id, gasto_id").eq("deuda_id", deudaId).gte("fecha", inicio).lte("fecha", finSig).order("fecha"),
      supabase.from("asignaciones_caja").select("pago_deuda_id").not("pago_deuda_id", "is", null),
    ]);
    if (rP.error) throw new Error(rP.error.message);
    const ya = new Set((rV.error ? [] : rV.data ?? []).map((x: any) => String(x.pago_deuda_id)));
    return ((rP.data ?? []) as any[])
      .filter((p) => p.origen !== "registro_inicial" && !p.arriendo_id && !p.abono_prestamo_id && !ya.has(String(p.id)))
      .map((p) => ({ id: String(p.id), fecha: String(p.fecha).slice(0, 10), valor: Number(p.valor), pagado_por: p.pagado_por ?? null }));
  }

  /** Enlaza un ingreso con un pago de crédito que YA estaba registrado (no crea ningún pago nuevo). */
  async function vincular(linea: LineaCaja, deudaId: string, pago: PagoDisponible, valor: number) {
    if (!(valor > 0)) throw new Error("Escribe un valor mayor que cero.");
    if (valor > linea.sinAsignar + 0.5) throw new Error(`Solo quedan ${Math.round(linea.sinAsignar).toLocaleString("es-CO")} sin asignar en este ingreso.`);
    if (valor > pago.valor + 0.5) throw new Error(`Ese pago es de ${Math.round(pago.valor).toLocaleString("es-CO")}; no puedes enlazar más que eso.`);
    const yo = await nombreUsuarioActual();
    const { error } = await supabase.from("asignaciones_caja").insert({
      fuente: linea.fuente,
      fuente_id: linea.fuenteId,
      mes,
      fecha: pago.fecha,
      valor: Math.round(valor),
      destino_tipo: "credito",
      destino_id: deudaId,
      vinculado: true,
      pago_deuda_id: pago.id,
      registrado_por: yo.nombre,
      nota: `Enlazado con un pago ya registrado (${linea.titulo})`,
    });
    if (error) throw new Error(error.message);
    await cargar();
  }

  /** Deshace una asignación hecha desde esta pantalla (borra el pago o el aporte que se creó). */
  async function quitar(a: AsignacionRow) {
    if (a.vinculado) {
      // solo se desenlaza: el pago del crédito ya existía y se queda
      const { error: errV } = await supabase.from("asignaciones_caja").delete().eq("id", a.id);
      if (errV) throw new Error(errV.message);
      await cargar();
      return;
    }
    if (a.destino_tipo === "credito" && a.gasto_id) {
      await supabase.from("pagos_deuda").delete().eq("gasto_id", a.gasto_id);
      await supabase.from("gastos").delete().eq("id", a.gasto_id);
      await reaplicarPagos(a.destino_id);
    }
    if (a.destino_tipo === "ahorro" && a.aporte_ahorro_id) {
      await supabase.from("aportes_ahorro").delete().eq("id", a.aporte_ahorro_id);
    }
    const { error: err } = await supabase.from("asignaciones_caja").delete().eq("id", a.id);
    if (err) throw new Error(err.message);
    await cargar();
  }

  return { lineas, totales, total, deudas, metas, cargando, error, faltaSql, asignar, quitar, pagosDisponibles, vincular, recargar: cargar };
}
