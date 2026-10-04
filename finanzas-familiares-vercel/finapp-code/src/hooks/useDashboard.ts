import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";
import { hoyISO, sumarMeses } from "../utils/amortizacion";

export interface MesBalance {
  mes: string; // AAAA-MM
  ingresos: number;
  nomina: number;
  arriendos: number;
  vehiculo: number;
  gastos: number;
  cuotas: number; // pagos de créditos registrados en el mes (cuotas + abonos extra)
  balance: number; // ingresos - gastos - cuotas
}

export interface PagoProximo {
  tipo: "cuota" | "arriendo" | "vehiculo";
  titulo: string;
  detalle: string;
  valor: number | null;
  fecha: string | null; // null = sin fecha fija (ej. arriendo del mes)
  vencido: boolean;
}

export interface MetaResumen {
  nombre: string;
  ahorrado: number;
  objetivo: number;
}

export interface DeudaResumen {
  nombre: string;
  saldo: number;
  inicial: number;
}

export interface DatosDashboard {
  meses: MesBalance[]; // 6 meses, el último es el mes elegido
  actual: MesBalance;
  anterior: MesBalance;
  rubros: { etiqueta: string; valor: number }[];
  rubrosAnterior: Record<string, number>;
  proximos: PagoProximo[];
  metas: MetaResumen[];
  deudas: DeudaResumen[];
  totalAhorrado: number;
  totalDeuda: number;
}

const mesDe = (fecha: string) => String(fecha).slice(0, 7);
export const mesHoy = () => hoyISO().slice(0, 7);
export const moverMes = (mes: string, n: number) => sumarMeses(`${mes}-01`, n).slice(0, 7);

function finDeMes(mes: string) {
  return sumarMeses(`${mes}-01`, 1).slice(0, 7) + "-01";
}

export function useDashboard(mes: string) {
  const [datos, setDatos] = useState<DatosDashboard | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const meses = Array.from({ length: 6 }, (_, i) => moverMes(mes, i - 5));
    const desde = `${meses[0]}-01`;
    const hasta = finDeMes(mes); // exclusivo
    const hoy = hoyISO();
    const en30 = sumarMeses(hoy, 1);

    const [rG, rN, rDed, rArr, rVeh, rPV, rCu, rDeu, rAb, rMet, rApo, rProp, rPag] = await Promise.all([
      supabase.from("gastos").select("id, fecha, valor, valor_cop, rubro, borrado, deuda_id").gte("fecha", desde).lt("fecha", hasta),
      supabase.from("nomina_mensual").select("id, mes, sueldo_bruto").gte("mes", meses[0]).lte("mes", mes),
      supabase.from("deducciones_nomina").select("nomina_id, monto"),
      supabase.from("arriendos_recibidos").select("propiedad_id, mes, monto").gte("mes", meses[0]).lte("mes", mes),
      supabase.from("vehiculos").select("id, nombre, cuota_diaria"),
      supabase.from("pagos_vehiculo").select("vehiculo_id, fecha, estado, monto").gte("fecha", desde).lt("fecha", hasta),
      supabase.from("cuotas_deuda").select("deuda_id, numero_cuota, cuota_total, valor_pagado, capital, fecha_vencimiento, estado"),
      supabase.from("deudas").select("id, nombre, valor_inicial, entidad_pago"),
      supabase.from("abonos_deuda").select("deuda_id, valor, fecha"),
      supabase.from("metas_ahorro").select("id, nombre, monto_objetivo"),
      supabase.from("aportes_ahorro").select("meta_id, monto"),
      supabase.from("propiedades").select("id, nombre, valor_arriendo"),
      supabase.from("pagos_deuda").select("fecha, valor, origen, gasto_id").gte("fecha", desde).lt("fecha", hasta),
    ]);

    const fallo = [rG, rN, rCu, rDeu, rMet, rApo].find((r) => r.error);
    if (fallo?.error) {
      setError(fallo.error.message);
      setCargando(false);
      return;
    }

    // ---------- Balance por mes ----------
    const base = (m: string): MesBalance => ({ mes: m, ingresos: 0, nomina: 0, arriendos: 0, vehiculo: 0, gastos: 0, cuotas: 0, balance: 0 });
    const porMes = new Map(meses.map((m) => [m, base(m)]));

    // Los gastos que son pagos de créditos se cuentan en "cuotas", no en gastos (para no sumarlos dos veces)
    const gastosEnPapelera = new Set((rG.data ?? []).filter((g: any) => g.borrado).map((g: any) => g.id));
    (rG.data ?? []).forEach((g: any) => {
      if (g.borrado || g.deuda_id) return;
      const b = porMes.get(mesDe(g.fecha));
      if (b) b.gastos += Number(g.valor_cop ?? g.valor);
    });

    const deducciones = new Map<string, number>();
    (rDed.data ?? []).forEach((d: any) => deducciones.set(d.nomina_id, (deducciones.get(d.nomina_id) ?? 0) + Number(d.monto)));
    (rN.data ?? []).forEach((n: any) => {
      const b = porMes.get(n.mes);
      if (b) b.nomina += Number(n.sueldo_bruto) - (deducciones.get(n.id) ?? 0);
    });

    (rArr.data ?? []).forEach((a: any) => {
      const b = porMes.get(a.mes);
      if (b) b.arriendos += Number(a.monto);
    });

    const cuotaDiaria = new Map((rVeh.data ?? []).map((v: any) => [v.id, Number(v.cuota_diaria)]));
    (rPV.data ?? []).forEach((p: any) => {
      if (p.estado !== "pagado") return;
      const b = porMes.get(mesDe(p.fecha));
      if (b) b.vehiculo += Number(p.monto ?? cuotaDiaria.get(p.vehiculo_id) ?? 0);
    });

    (rPag.error ? [] : rPag.data ?? []).forEach((p: any) => {
      if (p.origen === "registro_inicial" || (p.gasto_id && gastosEnPapelera.has(p.gasto_id))) return;
      const b = porMes.get(mesDe(p.fecha));
      if (b) b.cuotas += Number(p.valor);
    });
    (rAb.error ? [] : rAb.data ?? []).forEach((a: any) => {
      const b = porMes.get(mesDe(a.fecha));
      if (b) b.cuotas += Number(a.valor);
    });

    porMes.forEach((b) => {
      b.ingresos = b.nomina + b.arriendos + b.vehiculo;
      b.balance = b.ingresos - b.gastos - b.cuotas;
    });
    const lista = meses.map((m) => porMes.get(m)!);

    // ---------- Rubros del mes y del anterior ----------
    const rubros: Record<string, number> = {};
    const rubrosAnterior: Record<string, number> = {};
    const mesAnterior = moverMes(mes, -1);
    (rG.data ?? []).forEach((g: any) => {
      if (g.borrado || g.deuda_id) return;
      const r = g.rubro || "Otro";
      const v = Number(g.valor_cop ?? g.valor);
      if (mesDe(g.fecha) === mes) rubros[r] = (rubros[r] ?? 0) + v;
      if (mesDe(g.fecha) === mesAnterior) rubrosAnterior[r] = (rubrosAnterior[r] ?? 0) + v;
    });

    // ---------- Deudas ----------
    const deudasInfo = new Map((rDeu.data ?? []).map((d: any) => [d.id, d]));
    const capitalPagado = new Map<string, number>();
    (rCu.data ?? []).forEach((c: any) => {
      if (c.estado === "pagada") capitalPagado.set(c.deuda_id, (capitalPagado.get(c.deuda_id) ?? 0) + Number(c.capital));
    });
    (rAb.error ? [] : rAb.data ?? []).forEach((a: any) => capitalPagado.set(a.deuda_id, (capitalPagado.get(a.deuda_id) ?? 0) + Number(a.valor)));
    const deudas: DeudaResumen[] = (rDeu.data ?? [])
      .map((d: any) => ({ nombre: d.nombre, inicial: Number(d.valor_inicial), saldo: Math.max(0, Number(d.valor_inicial) - (capitalPagado.get(d.id) ?? 0)) }))
      .filter((d) => d.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo);

    // ---------- Ahorros ----------
    const ahorrado = new Map<string, number>();
    (rApo.data ?? []).forEach((a: any) => ahorrado.set(a.meta_id, (ahorrado.get(a.meta_id) ?? 0) + Number(a.monto)));
    const metas: MetaResumen[] = (rMet.data ?? [])
      .map((m: any) => ({ nombre: m.nombre, objetivo: Number(m.monto_objetivo), ahorrado: ahorrado.get(m.id) ?? 0 }))
      .sort((a, b) => b.ahorrado - a.ahorrado);

    // ---------- Próximos pagos (desde hoy, 30 días) ----------
    const proximos: PagoProximo[] = [];
    const primeraPendiente = new Map<string, any>();
    (rCu.data ?? [])
      .filter((c: any) => c.estado === "pendiente")
      .sort((a: any, b: any) => a.numero_cuota - b.numero_cuota)
      .forEach((c: any) => {
        if (c.fecha_vencimiento < hoy) {
          const d = deudasInfo.get(c.deuda_id);
          proximos.push({ tipo: "cuota", titulo: d?.nombre ?? "Crédito", detalle: `Cuota #${c.numero_cuota} vencida${d?.entidad_pago ? ` · ${d.entidad_pago}` : ""}`, valor: Number(c.cuota_total) - Number(c.valor_pagado ?? 0), fecha: c.fecha_vencimiento, vencido: true });
        } else if (!primeraPendiente.has(c.deuda_id)) primeraPendiente.set(c.deuda_id, c);
      });
    primeraPendiente.forEach((c) => {
      if (c.fecha_vencimiento > en30) return;
      const d = deudasInfo.get(c.deuda_id);
      proximos.push({ tipo: "cuota", titulo: d?.nombre ?? "Crédito", detalle: `Cuota #${c.numero_cuota}${d?.entidad_pago ? ` · ${d.entidad_pago}` : ""}`, valor: Number(c.cuota_total) - Number(c.valor_pagado ?? 0), fecha: c.fecha_vencimiento, vencido: false });
    });

    const mesActual = hoy.slice(0, 7);
    const { data: arriendosHoy } = await supabase.from("arriendos_recibidos").select("propiedad_id").eq("mes", mesActual);
    const yaRecibidos = new Set((arriendosHoy ?? []).map((a: any) => a.propiedad_id));
    (rProp.error ? [] : rProp.data ?? []).forEach((p: any) => {
      if (!yaRecibidos.has(p.id)) proximos.push({ tipo: "arriendo", titulo: p.nombre, detalle: "Arriendo por cobrar este mes", valor: Number(p.valor_arriendo), fecha: null, vencido: false });
    });

    proximos.sort((a, b) => Number(b.vencido) - Number(a.vencido) || (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999"));

    setDatos({
      meses: lista,
      actual: lista[5],
      anterior: lista[4],
      rubros: Object.entries(rubros).map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor),
      rubrosAnterior,
      proximos,
      metas,
      deudas,
      totalAhorrado: metas.reduce((s, m) => s + m.ahorrado, 0),
      totalDeuda: deudas.reduce((s, d) => s + d.saldo, 0),
    });
    setError(null);
    setCargando(false);
  }, [mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { datos, cargando, error, recargar: cargar };
}
