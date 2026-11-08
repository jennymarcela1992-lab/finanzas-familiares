import React, { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePersonales, MovimientoPersonal } from "../../hooks/usePersonales";
import { mesHoy, moverMes } from "../../hooks/useDashboard";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import FechaInput from "../../components/FechaInput";
import { colors, spacing, typography, radius, esOscuro } from "../../theme/theme";
import { aNumero } from "../../utils/numeros";
import { pesos, hoyISO } from "../../utils/amortizacion";
import { descargarXlsx } from "../../utils/xlsx";
import PatrimonioPersonal from "./PatrimonioPersonal";
import ReporteJuanes from "./ReporteJuanes";
import CruceCuentas from "./CruceCuentas";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

const CATEGORIAS = {
  ingreso: ["Salario", "Honorarios", "Clases", "Rendimientos", "Venta", "Otro ingreso"],
  gasto: ["Juanes", "Personal", "Salud", "Transporte", "Ropa", "Salidas", "Educación", "Suscripciones", "Ahorro personal", "Regalos", "Otro gasto"],
};
const ING = esOscuro ? "#3987e5" : "#2a78d6";
const GAS = esOscuro ? "#d95926" : "#eb6834";

export default function MisFinanzasScreen() {
  const [vista, setVista] = useState<"mov" | "pat" | "juan" | "mami">("mov");
  const [mes, setMes] = useState(mesHoy());
  const { movimientos, cargando, error, faltaSql, guardar, borrar } = usePersonales(mes);
  const esMesActual = mes === mesHoy();

  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"ingreso" | "gasto">("gasto");
  const [concepto, setConcepto] = useState("");
  const [valor, setValor] = useState("");
  const [categoria, setCategoria] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const ingresos = movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.valor, 0);
  const gastos = movimientos.filter((m) => m.tipo === "gasto").reduce((s, m) => s + m.valor, 0);
  const saldo = ingresos - gastos;

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    movimientos.filter((m) => m.tipo === "gasto").forEach((m) => mapa.set(m.categoria || "Sin categoría", (mapa.get(m.categoria || "Sin categoría") ?? 0) + m.valor));
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [movimientos]);

  function abrirNuevo(t: "ingreso" | "gasto") {
    setEditando(null);
    setTipo(t);
    setConcepto("");
    setValor("");
    setCategoria("");
    setNota("");
    setFecha(esMesActual ? hoyISO() : `${mes}-01`);
    setAbierto(true);
  }
  function abrirEdicion(m: MovimientoPersonal) {
    setEditando(m.id);
    setTipo(m.tipo);
    setConcepto(m.concepto);
    setValor(Math.round(m.valor).toLocaleString("es-CO"));
    setCategoria(m.categoria ?? "");
    setNota(m.nota ?? "");
    setFecha(m.fecha);
    setAbierto(true);
  }

  async function onGuardar() {
    const v = aNumero(valor);
    if (!concepto.trim()) return Alert.alert("Falta el concepto", "Escribe de qué es.");
    if (!(v > 0)) return Alert.alert("Falta el valor", "Escribe un valor mayor que cero.");
    setGuardando(true);
    try {
      await guardar({ tipo, fecha, concepto, categoria, valor: v, nota }, editando);
      setAbierto(false);
      setEditando(null);
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message ?? "Error");
    } finally {
      setGuardando(false);
    }
  }

  function confirmarBorrar(m: MovimientoPersonal) {
    Alert.alert("Borrar", `¿Borrar «${m.concepto}» por ${pesos(m.valor)}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: () => borrar(m.id).catch((e) => Alert.alert("Error", e.message)) },
    ]);
  }

  function exportar() {
    const ok = descargarXlsx(`Mis_finanzas_${mes}.xlsx`, [
      {
        nombre: "Mis finanzas",
        anchos: [12, 12, 36, 18, 18, 40],
        filas: [
          [{ v: `Mis finanzas de ${nombreMes(mes)}`, estilo: "titulo" }],
          [],
          [{ v: "Fecha", estilo: "encabezado" }, { v: "Tipo", estilo: "encabezado" }, { v: "Concepto", estilo: "encabezado" }, { v: "Categoría", estilo: "encabezado" }, { v: "Valor", estilo: "encabezado" }, { v: "Nota", estilo: "encabezado" }],
          ...[...movimientos].reverse().map((m) => [m.fecha, m.tipo === "ingreso" ? "Ingreso" : "Gasto", m.concepto, m.categoria ?? "", { v: m.valor, estilo: "dinero" as const }, m.nota ?? ""]),
          [],
          [{ v: "Ingresos", estilo: "negrita" }, "", "", "", { v: ingresos, estilo: "dineroNegrita" }],
          [{ v: "Gastos", estilo: "negrita" }, "", "", "", { v: gastos, estilo: "dineroNegrita" }],
          [{ v: "Saldo", estilo: "negrita" }, "", "", "", { v: saldo, estilo: "dineroNegrita" }],
        ],
      },
    ]);
    if (!ok) Alert.alert("Solo en el navegador", "La descarga del Excel funciona desde la versión web de la app.");
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Mis finanzas" subtitle="Privado: solo tú ves esto" />
      <View style={styles.pestanas}>
        {([["mov", "Ingresos y gastos"], ["pat", "Patrimonio y deudas"], ["juan", "Reporte Juanes"], ["mami", "Cuentas con mami"]] as const).map(([k, t]) => (
          <TouchableOpacity key={k} style={[styles.pestana, vista === k && styles.pestanaActiva]} onPress={() => setVista(k)}>
            <Text style={[styles.pestanaTexto, vista === k && { color: colors.white }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {vista === "pat" || vista === "juan" || vista === "mami" ? (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, width: "100%", maxWidth: 760, alignSelf: "center" }} keyboardShouldPersistTaps="handled">
          {vista === "pat" ? <PatrimonioPersonal /> : vista === "juan" ? <ReporteJuanes /> : <CruceCuentas />}
        </ScrollView>
      ) : (
      <>
      <View style={styles.selector}>
        <TouchableOpacity onPress={() => setMes(moverMes(mes, -1))} style={styles.flecha} accessibilityLabel="Mes anterior">
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[typography.h2, { textTransform: "capitalize" }]}>{nombreMes(mes)}</Text>
        <TouchableOpacity onPress={() => setMes(moverMes(mes, 1))} style={[styles.flecha, esMesActual && { opacity: 0.3 }]} disabled={esMesActual} accessibilityLabel="Mes siguiente">
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {faltaSql ? (
        <Card style={{ margin: spacing.lg }}>
          <Text style={typography.h3}>Falta un paso en Supabase</Text>
          <Text style={typography.body}>Corre el archivo supabase_finanzas_personales.sql en Supabase (SQL Editor) y vuelve a abrir esta pantalla.</Text>
        </Card>
      ) : cargando && !movimientos.length ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
      ) : error ? (
        <Text style={{ color: colors.danger, padding: spacing.lg }}>Error: {error}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md, width: "100%", maxWidth: 760, alignSelf: "center" }} keyboardShouldPersistTaps="handled">
          <Card style={{ backgroundColor: colors.hero }}>
            <Text style={styles.heroEtiqueta}>Mi saldo de {MESES[Number(mes.slice(5, 7)) - 1]}</Text>
            <Text style={[styles.heroValor, saldo < 0 && { color: "#FFB4A8" }]}>{pesos(saldo)}</Text>
            <Text style={styles.heroDetalle}>
              Entró {pesos(ingresos)} · salió {pesos(gastos)}
            </Text>
            <View style={styles.privado}>
              <Ionicons name="lock-closed" size={12} color={colors.white} />
              <Text style={styles.privadoTexto}>No aparece en el Resumen ni en los informes del hogar</Text>
            </View>
          </Card>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TouchableOpacity style={[styles.botonAccion, { borderColor: ING }]} onPress={() => abrirNuevo("ingreso")}>
              <Ionicons name="add-circle" size={18} color={ING} />
              <Text style={[styles.botonAccionTexto, { color: colors.textPrimary }]}>Agregar ingreso</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.botonAccion, { borderColor: GAS }]} onPress={() => abrirNuevo("gasto")}>
              <Ionicons name="remove-circle" size={18} color={GAS} />
              <Text style={[styles.botonAccionTexto, { color: colors.textPrimary }]}>Agregar gasto</Text>
            </TouchableOpacity>
          </View>

          {abierto && (
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={typography.h3}>{editando ? "Editar" : "Nuevo"} {tipo === "ingreso" ? "ingreso" : "gasto"}</Text>
                <TouchableOpacity onPress={() => setAbierto(false)} accessibilityLabel="Cerrar sin guardar" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={28} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.chipsRow}>
                {(["ingreso", "gasto"] as const).map((t) => (
                  <TouchableOpacity key={t} style={[styles.chip, tipo === t && styles.chipActivo]} onPress={() => { setTipo(t); setCategoria(""); }}>
                    <Text style={[styles.chipText, tipo === t && styles.chipTextActivo]}>{t === "ingreso" ? "Ingreso" : "Gasto"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={styles.input} placeholder={tipo === "ingreso" ? "¿De qué es el ingreso?" : "¿Qué fue el gasto?"} placeholderTextColor={colors.textMuted} value={concepto} onChangeText={setConcepto} />
              <TextInput style={styles.input} placeholder="Valor (ej. 45000)" placeholderTextColor={colors.textMuted} value={valor} onChangeText={setValor} keyboardType="numeric" />
              <Text style={styles.label}>Categoría</Text>
              <View style={styles.chipsRow}>
                {CATEGORIAS[tipo].map((c) => (
                  <TouchableOpacity key={c} style={[styles.chip, categoria === c && styles.chipActivo]} onPress={() => setCategoria(categoria === c ? "" : c)}>
                    <Text style={[styles.chipText, categoria === c && styles.chipTextActivo]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Fecha</Text>
              <FechaInput value={fecha} onChange={setFecha} />
              <TextInput style={[styles.input, { marginTop: spacing.sm }]} placeholder="Nota (opcional)" placeholderTextColor={colors.textMuted} value={nota} onChangeText={setNota} />
              <PrimaryButton title={editando ? "Guardar cambios" : "Guardar"} onPress={onGuardar} loading={guardando} />
              <TouchableOpacity onPress={() => setAbierto(false)} style={{ marginTop: spacing.sm, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }}>
                <Text style={{ textAlign: "center", color: colors.textPrimary, fontWeight: "600" }}>Salir sin guardar</Text>
              </TouchableOpacity>
            </Card>
          )}

          {porCategoria.length > 0 && (
            <Card>
              <Text style={typography.h3}>Mis gastos por categoría</Text>
              {porCategoria.map(([cat, v]) => (
                <View key={cat} style={{ marginTop: spacing.sm }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={styles.filaTexto}>{cat} <Text style={{ color: colors.textMuted }}>{gastos ? Math.round((v / gastos) * 100) : 0}%</Text></Text>
                    <Text style={styles.filaValor}>{pesos(v)}</Text>
                  </View>
                  <View style={styles.pista}>
                    <View style={{ width: `${gastos ? (v / gastos) * 100 : 0}%`, height: 8, backgroundColor: GAS, borderRadius: 4 }} />
                  </View>
                </View>
              ))}
            </Card>
          )}

          <Card>
            <Text style={typography.h3}>Movimientos de {MESES[Number(mes.slice(5, 7)) - 1]}</Text>
            {movimientos.length === 0 && <Text style={[typography.caption, { marginTop: 6 }]}>Todavía no hay movimientos este mes. Usa los botones de arriba para agregar el primero.</Text>}
            {movimientos.map((m) => (
              <View key={m.id} style={styles.mov}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => abrirEdicion(m)} activeOpacity={0.6} accessibilityLabel={`Editar ${m.concepto}`}>
                  <Text style={styles.movTitulo}>{m.concepto}</Text>
                  <Text style={typography.caption}>
                    {m.fecha} · {m.tipo === "ingreso" ? "Ingreso" : "Gasto"}
                    {m.categoria ? ` · ${m.categoria}` : ""}
                    {m.nota ? ` · ${m.nota}` : ""}
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.movValor, { color: m.tipo === "ingreso" ? colors.success : colors.textPrimary }]}>
                  {m.tipo === "ingreso" ? "+" : "−"}
                  {pesos(m.valor)}
                </Text>
                <TouchableOpacity onPress={() => confirmarBorrar(m)} accessibilityLabel={`Borrar ${m.concepto}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </Card>

          {movimientos.length > 0 && (
            <TouchableOpacity style={styles.botonBorde} onPress={exportar}>
              <Ionicons name="download-outline" size={16} color={colors.primary} />
              <Text style={styles.botonBordeTexto}>Descargar mis movimientos en Excel</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
      </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pestanas: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, width: "100%", maxWidth: 760, alignSelf: "center" },
  pestana: { flexGrow: 1, minWidth: 130, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary },
  pestanaActiva: { backgroundColor: colors.primary },
  pestanaTexto: { color: colors.primary, fontWeight: "700", fontSize: 13, textAlign: "center" },
  container: { flex: 1, backgroundColor: colors.background },
  selector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, width: "100%", maxWidth: 760, alignSelf: "center" },
  flecha: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  heroEtiqueta: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  heroValor: { color: colors.white, fontSize: 30, fontWeight: "800", marginTop: 2 },
  heroDetalle: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 4 },
  privado: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 10, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  privadoTexto: { color: colors.white, fontSize: 11, fontWeight: "600" },
  botonAccion: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: radius.md, paddingVertical: 12, backgroundColor: colors.surface },
  botonAccionTexto: { fontWeight: "700", fontSize: 13 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipActivo: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontSize: 13 },
  chipTextActivo: { color: colors.white, fontWeight: "700" },
  label: { fontSize: 12, color: colors.textSecondary, fontWeight: "600", marginTop: 4 },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  filaTexto: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  filaValor: { fontSize: 13, fontWeight: "800", color: colors.textPrimary },
  pista: { height: 8, borderRadius: 4, backgroundColor: colors.border, marginTop: 4, overflow: "hidden" },
  mov: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  movTitulo: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  movValor: { fontSize: 14, fontWeight: "800" },
  botonBorde: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 12 },
  botonBordeTexto: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
