import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../config/supabase";
import { useDashboard, mesHoy, moverMes } from "../../hooks/useDashboard";
import { useDetalleIngresos } from "../../hooks/useDetalleIngresos";
import { useAuth } from "../../hooks/useAuth";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius, esOscuro } from "../../theme/theme";
import { pesos } from "../../utils/amortizacion";
import { descargarXlsx, Hoja } from "../../utils/xlsx";
import { mesCerrado, cerrarMes, reabrirMes, MesCerrado } from "../../utils/cierreMes";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Colores de las series (paleta validada para gráficos): un color fijo por concepto
const SERIE = esOscuro
  ? { ingresos: "#3987e5", salidas: "#d95926", c3: "#199e70", c4: "#c98500", c5: "#d55181", c6: "#9085e9", c7: "#e66767" }
  : { ingresos: "#2a78d6", salidas: "#eb6834", c3: "#1baf7a", c4: "#eda100", c5: "#e87ba4", c6: "#6250d6", c7: "#e34948" };

const corto = (n: number) => {
  const v = Math.abs(n);
  const signo = n < 0 ? "-" : "";
  if (v >= 1_000_000) return `${signo}$${(v / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (v >= 1_000) return `${signo}$${Math.round(v / 1_000)} mil`;
  return `${signo}$${Math.round(v)}`;
};
const mesCorto = (m: string) => MESES[Number(m.slice(5, 7)) - 1].slice(0, 3);

interface Linea {
  titulo: string;
  sub: string;
  valor: number;
}

interface Obs {
  nivel: "ok" | "aviso" | "info";
  texto: string;
}

interface GastoMes {
  fecha: string;
  item: string;
  rubro: string;
  valor: number;
  pago: string;
  compartido: boolean;
  esCredito: boolean;
  nota: string;
}
interface PagoCredito {
  fecha: string;
  credito: string;
  valor: number;
  pagadoPor: string;
  origen: string;
}

export default function InformeMesScreen() {
  const [mes, setMes] = useState(mesHoy());
  const { datos, cargando, error } = useDashboard(mes);
  const detalle = useDetalleIngresos(mes);
  const { usuario } = useAuth();
  const [gastos, setGastos] = useState<GastoMes[]>([]);
  const [pagosCredito, setPagosCredito] = useState<PagoCredito[]>([]);
  const [cierre, setCierre] = useState<MesCerrado | null>(null);
  const [otrasSalidas, setOtrasSalidas] = useState<Linea[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [panel, setPanel] = useState<"cerrar" | "abrir" | null>(null);
  const esMesActual = mes === mesHoy();

  const cargarCierre = useCallback(async () => setCierre(await mesCerrado(mes)), [mes]);

  useEffect(() => {
    let vivo = true;
    setPanel(null);
    setClave("");
    setClave2("");
    (async () => {
      const desde = `${mes}-01`;
      const hasta = `${moverMes(mes, 1)}-01`;
      const [rG, rP, rD, rAD, rMov, rInv, rPre, rAbP] = await Promise.all([
        supabase.from("gastos").select("*").gte("fecha", desde).lt("fecha", hasta).order("fecha"),
        supabase.from("pagos_deuda").select("*").gte("fecha", desde).lt("fecha", hasta).order("fecha"),
        supabase.from("deudas").select("id, nombre"),
        supabase.from("abonos_deuda").select("*").gte("fecha", desde).lt("fecha", hasta),
        supabase.from("movimientos_inversion").select("*").gte("fecha", desde).lt("fecha", hasta),
        supabase.from("inversiones").select("id, nombre"),
        supabase.from("prestamos_personales").select("*"),
        supabase.from("abonos_prestamo").select("*").gte("fecha", desde).lt("fecha", hasta),
      ]);
      if (!vivo) return;
      const lista = (r: any) => ((r.error ? [] : r.data) ?? []) as any[];
      const enPapelera = new Set(lista(rG).filter((g) => g.borrado).map((g) => g.id));
      const fmt = (f: string) => String(f).slice(0, 10);
      // otras salidas: egresos de inversiones, préstamos entregados y abonos a préstamos que nos hicieron
      const prestamos = new Map(lista(rPre).map((x) => [x.id, x]));
      const salidas: Linea[] = [
        ...lista(rMov).filter((m) => m.tipo !== "ingreso").map((m) => ({ titulo: `Inversión · ${lista(rInv).find((i) => i.id === m.inversion_id)?.nombre ?? ""}`, sub: `${fmt(m.fecha)}${m.concepto ? ` · ${m.concepto}` : ""}`, valor: Number(m.monto) })),
        ...[...prestamos.values()]
          .filter((x) => x.direccion === "prestamos" && !x.deuda_origen_id && String(x.fecha).slice(0, 7) === mes)
          .map((x) => ({ titulo: `Préstamo entregado a ${x.quien_recibe ?? "un tercero"}`, sub: fmt(x.fecha), valor: Number(x.monto) })),
        ...lista(rAbP)
          .filter((a) => !a.registro_inicial && prestamos.get(a.prestamo_id)?.direccion === "nos_prestan")
          .map((a) => ({ titulo: `Abono al préstamo de ${prestamos.get(a.prestamo_id)?.quien_presta ?? "un tercero"}`, sub: fmt(a.fecha), valor: Number(a.monto) })),
      ];
      setOtrasSalidas(salidas);
      setGastos(
        ((rG.error ? [] : rG.data) ?? [])
          .filter((g: any) => !g.borrado)
          .map((g: any) => ({
            fecha: String(g.fecha).slice(0, 10),
            item: g.item ?? "",
            rubro: g.rubro || "Otro",
            valor: Number(g.valor_cop ?? g.valor),
            pago: g.usuario_pago_nombre ?? "",
            compartido: !!g.es_compartido,
            esCredito: !!g.deuda_id,
            nota: g.nota ?? "",
          }))
      );
      const deudas = ((rD.error ? [] : rD.data) ?? []) as any[];
      setPagosCredito(
        [
          ...((rP.error ? [] : rP.data) ?? [])
            .filter((p: any) => p.origen !== "registro_inicial" && !(p.gasto_id && enPapelera.has(p.gasto_id)))
            .map((p: any) => ({
              fecha: String(p.fecha).slice(0, 10),
              credito: deudas.find((d) => d.id === p.deuda_id)?.nombre ?? "Crédito",
              valor: Number(p.valor),
              pagadoPor: p.pagado_por ?? "",
              origen: p.origen ?? "",
            })),
          ...lista(rAD).map((a) => ({ fecha: fmt(a.fecha), credito: deudas.find((d) => d.id === a.deuda_id)?.nombre ?? "Crédito", valor: Number(a.valor), pagadoPor: "", origen: "abono extra" })),
        ].sort((x, y) => x.fecha.localeCompare(y.fecha))
      );
    })().catch(() => {});
    cargarCierre();
    return () => {
      vivo = false;
    };
  }, [mes, cargarCierre]);

  const a = datos?.actual;
  const ant = datos?.anterior;

  // ---------- Observaciones ----------
  const observaciones = useMemo<Obs[]>(() => {
    if (!datos || !a) return [];
    const obs: Obs[] = [];
    const totalGastos = datos.rubros.reduce((s, r) => s + r.valor, 0);
    if (a.balance >= 0) obs.push({ nivel: "ok", texto: `El mes cierra con saldo a favor de ${pesos(a.balance)}.` });
    else obs.push({ nivel: "aviso", texto: `El mes cierra con déficit de ${pesos(-a.balance)}: salió más plata de la que entró.` });
    if (ant && ant.mes !== a.mes) {
      const d = a.balance - ant.balance;
      obs.push({ nivel: "info", texto: `Frente a ${nombreMes(ant.mes)}, el saldo ${d >= 0 ? "mejoró" : "empeoró"} en ${pesos(Math.abs(d))}.` });
    }

    // Rubros nuevos sugeridos a partir de «Otro»
    const otro = datos.rubros.find((r) => r.etiqueta === "Otro")?.valor ?? 0;
    const enOtro = gastos.filter((g) => g.rubro === "Otro" && !g.esCredito);
    if (totalGastos > 0 && otro / totalGastos >= 0.08 && otro >= 100000) {
      obs.push({ nivel: "aviso", texto: `«Otro» reúne ${pesos(otro)} (${Math.round((otro / totalGastos) * 100)}% de los gastos). Mientras más grande sea, menos sirve para entender en qué se va la plata: conviene repartirlo en rubros propios.` });
    }
    const grupos = new Map<string, { n: number; total: number; ejemplo: string }>();
    enOtro.forEach((g) => {
      const palabra = sinTildes(g.item).split(/\s+/).find((w) => w.length >= 4) ?? sinTildes(g.item);
      const x = grupos.get(palabra) ?? { n: 0, total: 0, ejemplo: g.item };
      x.n += 1;
      x.total += g.valor;
      grupos.set(palabra, x);
    });
    const sugeridos = [...grupos.values()].filter((x) => x.n >= 2 || x.total >= Math.max(150000, totalGastos * 0.04)).sort((x, y) => y.total - x.total).slice(0, 4);
    sugeridos.forEach((x) =>
      obs.push({ nivel: "info", texto: `Rubro nuevo sugerido: «${x.ejemplo}» (${x.n} gasto${x.n === 1 ? "" : "s"}, ${pesos(x.total)}) está en «Otro»; si se repite cada mes, vale la pena crearle su propio rubro.` })
    );

    // Cambios fuertes frente al mes anterior
    datos.rubros.forEach((r) => {
      const antes = datos.rubrosAnterior[r.etiqueta] ?? 0;
      if (antes > 0 && r.valor - antes >= 150000 && r.valor / antes >= 1.4) {
        obs.push({ nivel: "aviso", texto: `${r.etiqueta} subió ${Math.round((r.valor / antes - 1) * 100)}% frente al mes anterior (${pesos(antes)} → ${pesos(r.valor)}).` });
      }
    });
    // Rubros que el mes pasado tenían gasto y este mes nada
    Object.entries(datos.rubrosAnterior).forEach(([rubro, antes]) => {
      if (antes >= 100000 && !(datos.rubros.find((r) => r.etiqueta === rubro)?.valor ?? 0) && !esMesActual) {
        obs.push({ nivel: "info", texto: `No hay gastos de «${rubro}» este mes y el mes anterior tuvo ${pesos(antes)}. Revisa si faltó registrar alguno.` });
      }
    });
    // Concentración
    const mayor = [...datos.rubros].sort((x, y) => y.valor - x.valor)[0];
    if (mayor && totalGastos > 0 && mayor.valor / totalGastos >= 0.35 && mayor.etiqueta !== "Otro") {
      obs.push({ nivel: "info", texto: `${mayor.etiqueta} es el rubro más pesado: ${Math.round((mayor.valor / totalGastos) * 100)}% de los gastos (${pesos(mayor.valor)}).` });
    }
    // Pagos de créditos mucho mayores a lo que tocaba pagar
    const tocaCreditos = datos.presupuesto.porTipo.credito ?? 0;
    if (tocaCreditos > 0 && a.cuotas > tocaCreditos * 1.25) {
      obs.push({ nivel: "aviso", texto: `Los pagos de créditos del mes (${pesos(a.cuotas)}) superan lo que tocaba pagar (${pesos(tocaCreditos)}) en ${pesos(a.cuotas - tocaCreditos)}. Abre «Pagos de créditos» en el detalle y revisa si hay un pago repetido o abonos extra.` });
    }
    // Pendientes
    const pend = datos.presupuesto.pendiente;
    if (pend > 1) obs.push({ nivel: "aviso", texto: `Quedan ${pesos(pend)} de pagos del mes sin registrar (cuotas de créditos o gastos automáticos).` });
    const atrasados = datos.presupuestoIngresos.items.filter((i) => !i.sinEstado && i.valor - i.pagado >= 1 && i.fecha < `${moverMes(mes, 1)}-01`);
    if (!esMesActual && atrasados.length) {
      obs.push({ nivel: "aviso", texto: `Ingresos esperados que no se registraron: ${atrasados.map((i) => `${i.nombre} (${pesos(i.valor - i.pagado)})`).join(", ")}.` });
    }
    datos.presupuesto.avisos?.slice(0, 5).forEach((t) => obs.push({ nivel: "info", texto: t }));
    return obs;
  }, [datos, a, ant, gastos, mes, esMesActual]);

  // ---------- Cerrar / reabrir ----------
  async function cerrar() {
    if (!a) return;
    if (clave.trim() !== clave2.trim()) return Alert.alert("No coinciden", "Escribe la misma contraseña en las dos casillas.");
    setOcupado(true);
    try {
      await cerrarMes(mes, clave, Math.round(a.balance), usuario?.user_metadata?.nombre ?? usuario?.email ?? "");
      setPanel(null);
      setClave("");
      setClave2("");
      await cargarCierre();
      Alert.alert("Mes cerrado", `${nombreMes(mes)} quedó cerrado. No se podrá cambiar nada de ese mes hasta que lo abras con la contraseña.`);
    } catch (e: any) {
      Alert.alert("No se pudo cerrar", e.message ?? "Error");
    } finally {
      setOcupado(false);
    }
  }
  async function abrir() {
    setOcupado(true);
    try {
      await reabrirMes(mes, clave);
      setPanel(null);
      setClave("");
      await cargarCierre();
      Alert.alert("Mes abierto", `${nombreMes(mes)} se puede editar otra vez. Recuerda cerrarlo de nuevo cuando termines.`);
    } catch (e: any) {
      Alert.alert("No se pudo abrir", e.message ?? "Error");
    } finally {
      setOcupado(false);
    }
  }

  // ---------- Excel ----------
  function exportar() {
    if (!datos || !a) return;
    const H = (t: string) => ({ v: t, estilo: "encabezado" as const });
    const D = (n: number) => ({ v: Math.round(n), estilo: "dinero" as const });
    const DN = (n: number) => ({ v: Math.round(n), estilo: "dineroNegrita" as const });
    const N = (t: string) => ({ v: t, estilo: "negrita" as const });
    const totalGastos = datos.rubros.reduce((s, r) => s + r.valor, 0);
    const resumen: Hoja = {
      nombre: "Resumen",
      anchos: [38, 20, 14, 20, 16],
      filas: [
        [{ v: `Informe de ${nombreMes(mes)}`, estilo: "titulo" }],
        [cierre ? `Mes CERRADO el ${String(cierre.cerrado_en ?? "").slice(0, 10)}` : "Mes abierto"],
        [],
        [H("INGRESOS"), H("Valor")],
        ["Aportes de las personas", D(a.aportes)],
        ["Arriendos recibidos", D(a.arriendos)],
        ["Carro rentado", D(a.vehiculo)],
        ["Inversiones en conjunto", D(a.inversiones)],
        ["Préstamos a terceros (abonos recibidos)", D(a.prestamosCobrados)],
        ["Aumentos de créditos recibidos", D(a.desembolsos)],
        [N("Total ingresos"), DN(a.ingresos)],
        [],
        [H("SALIDAS"), H("Valor")],
        ["Gastos del mes (sin pagos de crédito)", D(a.gastos)],
        ["Pagos de créditos", D(a.cuotas)],
        ["Otras salidas (inversiones y préstamos)", D(a.otrasSalidas)],
        [N("Total salidas"), DN(a.salidas)],
        [],
        [N("SALDO DEL MES"), DN(a.balance)],
        [],
        [H("GASTOS POR RUBRO"), H("Valor"), H("% del total"), H("Mes anterior"), H("Cambio")],
        ...datos.rubros.map((r) => {
          const antes = datos.rubrosAnterior[r.etiqueta] ?? 0;
          return [r.etiqueta, D(r.valor), { v: totalGastos ? r.valor / totalGastos : 0, estilo: "porcentaje" as const }, D(antes), antes ? { v: r.valor / antes - 1, estilo: "porcentaje" as const } : "nuevo"];
        }),
        [N("Total"), DN(totalGastos)],
      ],
    };
    const ingresos: Hoja = {
      nombre: "Ingresos",
      anchos: [34, 52, 18],
      filas: [
        [H("Origen"), H("Detalle"), H("Valor")],
        ...datos.aportesPersonas.map((p) => ["Aporte de " + p.nombre, p.esBase ? "Aporte base" : "Aporte ajustado", D(p.aporte)]),
        ...detalle.arriendos.map((l) => ["Arriendo · " + l.titulo, l.sub, D(l.valor)]),
        ...detalle.vehiculo.map((l) => ["Carro rentado · " + l.titulo, l.sub, D(l.valor)]),
        ...detalle.inversiones.map((l) => ["Inversión · " + l.titulo, l.sub, D(l.valor)]),
        ...detalle.prestamos.map((l) => ["Préstamos · " + l.titulo, l.sub, D(l.valor)]),
        ...detalle.desembolsos.map((l) => ["Aumento de crédito · " + l.titulo, l.sub, D(l.valor)]),
        [N("Total"), "", DN(a.ingresos)],
      ],
    };
    const hojaGastos: Hoja = {
      nombre: "Gastos",
      anchos: [12, 38, 20, 16, 18, 12, 14, 40],
      filas: [
        [H("Fecha"), H("Gasto"), H("Rubro"), H("Valor"), H("Pagó"), H("Compartido"), H("Pago de crédito"), H("Nota")],
        ...gastos.map((g) => [g.fecha, g.item, g.rubro, D(g.valor), g.pago, g.compartido ? "Sí" : "No", g.esCredito ? "Sí" : "No", g.nota]),
      ],
    };
    const hojaCreditos: Hoja = {
      nombre: "Créditos",
      anchos: [12, 44, 18, 26, 18],
      filas: [[H("Fecha"), H("Crédito"), H("Valor pagado"), H("Pagó"), H("Origen")], ...pagosCredito.map((p) => [p.fecha, p.credito, D(p.valor), p.pagadoPor, p.origen]), [N("Total"), "", DN(pagosCredito.reduce((s, p) => s + p.valor, 0))]],
    };
    const hojaObs: Hoja = { nombre: "Observaciones", anchos: [14, 120], filas: [[H("Tipo"), H("Observación")], ...observaciones.map((o) => [o.nivel === "ok" ? "Bien" : o.nivel === "aviso" ? "Atención" : "Info", o.texto])] };
    const ok = descargarXlsx(`Informe_${mes}.xlsx`, [resumen, ingresos, hojaGastos, hojaCreditos, hojaObs]);
    if (!ok) Alert.alert("Solo en el navegador", "La descarga del Excel funciona desde la versión web de la app.");
  }

  // ---------- Piezas visuales ----------
  const nombreOrigen = (o: string, quien: string) => (o === "persona" ? (quien ? `pagó ${quien}` : "pago de una persona") : o === "arriendo" ? quien || "con arriendo" : o === "prestamo" ? "con un préstamo" : o || quien);

  const lineasGastos = (rubro?: string): Linea[] =>
    gastos.filter((g) => !g.esCredito && (!rubro || g.rubro === rubro)).sort((x, y) => y.valor - x.valor).map((g) => ({ titulo: g.item || "(sin nombre)", sub: `${g.fecha} · ${g.rubro}${g.pago ? ` · ${g.pago}` : ""}`, valor: g.valor }));
  const lineasCreditos: Linea[] = pagosCredito.map((p) => ({ titulo: p.credito, sub: `${p.fecha} · ${nombreOrigen(p.origen, p.pagadoPor)}`, valor: p.valor }));

  function Desplegable({ clave, titulo, valor, lineas, fuerte, nota }: { clave: string; titulo: string; valor: number; lineas: Linea[]; fuerte?: boolean; nota?: string }) {
    const abre = abierta === clave;
    const suma = lineas.reduce((x, l) => x + l.valor, 0);
    const resto = Math.round(valor - suma);
    return (
      <View>
        <TouchableOpacity style={styles.fila} onPress={() => setAbierta(abre ? null : clave)} activeOpacity={0.6} accessibilityLabel={`Ver detalle de ${titulo}`}>
          <Text style={[styles.filaTexto, fuerte && { fontWeight: "800" }]}>{titulo}</Text>
          <Text style={[styles.filaValor, valor === 0 && { color: colors.textMuted }]}>{pesos(valor)}</Text>
          <Ionicons name={abre ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
        </TouchableOpacity>
        {abre && (
          <View style={styles.detalleBox}>
            {nota && <Text style={[typography.caption, { marginBottom: 4 }]}>{nota}</Text>}
            {lineas.length === 0 && Math.abs(resto) <= 1 && <Text style={typography.caption}>No hay movimientos en este mes.</Text>}
            {lineas.map((l, k) => (
              <View key={k} style={styles.detalleFila}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detalleTitulo}>{l.titulo}</Text>
                  <Text style={typography.caption}>{l.sub}</Text>
                </View>
                <Text style={styles.detalleValor}>{pesos(l.valor)}</Text>
              </View>
            ))}
            {Math.abs(resto) > 1 && (
              <View style={styles.detalleFila}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detalleTitulo}>Otros movimientos sin detalle</Text>
                  <Text style={typography.caption}>Entran en el total pero no se pudo identificar su origen</Text>
                </View>
                <Text style={styles.detalleValor}>{pesos(resto)}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }

  /** Pagos de créditos agrupados por crédito: se toca el crédito y salen sus pagos uno a uno. */
  function DesplegableCreditos({ valor }: { valor: number }) {
    const abre = abierta === "s-cre";
    const grupos = new Map<string, { total: number; pagos: Linea[] }>();
    lineasCreditos.forEach((l) => {
      const g = grupos.get(l.titulo) ?? { total: 0, pagos: [] };
      g.total += l.valor;
      g.pagos.push(l);
      grupos.set(l.titulo, g);
    });
    const lista = [...grupos.entries()].sort((x, y) => y[1].total - x[1].total);
    const suma = lineasCreditos.reduce((x, l) => x + l.valor, 0);
    const resto = Math.round(valor - suma);
    return (
      <View>
        <TouchableOpacity style={styles.fila} onPress={() => setAbierta(abre ? null : "s-cre")} activeOpacity={0.6} accessibilityLabel="Ver los créditos pagados">
          <Text style={styles.filaTexto}>Pagos de créditos · {lista.length} crédito{lista.length === 1 ? "" : "s"}</Text>
          <Text style={styles.filaValor}>{pesos(valor)}</Text>
          <Ionicons name={abre ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
        </TouchableOpacity>
        {abre && (
          <View style={styles.detalleBox}>
            <Text style={[typography.caption, { marginBottom: 4 }]}>Toca un crédito para ver cada pago. Un pago repetido (misma fecha y valor) aparece marcado.</Text>
            {lista.length === 0 && <Text style={typography.caption}>No hay pagos de créditos en este mes.</Text>}
            {lista.map(([nombre, g]) => {
              const clave = `s-cre:${nombre}`;
              const dentro = abierta === clave;
              return (
                <View key={nombre} style={styles.grupoCredito}>
                  <TouchableOpacity style={styles.detalleFila} onPress={() => setAbierta(dentro ? "s-cre" : clave)} activeOpacity={0.6}>
                    <Ionicons name="card" size={16} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detalleTitulo}>{nombre}</Text>
                      <Text style={typography.caption}>
                        {g.pagos.length} pago{g.pagos.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                    <Text style={styles.detalleValor}>{pesos(g.total)}</Text>
                    <Ionicons name={dentro ? "chevron-up" : "chevron-down"} size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                  {dentro &&
                    g.pagos.map((l, k) => {
                      const repetido = g.pagos.some((o, j) => j !== k && o.valor === l.valor && o.sub.slice(0, 10) === l.sub.slice(0, 10));
                      return (
                        <View key={k} style={styles.pagoCredito}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.detalleTitulo}>{l.sub.split(" · ")[0]}</Text>
                            <Text style={typography.caption}>{l.sub.split(" · ").slice(1).join(" · ") || "—"}</Text>
                            {repetido && <Text style={[typography.caption, { color: colors.warning, fontWeight: "700" }]}>⚠ Posible pago repetido (misma fecha y valor)</Text>}
                          </View>
                          <Text style={styles.detalleValor}>{pesos(l.valor)}</Text>
                        </View>
                      );
                    })}
                </View>
              );
            })}
            {Math.abs(resto) > 1 && (
              <View style={styles.detalleFila}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detalleTitulo}>Otros movimientos sin detalle</Text>
                </View>
                <Text style={styles.detalleValor}>{pesos(resto)}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }

  function Kpi({ titulo, valor, nota, color }: { titulo: string; valor: string; nota?: string; color?: string }) {
    return (
      <View style={styles.kpi}>
        <Text style={styles.kpiTitulo}>{titulo}</Text>
        <Text style={[styles.kpiValor, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
          {valor}
        </Text>
        {!!nota && <Text style={styles.kpiNota}>{nota}</Text>}
      </View>
    );
  }

  function BarraApilada({ partes }: { partes: { t: string; v: number; c: string }[] }) {
    const total = partes.reduce((x, y) => x + y.v, 0);
    const con = partes.filter((x) => x.v > 0);
    if (total <= 0) return <Text style={typography.caption}>Sin movimientos.</Text>;
    return (
      <View>
        <View style={styles.apilada}>
          {con.map((x, k) => (
            <View key={x.t} style={{ flex: x.v, backgroundColor: x.c, marginRight: k < con.length - 1 ? 2 : 0, borderRadius: 3 }} />
          ))}
        </View>
        {con.map((x) => (
          <View key={x.t} style={styles.leyendaFila}>
            <View style={[styles.swatch, { backgroundColor: x.c }]} />
            <Text style={styles.leyendaTexto}>{x.t}</Text>
            <Text style={styles.leyendaValor}>{pesos(x.v)}</Text>
            <Text style={styles.leyendaPct}>{Math.round((x.v / total) * 100)}%</Text>
          </View>
        ))}
      </View>
    );
  }

  function Avance({ titulo, pagado, total, color, etiqueta }: { titulo: string; pagado: number; total: number; color: string; etiqueta: string }) {
    const p = total > 0 ? Math.min(1, pagado / total) : 0;
    return (
      <View style={{ marginTop: spacing.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={styles.filaTexto}>{titulo}</Text>
          <Text style={styles.filaValor}>{total > 0 ? `${Math.round(p * 100)}%` : "—"}</Text>
        </View>
        <View style={styles.pista}>
          <View style={{ width: `${p * 100}%`, height: 8, backgroundColor: color, borderRadius: 4 }} />
        </View>
        <Text style={typography.caption}>
          {etiqueta} {pesos(pagado)} de {pesos(total)}
        </Text>
      </View>
    );
  }

  const meses6 = datos?.meses ?? [];
  const maxBarra = Math.max(1, ...meses6.map((m) => Math.max(m.ingresos, m.salidas)));
  const ALTO = 120;
  const patrimonio = datos ? datos.totalPropiedades + datos.totalVehiculos + datos.totalAhorrado - datos.totalDeuda : 0;
  const margen = a && a.ingresos > 0 ? Math.round((a.balance / a.ingresos) * 100) : null;
  const pesoDeuda = a && a.ingresos > 0 ? Math.round((a.cuotas / a.ingresos) * 100) : null;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Informe del mes" subtitle="Tablero gerencial: saldo, tendencia, detalle y cierre" />
      <View style={styles.selector}>
        <TouchableOpacity onPress={() => setMes(moverMes(mes, -1))} style={styles.flecha} accessibilityLabel="Mes anterior">
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[typography.h2, { textTransform: "capitalize" }]}>{nombreMes(mes)}</Text>
        <TouchableOpacity onPress={() => setMes(moverMes(mes, 1))} style={[styles.flecha, esMesActual && { opacity: 0.3 }]} disabled={esMesActual} accessibilityLabel="Mes siguiente">
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {cargando && !datos ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
      ) : error || !datos || !a ? (
        <Text style={{ color: colors.danger, padding: spacing.lg }}>Error cargando el informe: {error}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md, width: "100%", maxWidth: 760, alignSelf: "center" }}>
          {/* 1. Titular */}
          <Card style={{ backgroundColor: colors.hero }}>
            <Text style={styles.heroEtiqueta}>Saldo de {MESES[Number(mes.slice(5, 7)) - 1]}{esMesActual ? " (el mes sigue en curso)" : ""}</Text>
            <Text style={[styles.heroValor, a.balance < 0 && { color: "#FFB4A8" }]}>{pesos(a.balance)}</Text>
            <Text style={styles.heroDetalle}>
              Entró {pesos(a.ingresos)} · salió {pesos(a.salidas)}
            </Text>
            <View style={styles.estadoPill}>
              <Ionicons name={cierre ? "lock-closed" : "lock-open-outline"} size={13} color={colors.white} />
              <Text style={styles.estadoTexto}>{cierre ? `Mes cerrado${cierre.cerrado_por ? ` por ${cierre.cerrado_por}` : ""}` : "Mes abierto"}</Text>
            </View>
          </Card>

          {/* 2. Indicadores */}
          <Text style={styles.seccion}>Indicadores clave</Text>
          <View style={styles.kpis}>
            <Kpi titulo="Ingresos" valor={corto(a.ingresos)} nota={ant ? `${a.ingresos >= ant.ingresos ? "▲" : "▼"} ${corto(Math.abs(a.ingresos - ant.ingresos))} vs mes anterior` : undefined} />
            <Kpi titulo="Salidas" valor={corto(a.salidas)} nota={ant ? `${a.salidas <= ant.salidas ? "▼" : "▲"} ${corto(Math.abs(a.salidas - ant.salidas))} vs mes anterior` : undefined} />
            <Kpi titulo="Margen del mes" valor={margen === null ? "—" : `${margen}%`} nota="saldo ÷ ingresos" color={a.balance < 0 ? colors.danger : undefined} />
            <Kpi titulo="Peso de los créditos" valor={pesoDeuda === null ? "—" : `${pesoDeuda}%`} nota="pagos de crédito ÷ ingresos" color={pesoDeuda !== null && pesoDeuda > 60 ? colors.danger : undefined} />
            <Kpi titulo="Deuda total" valor={corto(datos.totalDeuda)} nota="saldo por pagar" />
            <Kpi titulo="Patrimonio neto" valor={corto(patrimonio)} nota="propiedades + vehículos + ahorros − deuda" color={patrimonio < 0 ? colors.danger : undefined} />
          </View>

          {/* 3. Tendencia */}
          <Card>
            <Text style={typography.h3}>Últimos 6 meses</Text>
            <View style={styles.leyendaFila}>
              <View style={[styles.swatch, { backgroundColor: SERIE.ingresos }]} />
              <Text style={styles.leyendaTexto}>Ingresos</Text>
              <View style={[styles.swatch, { backgroundColor: SERIE.salidas, marginLeft: 12 }]} />
              <Text style={styles.leyendaTexto}>Salidas</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: spacing.sm }}>
              {meses6.map((m) => {
                const sel = m.mes === mes;
                return (
                  <View key={m.mes} style={{ flex: 1, alignItems: "center" }}>
                    <View style={{ height: ALTO + 14, flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
                      {[
                        { v: m.ingresos, c: SERIE.ingresos },
                        { v: m.salidas, c: SERIE.salidas },
                      ].map((b, k) => (
                        <View key={k} style={{ alignItems: "center", justifyContent: "flex-end" }}>
                          {sel && <Text style={styles.barraValor}>{corto(b.v)}</Text>}
                          <View style={{ width: 16, height: Math.max(2, (b.v / maxBarra) * ALTO), backgroundColor: b.c, borderTopLeftRadius: 4, borderTopRightRadius: 4, opacity: sel ? 1 : 0.85 }} />
                        </View>
                      ))}
                    </View>
                    <View style={styles.eje} />
                    <Text style={[styles.mesEtiqueta, sel && { fontWeight: "800", color: colors.textPrimary }]}>{mesCorto(m.mes)}</Text>
                    <Text style={[styles.saldoEtiqueta, { color: m.balance < 0 ? colors.danger : colors.success }]}>
                      {m.balance < 0 ? "−" : "+"}
                      {corto(Math.abs(m.balance)).replace("-", "")}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.ayuda}>Debajo de cada mes: saldo (+ sobró, − faltó).</Text>
          </Card>

          {/* 4. Composición */}
          <Card>
            <Text style={typography.h3}>De dónde entró</Text>
            <BarraApilada
              partes={[
                { t: "Aportes", v: a.aportes, c: SERIE.ingresos },
                { t: "Arriendos", v: a.arriendos, c: SERIE.c3 },
                { t: "Carro rentado", v: a.vehiculo, c: SERIE.c4 },
                { t: "Inversiones", v: a.inversiones, c: SERIE.c5 },
                { t: "Préstamos cobrados", v: a.prestamosCobrados, c: SERIE.c6 },
                { t: "Aumentos de créditos", v: a.desembolsos, c: SERIE.c7 },
              ]}
            />
          </Card>
          <Card>
            <Text style={typography.h3}>A dónde se fue</Text>
            <BarraApilada
              partes={[
                { t: "Pagos de créditos", v: a.cuotas, c: SERIE.salidas },
                { t: "Gastos del mes", v: a.gastos, c: SERIE.c6 },
                { t: "Otras salidas", v: a.otrasSalidas, c: SERIE.c4 },
              ]}
            />
          </Card>

          {/* 5. Cumplimiento */}
          <Card>
            <Text style={typography.h3}>Cumplimiento del presupuesto</Text>
            <Avance titulo="Pagos del mes (créditos y fijos)" pagado={datos.presupuesto.pagado} total={datos.presupuesto.total} color={SERIE.salidas} etiqueta="Pagado" />
            <Avance titulo="Ingresos esperados" pagado={datos.presupuestoIngresos.pagado} total={datos.presupuestoIngresos.total} color={SERIE.ingresos} etiqueta="Recibido" />
            {datos.metas.length > 0 && <Text style={[styles.filaTexto, { marginTop: spacing.md }]}>Ahorros: {pesos(datos.totalAhorrado)} en {datos.metas.length} meta(s)</Text>}
          </Card>

          {/* 6. Detalle con clic */}
          <Text style={styles.seccion}>Detalle (toca cada línea)</Text>
          <Card>
            <Text style={typography.h3}>Lo que entró</Text>
            <Desplegable clave="i-aportes" titulo="Aportes de las personas" valor={a.aportes} lineas={datos.aportesPersonas.map((p) => ({ titulo: p.nombre, sub: p.esBase ? "Aporte base" : "Aporte ajustado este mes", valor: p.aporte }))} />
            <Desplegable clave="i-arr" titulo="Arriendos recibidos" valor={a.arriendos} lineas={detalle.arriendos} />
            <Desplegable clave="i-veh" titulo="Carro rentado" valor={a.vehiculo} lineas={detalle.vehiculo} />
            <Desplegable clave="i-inv" titulo="Inversiones en conjunto" valor={a.inversiones} lineas={detalle.inversiones} />
            <Desplegable clave="i-pre" titulo="Préstamos a terceros (abonos)" valor={a.prestamosCobrados} lineas={detalle.prestamos} />
            {a.desembolsos > 0 && <Desplegable clave="i-des" titulo="Aumentos de créditos" valor={a.desembolsos} lineas={detalle.desembolsos} />}
            <Desplegable clave="i-tot" titulo="Total ingresos" valor={a.ingresos} lineas={[]} fuerte nota="Es la suma de las líneas de arriba." />
          </Card>

          <Card>
            <Text style={typography.h3}>Lo que salió</Text>
            <Desplegable clave="s-gas" titulo="Gastos del mes" valor={a.gastos} lineas={lineasGastos()} nota="Sin los pagos de crédito, que van aparte. De mayor a menor." />
            <DesplegableCreditos valor={a.cuotas} />
            <Desplegable clave="s-otr" titulo="Otras salidas (inversiones, préstamos)" valor={a.otrasSalidas} lineas={otrasSalidas} />
            <Desplegable clave="s-tot" titulo="Total salidas" valor={a.salidas} lineas={[]} fuerte nota="Gastos + pagos de créditos + otras salidas." />
            <View style={[styles.fila, { borderTopColor: colors.textMuted }]}>
              <Text style={[styles.filaTexto, { fontWeight: "800" }]}>Saldo del mes</Text>
              <Text style={[styles.filaValor, { fontSize: 16 }, a.balance < 0 && { color: colors.danger }]}>{pesos(a.balance)}</Text>
            </View>
          </Card>

          <Card>
            <Text style={typography.h3}>Gastos por rubro</Text>
            {datos.rubros.length === 0 && <Text style={typography.caption}>No hay gastos registrados en este mes.</Text>}
            {datos.rubros.map((r) => {
              const antes = datos.rubrosAnterior[r.etiqueta] ?? 0;
              return <Desplegable key={r.etiqueta} clave={`r-${r.etiqueta}`} titulo={`${r.etiqueta}${antes > 0 ? ` · mes anterior ${corto(antes)}` : ""}`} valor={r.valor} lineas={lineasGastos(r.etiqueta)} />;
            })}
          </Card>

          {/* 7. Observaciones */}
          <Text style={styles.seccion}>Observaciones</Text>
          <Card>
            {observaciones.map((o, k) => (
              <View key={k} style={[styles.obsFila, k === 0 && { borderTopWidth: 0 }]}>
                <Ionicons name={o.nivel === "ok" ? "checkmark-circle" : o.nivel === "aviso" ? "alert-circle" : "information-circle"} size={18} color={o.nivel === "ok" ? colors.success : o.nivel === "aviso" ? colors.warning : colors.primary} />
                <Text style={styles.obsTexto}>{o.texto}</Text>
              </View>
            ))}
          </Card>

          {/* 8. Guardar y cerrar */}
          <Card>
            <Text style={typography.h3}>Guardar y cerrar</Text>
            <PrimaryButton title="Descargar informe en Excel" onPress={exportar} />
            <Text style={styles.ayuda}>El Excel trae 5 hojas: Resumen, Ingresos, Gastos, Créditos y Observaciones.</Text>

            {!cierre && panel !== "cerrar" && (
              <TouchableOpacity style={styles.botonBorde} onPress={() => setPanel("cerrar")}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
                <Text style={styles.botonBordeTexto}>Cerrar este mes con contraseña</Text>
              </TouchableOpacity>
            )}
            {!cierre && panel === "cerrar" && (
              <View style={styles.panel}>
                <Text style={styles.ayuda}>Con el mes cerrado nadie podrá agregar, editar ni borrar nada de {nombreMes(mes)} sin la contraseña. Anótala: no se puede recuperar.</Text>
                <TextInput style={styles.input} value={clave} onChangeText={setClave} placeholder="Contraseña del cierre" placeholderTextColor={colors.textMuted} secureTextEntry />
                <TextInput style={styles.input} value={clave2} onChangeText={setClave2} placeholder="Repite la contraseña" placeholderTextColor={colors.textMuted} secureTextEntry />
                <PrimaryButton title="Cerrar mes" onPress={cerrar} loading={ocupado} />
                <TouchableOpacity onPress={() => setPanel(null)} style={{ marginTop: spacing.sm }}>
                  <Text style={{ textAlign: "center", color: colors.textSecondary }}>Salir sin cerrar</Text>
                </TouchableOpacity>
              </View>
            )}

            {cierre && panel !== "abrir" && (
              <TouchableOpacity style={styles.botonBorde} onPress={() => setPanel("abrir")}>
                <Ionicons name="lock-open-outline" size={16} color={colors.primary} />
                <Text style={styles.botonBordeTexto}>Abrir el mes (pide la contraseña)</Text>
              </TouchableOpacity>
            )}
            {cierre && panel === "abrir" && (
              <View style={styles.panel}>
                <TextInput style={styles.input} value={clave} onChangeText={setClave} placeholder="Contraseña del cierre" placeholderTextColor={colors.textMuted} secureTextEntry />
                <PrimaryButton title="Abrir mes" onPress={abrir} loading={ocupado} />
                <TouchableOpacity onPress={() => setPanel(null)} style={{ marginTop: spacing.sm }}>
                  <Text style={{ textAlign: "center", color: colors.textSecondary }}>Salir sin abrir</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.ayuda}>El cierre protege contra cambios accidentales dentro de la app para todas las personas del hogar.</Text>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  selector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, width: "100%", maxWidth: 760, alignSelf: "center" },
  flecha: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  heroEtiqueta: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  heroValor: { color: colors.white, fontSize: 30, fontWeight: "800", marginTop: 2 },
  heroDetalle: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 4 },
  estadoPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 10, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  estadoTexto: { color: colors.white, fontSize: 12, fontWeight: "600" },
  fila: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border },
  filaTexto: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  filaValor: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  seccion: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.6, marginTop: spacing.sm },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  kpi: { flexGrow: 1, flexBasis: "30%", minWidth: 150, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  kpiTitulo: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  kpiValor: { fontSize: 22, fontWeight: "800", color: colors.textPrimary, marginTop: 2 },
  kpiNota: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  apilada: { flexDirection: "row", height: 18, marginVertical: spacing.sm },
  leyendaFila: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  leyendaTexto: { flex: 1, fontSize: 13, color: colors.textPrimary },
  leyendaValor: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  leyendaPct: { width: 40, textAlign: "right", fontSize: 12, color: colors.textSecondary },
  pista: { height: 8, borderRadius: 4, backgroundColor: colors.border, marginVertical: 4, overflow: "hidden" },
  barraValor: { fontSize: 9, fontWeight: "700", color: colors.textPrimary, marginBottom: 2 },
  eje: { height: 1, alignSelf: "stretch", backgroundColor: colors.border },
  mesEtiqueta: { fontSize: 12, color: colors.textSecondary, marginTop: 4, textTransform: "capitalize" },
  saldoEtiqueta: { fontSize: 10, fontWeight: "700", marginTop: 1 },
  detalleBox: { backgroundColor: colors.infoBg, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8 },
  detalleFila: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  grupoCredito: { borderTopWidth: 1, borderTopColor: colors.border },
  pagoCredito: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, paddingLeft: 26, paddingRight: 4, backgroundColor: colors.surface, borderRadius: 6, marginBottom: 4 },
  detalleTitulo: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  detalleValor: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  obsFila: { flexDirection: "row", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  obsTexto: { flex: 1, fontSize: 13, color: colors.textPrimary, lineHeight: 18 },
  ayuda: { fontSize: 11, color: colors.textMuted, marginTop: 6, marginBottom: 4 },
  botonBorde: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, marginTop: spacing.md },
  botonBordeTexto: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  panel: { marginTop: spacing.md, backgroundColor: colors.infoBg, borderRadius: radius.sm, padding: spacing.md },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
});
