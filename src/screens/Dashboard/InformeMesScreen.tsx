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
import { colors, spacing, typography, radius } from "../../theme/theme";
import { pesos } from "../../utils/amortizacion";
import { descargarXlsx, Hoja } from "../../utils/xlsx";
import { mesCerrado, cerrarMes, reabrirMes, MesCerrado } from "../../utils/cierreMes";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

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
      const [rG, rP, rD] = await Promise.all([
        supabase.from("gastos").select("*").gte("fecha", desde).lt("fecha", hasta).order("fecha"),
        supabase.from("pagos_deuda").select("*").gte("fecha", desde).lt("fecha", hasta).order("fecha"),
        supabase.from("deudas").select("id, nombre"),
      ]);
      if (!vivo) return;
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
        ((rP.error ? [] : rP.data) ?? [])
          .filter((p: any) => p.origen !== "registro_inicial")
          .map((p: any) => ({
            fecha: String(p.fecha).slice(0, 10),
            credito: deudas.find((d) => d.id === p.deuda_id)?.nombre ?? "Crédito",
            valor: Number(p.valor),
            pagadoPor: p.pagado_por ?? "",
            origen: p.origen ?? "",
          }))
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

  const fila = (t: string, v: number, opciones: { fuerte?: boolean; negativo?: boolean } = {}) => (
    <View style={styles.fila} key={t}>
      <Text style={[styles.filaTexto, opciones.fuerte && { fontWeight: "800" }]}>{t}</Text>
      <Text style={[styles.filaValor, opciones.fuerte && { fontSize: 15 }, v === 0 && { color: colors.textMuted }, opciones.negativo && v < 0 && { color: colors.danger }]}>{pesos(v)}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Informe del mes" subtitle="Cómo quedó el saldo, observaciones y cierre" />
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

          <Card>
            <Text style={typography.h3}>Lo que entró</Text>
            {fila("Aportes de las personas", a.aportes)}
            {fila("Arriendos recibidos", a.arriendos)}
            {fila("Carro rentado", a.vehiculo)}
            {fila("Inversiones en conjunto", a.inversiones)}
            {fila("Préstamos a terceros (abonos)", a.prestamosCobrados)}
            {a.desembolsos > 0 && fila("Aumentos de créditos", a.desembolsos)}
            {fila("Total ingresos", a.ingresos, { fuerte: true })}
          </Card>

          <Card>
            <Text style={typography.h3}>Lo que salió</Text>
            {fila("Gastos del mes", a.gastos)}
            {fila("Pagos de créditos", a.cuotas)}
            {fila("Otras salidas (inversiones, préstamos)", a.otrasSalidas)}
            {fila("Total salidas", a.salidas, { fuerte: true })}
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
              return (
                <View style={styles.fila} key={r.etiqueta}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.filaTexto}>{r.etiqueta}</Text>
                    {antes > 0 && <Text style={typography.caption}>Mes anterior {pesos(antes)}</Text>}
                  </View>
                  <Text style={styles.filaValor}>{pesos(r.valor)}</Text>
                </View>
              );
            })}
          </Card>

          <Card>
            <Text style={typography.h3}>Observaciones</Text>
            {observaciones.map((o, k) => (
              <View key={k} style={styles.obsFila}>
                <Ionicons name={o.nivel === "ok" ? "checkmark-circle" : o.nivel === "aviso" ? "alert-circle" : "information-circle"} size={18} color={o.nivel === "ok" ? colors.success : o.nivel === "aviso" ? colors.warning : colors.primary} />
                <Text style={styles.obsTexto}>{o.texto}</Text>
              </View>
            ))}
          </Card>

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
  obsFila: { flexDirection: "row", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  obsTexto: { flex: 1, fontSize: 13, color: colors.textPrimary, lineHeight: 18 },
  ayuda: { fontSize: 11, color: colors.textMuted, marginTop: 6, marginBottom: 4 },
  botonBorde: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, marginTop: spacing.md },
  botonBordeTexto: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  panel: { marginTop: spacing.md, backgroundColor: colors.infoBg, borderRadius: radius.sm, padding: spacing.md },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
});
