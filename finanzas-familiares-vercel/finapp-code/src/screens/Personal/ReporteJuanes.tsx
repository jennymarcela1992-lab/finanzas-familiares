import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useReporteJuanes } from "../../hooks/useReporteJuanes";
import { mesHoy, moverMes } from "../../hooks/useDashboard";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";
import { aNumero } from "../../utils/numeros";
import { pesos } from "../../utils/amortizacion";
import { descargarXlsx } from "../../utils/xlsx";
import { descargarPdf, Bloque } from "../../utils/pdf";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const fmt = (n: number) => (n ? Math.round(n).toLocaleString("es-CO") : "");

export default function ReporteJuanes() {
  const [mes, setMes] = useState(mesHoy());
  const esMesActual = mes === mesHoy();
  const r = useReporteJuanes(mes);

  const [cuota, setCuota] = useState("");
  const [pago, setPago] = useState("");
  const [saldoAnt, setSaldoAnt] = useState("");
  const [porc, setPorc] = useState("50");
  const [guardando, setGuardando] = useState(false);

  const [agregando, setAgregando] = useState(false);
  const [nConcepto, setNConcepto] = useState("");
  const [nValor, setNValor] = useState("");
  const [nNota, setNNota] = useState("");

  useEffect(() => {
    setCuota(fmt(r.config.cuota));
    setPago(fmt(r.config.pago));
    setSaldoAnt(r.config.saldoAnterior ? String(r.config.saldoAnterior) : "");
    setPorc(String(r.config.porcentaje));
  }, [r.config]);

  // valores que se ven en pantalla según lo escrito (aunque no se haya guardado todavía)
  const vivo = useMemo(() => {
    const p = aNumero(porc) || 0;
    const c = aNumero(cuota) || 0;
    const pg = aNumero(pago) || 0;
    const sa = Number(saldoAnt.replace(/[^0-9.\-]/g, "")) || 0;
    const parte = (r.totalGastos * p) / 100;
    const total = parte + c;
    return { p, c, pg, sa, parte, total, saldo: sa + total - pg };
  }, [porc, cuota, pago, saldoAnt, r.totalGastos]);

  const grupos = useMemo(() => {
    const m = new Map<string, typeof r.lineas>();
    r.lineas.forEach((l) => m.set(l.concepto, [...(m.get(l.concepto) ?? []), l]));
    return [...m.entries()];
  }, [r.lineas]);

  async function guardar() {
    setGuardando(true);
    try {
      await r.guardarConfig({ cuota: vivo.c, pago: vivo.pg, saldoAnterior: vivo.sa, porcentaje: vivo.p });
      Alert.alert("Guardado", "Los valores de " + nombreMes(mes) + " quedaron guardados.");
    } catch (e: any) {
      Alert.alert("No se pudo guardar", e.message ?? "Error");
    } finally {
      setGuardando(false);
    }
  }

  async function agregar() {
    const v = aNumero(nValor);
    if (!nConcepto.trim()) return Alert.alert("Falta el concepto", "Ej.: Pensión del colegio, Cita médica, Uniforme.");
    if (!(v > 0)) return Alert.alert("Falta el valor", "Escribe el valor TOTAL del gasto (la app calcula la parte de Juan Carlos).");
    try {
      await r.agregarLinea(nConcepto, v, nNota);
      setNConcepto("");
      setNValor("");
      setNNota("");
      setAgregando(false);
    } catch (e: any) {
      Alert.alert("No se pudo agregar", e.message ?? "Error");
    }
  }

  function confirmarBorrar(id: string, concepto: string) {
    Alert.alert("Quitar", `¿Quitar «${concepto}» del reporte?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: () => r.borrarLinea(id).catch((e) => Alert.alert("Error", e.message)) },
    ]);
  }

  // totales por concepto (solo líneas incluidas)
  function resumenPorConcepto() {
    const m = new Map<string, number>();
    r.incluidas.forEach((l) => m.set(l.concepto, (m.get(l.concepto) ?? 0) + l.valor));
    return [...m.entries()];
  }

  function excel() {
    const filasConcepto = resumenPorConcepto().map(([c, v]) => [c, { v, estilo: "dinero" as const }, { v: (v * vivo.p) / 100, estilo: "dinero" as const }]);
    const ok = descargarXlsx(`Gastos_Juan_Carlos_Bernal_${mes}.xlsx`, [
      {
        nombre: "Reporte",
        anchos: [34, 18, 22],
        filas: [
          [{ v: `Gastos de Juanes - ${nombreMes(mes)}`, estilo: "titulo" }],
          [`Parte a cargo de Juan Carlos Bernal: ${vivo.p}% de los gastos`],
          [],
          [{ v: "Concepto", estilo: "encabezado" }, { v: "Valor total", estilo: "encabezado" }, { v: `A cargo de Juan Carlos (${vivo.p}%)`, estilo: "encabezado" }],
          ["Cuota alimentaria", "", { v: vivo.c, estilo: "dinero" }],
          ...filasConcepto,
          [],
          [{ v: "TOTAL DEL MES", estilo: "negrita" }, { v: r.totalGastos, estilo: "dineroNegrita" }, { v: vivo.total, estilo: "dineroNegrita" }],
          [{ v: "Saldo anterior", estilo: "negrita" }, "", { v: vivo.sa, estilo: "dineroNegrita" }],
          [{ v: "PAGO", estilo: "negrita" }, "", { v: vivo.pg, estilo: "dineroNegrita" }],
          [{ v: "SALDO", estilo: "negrita" }, "", { v: vivo.saldo, estilo: "dineroNegrita" }],
        ],
      },
      {
        nombre: "Detalle",
        anchos: [12, 28, 44, 14, 18, 22],
        filas: [
          [{ v: "Fecha", estilo: "encabezado" }, { v: "Concepto", estilo: "encabezado" }, { v: "Detalle", estilo: "encabezado" }, { v: "Origen", estilo: "encabezado" }, { v: "Valor total", estilo: "encabezado" }, { v: "A cargo de Juan Carlos", estilo: "encabezado" }],
          ...r.incluidas.map((l) => [l.fecha, l.concepto, l.detalle, l.origen === "manual" ? "Manual" : "Registrado", { v: l.valor, estilo: "dinero" as const }, { v: (l.valor * vivo.p) / 100, estilo: "dinero" as const }]),
        ],
      },
    ]);
    if (!ok) Alert.alert("Solo en el navegador", "La descarga funciona desde la versión web de la app.");
  }

  function pdf() {
    const bloques: Bloque[] = [
      { t: "titulo", texto: `Gastos de Juanes - ${nombreMes(mes)}`, sub: `Parte a cargo de Juan Carlos Bernal: ${vivo.p}% de los gastos` },
      { t: "seccion", texto: "Resumen" },
      { t: "fila", a: "Cuota alimentaria", c: pesos(vivo.c) },
      ...resumenPorConcepto().map(([c, v]): Bloque => ({ t: "fila", a: c, b: `total ${pesos(v)}`, c: pesos((v * vivo.p) / 100) })),
      { t: "fila", a: "TOTAL DEL MES", b: `gastos ${pesos(r.totalGastos)}`, c: pesos(vivo.total), fuerte: true },
      { t: "fila", a: "Saldo anterior", c: pesos(vivo.sa) },
      { t: "fila", a: "Pago recibido", c: pesos(vivo.pg) },
      { t: "fila", a: "SALDO", c: pesos(vivo.saldo), fuerte: true },
      { t: "espacio" },
      { t: "seccion", texto: "Detalle de los gastos" },
      ...r.incluidas.map((l): Bloque => ({ t: "fila", a: `${l.fecha} - ${l.detalle}`, b: `total ${pesos(l.valor)}`, c: pesos((l.valor * vivo.p) / 100) })),
    ];
    const ok = descargarPdf(`Gastos_Juan_Carlos_Bernal_${mes}.pdf`, bloques);
    if (!ok) Alert.alert("Solo en el navegador", "La descarga funciona desde la versión web de la app.");
  }

  if (r.faltaSql) {
    return (
      <Card>
        <Text style={typography.h3}>Falta un paso en Supabase</Text>
        <Text style={typography.body}>Corre el archivo supabase_finanzas_personales.sql en Supabase (SQL Editor) y vuelve a abrir esta pantalla.</Text>
      </Card>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.selector}>
        <TouchableOpacity onPress={() => setMes(moverMes(mes, -1))} style={styles.flecha} accessibilityLabel="Mes anterior">
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[typography.h2, { textTransform: "capitalize" }]}>{nombreMes(mes)}</Text>
        <TouchableOpacity onPress={() => setMes(moverMes(mes, 1))} style={[styles.flecha, esMesActual && { opacity: 0.3 }]} disabled={esMesActual} accessibilityLabel="Mes siguiente">
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {r.cargando ? (
        <ActivityIndicator color={colors.primary} />
      ) : r.error ? (
        <Text style={{ color: colors.danger }}>Error: {r.error}</Text>
      ) : (
        <>
          <Card style={{ backgroundColor: colors.hero }}>
            <Text style={styles.heroEtiqueta}>Saldo de Juan Carlos al cierre de {MESES[Number(mes.slice(5, 7)) - 1]}</Text>
            <Text style={[styles.heroValor, vivo.saldo < 0 && { color: "#FFB4A8" }]}>{pesos(vivo.saldo)}</Text>
            <Text style={styles.heroDetalle}>
              Gastos {pesos(r.totalGastos)} · su parte ({vivo.p}%) {pesos(vivo.parte)} · cuota {pesos(vivo.c)}
            </Text>
            <Text style={styles.heroDetalle}>
              Total del mes {pesos(vivo.total)} · pagó {pesos(vivo.pg)} · saldo anterior {pesos(vivo.sa)}
            </Text>
          </Card>

          <Card>
            <Text style={typography.h3}>Valores del mes</Text>
            <Text style={[typography.caption, { marginBottom: 6 }]}>Escríbelos y toca «Guardar valores». Los gastos se leen solos de lo que registras.</Text>
            <Text style={styles.label}>Cuota alimentaria</Text>
            <TextInput style={styles.input} value={cuota} onChangeText={setCuota} keyboardType="numeric" placeholder="Ej. 422874" placeholderTextColor={colors.textMuted} />
            <Text style={styles.label}>Lo que pagó Juan Carlos este mes</Text>
            <TextInput style={styles.input} value={pago} onChangeText={setPago} keyboardType="numeric" placeholder="Ej. 360000" placeholderTextColor={colors.textMuted} />
            <Text style={styles.label}>Saldo que venía del mes anterior</Text>
            <TextInput style={styles.input} value={saldoAnt} onChangeText={setSaldoAnt} keyboardType="numeric" placeholder="Ej. 32256217.71" placeholderTextColor={colors.textMuted} />
            <Text style={styles.label}>% de los gastos que le corresponde</Text>
            <TextInput style={styles.input} value={porc} onChangeText={setPorc} keyboardType="numeric" placeholder="50" placeholderTextColor={colors.textMuted} />
            <PrimaryButton title="Guardar valores" onPress={guardar} loading={guardando} />
          </Card>

          <Card>
            <Text style={typography.h3}>Gastos que entran al reporte</Text>
            <Text style={[typography.caption, { marginBottom: 4 }]}>
              Se toman solos los gastos de la familia y los tuyos que dicen «ruta», «onces» o «Juanes» (o tienen el rubro Juanes). Toca el círculo para quitar o volver a poner uno.
            </Text>
            {grupos.length === 0 && <Text style={[typography.caption, { marginTop: 6 }]}>Este mes todavía no hay gastos que coincidan. Registra los gastos en Gastos (rubro Juanes, o que digan ruta/onces) o agrégalos a mano abajo.</Text>}
            {grupos.map(([concepto, items]) => {
              const sub = items.filter((l) => !r.excluidas.has(l.clave)).reduce((s, l) => s + l.valor, 0);
              return (
                <View key={concepto} style={{ marginTop: spacing.md }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={styles.grupo}>{concepto}</Text>
                    <Text style={styles.grupo}>{pesos(sub)}</Text>
                  </View>
                  {items.map((l) => {
                    const incl = !r.excluidas.has(l.clave);
                    return (
                      <View key={l.clave} style={styles.linea}>
                        <TouchableOpacity onPress={() => r.alternar(l.clave)} accessibilityLabel={incl ? "Quitar del reporte" : "Poner en el reporte"} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name={incl ? "checkmark-circle" : "ellipse-outline"} size={24} color={incl ? colors.success : colors.textMuted} />
                        </TouchableOpacity>
                        <View style={{ flex: 1, opacity: incl ? 1 : 0.45 }}>
                          <Text style={styles.lineaTitulo}>{l.detalle}</Text>
                          <Text style={typography.caption}>{l.origen === "manual" ? "Agregado a mano" : l.fecha}</Text>
                        </View>
                        <Text style={[styles.lineaValor, { opacity: incl ? 1 : 0.45 }]}>{pesos(l.valor)}</Text>
                        {l.origen === "manual" && l.idManual && (
                          <TouchableOpacity onPress={() => confirmarBorrar(l.idManual!, l.concepto)} accessibilityLabel="Quitar línea" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="trash-outline" size={18} color={colors.danger} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}

            {agregando ? (
              <View style={{ marginTop: spacing.md }}>
                <TextInput style={styles.input} placeholder="Concepto (ej. Pensión colegio, Cita médica)" placeholderTextColor={colors.textMuted} value={nConcepto} onChangeText={setNConcepto} />
                <TextInput style={styles.input} placeholder="Valor TOTAL del gasto" placeholderTextColor={colors.textMuted} value={nValor} onChangeText={setNValor} keyboardType="numeric" />
                <TextInput style={styles.input} placeholder="Nota (opcional)" placeholderTextColor={colors.textMuted} value={nNota} onChangeText={setNNota} />
                <PrimaryButton title="Agregar al reporte" onPress={agregar} />
                <TouchableOpacity onPress={() => setAgregando(false)} style={styles.salir}>
                  <Text style={{ textAlign: "center", color: colors.textPrimary, fontWeight: "600" }}>Salir sin guardar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.botonBorde, { marginTop: spacing.md }]} onPress={() => setAgregando(true)}>
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={styles.botonBordeTexto}>Agregar otro gasto a mano</Text>
              </TouchableOpacity>
            )}
          </Card>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TouchableOpacity style={[styles.botonBorde, { flex: 1 }]} onPress={excel}>
              <Ionicons name="download-outline" size={16} color={colors.primary} />
              <Text style={styles.botonBordeTexto}>Descargar Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.botonBorde, { flex: 1 }]} onPress={pdf}>
              <Ionicons name="document-text-outline" size={16} color={colors.primary} />
              <Text style={styles.botonBordeTexto}>Descargar PDF</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  selector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  flecha: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  heroEtiqueta: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  heroValor: { color: colors.white, fontSize: 30, fontWeight: "800", marginTop: 2 },
  heroDetalle: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 4 },
  label: { fontSize: 12, color: colors.textSecondary, fontWeight: "600", marginTop: 4 },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  grupo: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  linea: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6 },
  lineaTitulo: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  lineaValor: { fontSize: 13, fontWeight: "800", color: colors.textPrimary },
  salir: { marginTop: spacing.sm, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 },
  botonBorde: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 12 },
  botonBordeTexto: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
