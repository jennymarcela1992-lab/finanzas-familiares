// Reporte de gastos de Juanes para su papá: toma de los gastos de la familia (y de los propios) los que dicen
// «ruta», «onces» o «Juanes» (o tienen el rubro Juanes), más líneas manuales, y calcula la parte que le corresponde.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../config/supabase";
import { moverMes } from "./useDashboard";

export interface LineaReporte {
  clave: string; // id único
  fecha: string;
  concepto: string; // agrupador: «Ruta escolar», «Onces» o el nombre del gasto
  detalle: string;
  valor: number;
  origen: "familia" | "personal" | "manual";
  idManual?: string;
}

export interface ConfigReporte {
  cuota: number;
  pago: number;
  saldoAnterior: number;
  porcentaje: number;
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** ¿Este gasto es de los que van en el reporte? Devuelve el concepto agrupador o null. */
export function conceptoJuanes(item: string, nota: string | null | undefined, rubro: string | null | undefined, categoria?: string | null): string | null {
  const t = sinTildes(`${item} ${nota ?? ""}`);
  if (/\bruta(s)?\b/.test(t)) return "Ruta escolar";
  if (/\bonces?\b/.test(t)) return "Onces";
  const esJuanes = /\bjuanes\b/.test(t) || sinTildes(rubro ?? "") === "juanes" || sinTildes(categoria ?? "") === "juanes";
  return esJuanes ? item.trim() || "Gasto de Juanes" : null;
}

export function useReporteJuanes(mes: string) {
  const [lineas, setLineas] = useState<LineaReporte[]>([]);
  const [config, setConfig] = useState<ConfigReporte>({ cuota: 0, pago: 0, saldoAnterior: 0, porcentaje: 50 });
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [faltaSql, setFaltaSql] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) {
      setError("Tu sesión expiró. Vuelve a iniciar sesión.");
      setCargando(false);
      return;
    }
    const desde = `${mes}-01`;
    const hasta = `${moverMes(mes, 1)}-01`;
    const [rG, rP, rL, rC] = await Promise.all([
      supabase.from("gastos").select("id, fecha, item, nota, rubro, valor, valor_cop, borrado, usuario_pago_nombre").gte("fecha", desde).lt("fecha", hasta),
      supabase.from("movimientos_personales").select("*").eq("usuario_id", uid).eq("tipo", "gasto").gte("fecha", desde).lt("fecha", hasta),
      supabase.from("reporte_juanes_lineas").select("*").eq("usuario_id", uid).eq("mes", mes).order("creado_en"),
      supabase.from("reporte_juanes_mes").select("*").eq("usuario_id", uid).eq("mes", mes).maybeSingle(),
    ]);
    if (rL.error && /relation|does not exist|schema cache/i.test(rL.error.message)) {
      setFaltaSql(true);
      setCargando(false);
      return;
    }
    setFaltaSql(false);
    const out: LineaReporte[] = [];
    ((rG.error ? [] : rG.data) ?? []).forEach((g: any) => {
      if (g.borrado) return;
      const c = conceptoJuanes(g.item ?? "", g.nota, g.rubro);
      if (c) out.push({ clave: `g-${g.id}`, fecha: String(g.fecha).slice(0, 10), concepto: c, detalle: `${g.item}${g.usuario_pago_nombre ? ` · pagó ${g.usuario_pago_nombre}` : ""}`, valor: Number(g.valor_cop ?? g.valor), origen: "familia" });
    });
    ((rP.error ? [] : rP.data) ?? []).forEach((m: any) => {
      const c = conceptoJuanes(m.concepto ?? "", m.nota, null, m.categoria);
      if (c) out.push({ clave: `p-${m.id}`, fecha: String(m.fecha).slice(0, 10), concepto: c, detalle: `${m.concepto} (mis finanzas)`, valor: Number(m.valor), origen: "personal" });
    });
    ((rL.error ? [] : rL.data) ?? []).forEach((l: any) => out.push({ clave: `m-${l.id}`, fecha: `${mes}-01`, concepto: l.concepto, detalle: l.nota ?? "Agregado a mano", valor: Number(l.valor_total), origen: "manual", idManual: l.id }));
    out.sort((a, b) => a.fecha.localeCompare(b.fecha));
    setLineas(out);
    const c: any = rC.error ? null : rC.data;
    setConfig(c ? { cuota: Number(c.cuota ?? 0), pago: Number(c.pago ?? 0), saldoAnterior: Number(c.saldo_anterior ?? 0), porcentaje: Number(c.porcentaje ?? 50) } : { cuota: 0, pago: 0, saldoAnterior: 0, porcentaje: 50 });
    setExcluidas(new Set());
    setError(null);
    setCargando(false);
  }, [mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const incluidas = useMemo(() => lineas.filter((l) => !excluidas.has(l.clave)), [lineas, excluidas]);
  const totalGastos = incluidas.reduce((s, l) => s + l.valor, 0);
  const parteGastos = (totalGastos * config.porcentaje) / 100;
  const totalCargo = parteGastos + config.cuota;
  const saldo = config.saldoAnterior + totalCargo - config.pago;

  function alternar(clave: string) {
    setExcluidas((prev) => {
      const n = new Set(prev);
      n.has(clave) ? n.delete(clave) : n.add(clave);
      return n;
    });
  }

  async function guardarConfig(c: ConfigReporte) {
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) throw new Error("Tu sesión expiró.");
    const { error: err } = await supabase.from("reporte_juanes_mes").upsert({ usuario_id: uid, mes, cuota: c.cuota, pago: c.pago, saldo_anterior: c.saldoAnterior, porcentaje: c.porcentaje });
    if (err) throw err;
    setConfig(c);
  }

  async function agregarLinea(concepto: string, valorTotal: number, nota?: string) {
    const { data: sesion } = await supabase.auth.getUser();
    const uid = sesion.user?.id;
    if (!uid) throw new Error("Tu sesión expiró.");
    const { error: err } = await supabase.from("reporte_juanes_lineas").insert({ usuario_id: uid, mes, concepto: concepto.trim(), valor_total: valorTotal, nota: nota?.trim() || null });
    if (err) throw err;
    await cargar();
  }

  async function borrarLinea(id: string) {
    const { error: err } = await supabase.from("reporte_juanes_lineas").delete().eq("id", id);
    if (err) throw err;
    await cargar();
  }

  return { lineas, incluidas, excluidas, config, cargando, faltaSql, error, totalGastos, parteGastos, totalCargo, saldo, alternar, guardarConfig, agregarLinea, borrarLinea };
}
