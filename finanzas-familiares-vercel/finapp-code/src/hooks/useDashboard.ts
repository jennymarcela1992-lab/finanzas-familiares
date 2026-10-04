import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";
import { hoyISO, sumarMeses } from "../utils/amortizacion";
import { personasDelHogar, aportesDelMes, esDelHogar, AportePersona } from "../utils/aportes";

export interface MesBalance {
  mes: string; // AAAA-MM
  ingresos: number; // aportes + arriendos + vehículo + inversiones + préstamos cobrados
  aportes: number; // lo que cada persona aporta (base o ajustado)
  arriendos: number;
  vehiculo: number;
  inversiones: number; // ingresos de inversiones en conjunto
  prestamosCobrados: number; // abonos que pagan terceros a quienes les prestamos (o préstamos que nos hacen)
  desembolsos: number; // aumentos de créditos: dinero recibido del prestamista
  gastos: number;
  cuotas: number; // pagos de créditos registrados en el mes (cuotas + abonos extra)
  otrasSalidas: number; // egresos de inversiones + préstamos entregados a terceros + abonos a préstamos de terceros
  salidas: number; // gastos + cuotas + otrasSalidas
  balance: number; // ingresos - salidas
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
  aportesPersonas: AportePersona[]; // del mes elegido
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

    const [hogar, rAm, rPre, rAbP, rMov] = await Promise.all([
      personasDelHogar(),
      supabase.from("aportes_mes").select("mes, usuario_nombre, aporte").gte("mes", meses[0]).lte("mes", mes),
      supabase.from("prestamos_personales").select("id, quien_presta, quien_recibe, monto, fecha"),
      supabase.from("abonos_prestamo").select("prestamo_id, monto, fecha").gte("fecha", desde).lt("fecha", hasta),
      supabase.from("movimientos_inversion").select("tipo, monto, fecha").gte("fecha", desde).lt("fecha", hasta),
    ]);
    const rDes = await supabase.from("desembolsos_deuda").select("deuda_id, valor, fecha");
    const desembolsosTodos = (rDes.error ? [] : rDes.data ?? []) as any[];
    const [rG, rArr, rVeh, rPV, rCu, rDeu, rAb, rMet, rApo, rProp, rPag] = await Promise.all([
      supabase.from("gastos").select("id, fecha, valor, valor_cop, rubro, borrado, deuda_id").gte("fecha", desde).lt("fecha", hasta),
      supabase.from("arriendos_recibidos").select("propiedad_id, mes, monto").gte("mes", meses[0]).lte("mes", mes),
      supabase.from("vehiculos").select("id, nombre, cuota_diaria"),
      supabase.from("pagos_vehiculo").select("vehiculo_id, fecha, estado, monto").gte("fecha", desde).lt("fecha", hasta),
      supabase.from("cuotas_deuda").select("deuda_id, numero_cuota, cuota_total, valor_pagado, capital, abono_extra, fecha_vencimiento, estado"),
      supabase.from("deudas").select("id, nombre, valor_inicial, entidad_pago"),
      supabase.from("abonos_deuda").select("deuda_id, valor, fecha"),
      supabase.from("metas_ahorro").select("id, nombre, monto_objetivo"),
      supabase.from("aportes_ahorro").select("meta_id, monto"),
      supabase.from("propiedades").select("id, nombre, valor_arriendo"),
      supabase.from("pagos_deuda").select("fecha, valor, origen, gasto_id").gte("fecha", desde).lt("fecha", hasta),
    ]);

    const fallo = [rG, rCu, rDeu, rMet, rApo].find((r) => r.error);
    if (fallo?.error) {
      setError(fallo.error.message);
      setCargando(false);
      return;
    }

    // ---------- Balance por mes ----------
    const base = (m: string): MesBalance => ({
      mes: m, ingresos: 0, aportes: 0, arriendos: 0, vehiculo: 0, inversiones: 0, prestamosCobrados: 0, desembolsos: 0,
      gastos: 0, cuotas: 0, otrasSalidas: 0, salidas: 0, balance: 0,
    });
    const porMes = new Map(meses.map((m) => [m, base(m)]));

    // Los gastos que son pagos de créditos se cuentan en "cuotas", no en gastos (para no sumarlos dos veces)
    const gastosEnPapelera = new Set((rG.data ?? []).filter((g: any) => g.borrado).map((g: any) => g.id));
    (rG.data ?? []).forEach((g: any) => {
      if (g.borrado || g.deuda_id) return;
      const b = porMes.get(mesDe(g.fecha));
      if (b) b.gastos += Number(g.valor_cop ?? g.valor);
    });

    // Aportes de cada persona (base de $3.000.000 o el valor ajustado ese mes)
    const filasAportes = (rAm.data ?? []) as any[];
    const aportesPorMes = new Map(meses.map((m) => [m, aportesDelMes(m, hogar.personas, filasAportes, hogar.mesInicio)]));
    aportesPorMes.forEach((lista, m) => (porMes.get(m)!.aportes = lista.reduce((s, a) => s + a.aporte, 0)));

    // Inversiones en conjunto: ingresos suman, egresos restan
    (rMov.error ? [] : rMov.data ?? []).forEach((mv: any) => {
      const b = porMes.get(mesDe(mv.fecha));
      if (!b) return;
      if (mv.tipo === "ingreso") b.inversiones += Number(mv.monto);
      else b.otrasSalidas += Number(mv.monto);
    });

    // Préstamos con terceros: lo que nos devuelven es entrada; lo que prestamos es salida
    const prestamos = new Map((rPre.error ? [] : rPre.data ?? []).map((p: any) => [p.id, p]));
    const direccion = (p: any): "prestamos" | "nos_prestan" | "interno" => {
      const presta = esDelHogar(p.quien_presta, hogar.personas);
      const recibe = esDelHogar(p.quien_recibe, hogar.personas);
      if (presta && !recibe) return "prestamos";
      if (!presta && recibe) return "nos_prestan";
      return "interno";
    };
    prestamos.forEach((p: any) => {
      const b = porMes.get(mesDe(p.fecha));
      if (!b) return;
      const d = direccion(p);
      if (d === "prestamos") b.otrasSalidas += Number(p.monto);
      if (d === "nos_prestan") b.prestamosCobrados += Number(p.monto);
    });
    (rAbP.error ? [] : rAbP.data ?? []).forEach((a: any) => {
      const p = prestamos.get(a.prestamo_id);
      const b = porMes.get(mesDe(a.fecha));
      if (!p || !b) return;
      const d = direccion(p);
      if (d === "prestamos") b.prestamosCobrados += Number(a.monto);
      if (d === "nos_prestan") b.otrasSalidas += Number(a.monto);
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

    desembolsosTodos.forEach((x) => {
      const b = porMes.get(mesDe(x.fecha));
      if (b) b.desembolsos += Number(x.valor);
    });

    porMes.forEach((b) => {
      b.ingresos = b.aportes + b.arriendos + b.vehiculo + b.inversiones + b.prestamosCobrados + b.desembolsos;
      b.salidas = b.gastos + b.cuotas + b.otrasSalidas;
      b.balance = b.ingresos - b.salidas;
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
      if (c.estado === "pagada") capitalPagado.set(c.deuda_id, (capitalPagado.get(c.deuda_id) ?? 0) + Number(c.capital) + Number(c.abono_extra ?? 0));
    });
    (rAb.error ? [] : rAb.data ?? []).forEach((a: any) => capitalPagado.set(a.deuda_id, (capitalPagado.get(a.deuda_id) ?? 0) + Number(a.valor)));
    const deudas: DeudaResumen[] = (rDeu.data ?? [])
      .map((d: any) => {
        const inicial = Number(d.valor_inicial) + desembolsosTodos.filter((x) => x.deuda_id === d.id).reduce((s, x) => s + Number(x.valor), 0);
        return { nombre: d.nombre, inicial, saldo: Math.max(0, inicial - (capitalPagado.get(d.id) ?? 0)) };
      })
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
      aportesPersonas: aportesPorMes.get(mes) ?? [],
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
