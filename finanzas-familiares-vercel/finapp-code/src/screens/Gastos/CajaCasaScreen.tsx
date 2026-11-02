import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCajaCasa, LineaCaja, Fuente, DestinoElegido } from "../../hooks/useCajaCasa";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import FechaInput from "../../components/FechaInput";
import { colors, spacing, typography, radius } from "../../theme/theme";
import { pesos, hoyISO, formatoFecha } from "../../utils/amortizacion";
import { aNumero } from "../../utils/numeros";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const etiquetaMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const sumarMes = (m: string, d: number) => {
  const x = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + d, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
};

const SECCIONES: { fuente: Fuente; titulo: string; icono: keyof typeof Ionicons.glyphMap }[] = [
  { fuente: "arriendo", titulo: "Arriendos", icono: "business" },
  { fuente: "vehiculo", titulo: "Uber / vehículos", icono: "car" },
  { fuente: "prestamo", titulo: "Préstamos que nos pagan", icono: "people" },
];

export default function CajaCasaScreen() {
  const [mes, setMes] = useState(hoyISO().slice(0, 7));
  const { lineas, totales, total, deudas, metas, cargando, error, faltaSql, asignar, quitar } = useCajaCasa(mes);

  const [asignando, setAsignando] = useState<string | null>(null); // clave de la línea
  const [tipo, setTipo] = useState<"credito" | "ahorro">("credito");
  const [destinoId, setDestinoId] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [guardando, setGuardando] = useState(false);

  function abrirAsignar(l: LineaCaja) {
    setAsignando(l.clave);
    setTipo("credito");
    setDestinoId(null);
    setValor(Math.round(l.sinAsignar).toLocaleString("es-CO"));
    setFecha(hoyISO());
  }

  async function guardar(l: LineaCaja) {
    if (!destinoId) return Alert.alert("Falta el destino", tipo === "credito" ? "Elige a cuál crédito va." : "Elige a cuál ahorro va.");
    const destino: DestinoElegido = tipo === "credito" ? { tipo: "credito", deudaId: destinoId } : { tipo: "ahorro", metaId: destinoId };
    setGuardando(true);
    try {
      await asignar(l, destino, aNumero(valor), fecha);
      setAsignando(null);
    } catch (e: any) {
      Alert.alert("No se pudo asignar", e.message ?? "Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  function confirmarQuitar(texto: string, accion: () => Promise<void>) {
    Alert.alert("Quitar asignación", `¿Quitar "${texto}"? Se borra el pago o el ahorro que se creó con ella.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: () => accion().catch((e) => Alert.alert("Error", e.message)) },
    ]);
  }

  function renderLinea(l: LineaCaja) {
    return (
      <View key={l.clave} style={styles.linea}>
        <View style={styles.lineaTop}>
          <View style={{ flex: 1 }}>
            <Text style={typography.h3}>{l.titulo}</Text>
            <Text style={typography.caption}>{l.subtitulo}</Text>
          </View>
          <Text style={styles.monto}>{pesos(l.monto)}</Text>
        </View>

        {l.destinos.map((d, i) => (
          <View key={i} style={styles.destino}>
            <Text style={styles.destinoTxt}>
              {d.texto} · {pesos(d.valor)}
            </Text>
            {d.asignacion && (
              <TouchableOpacity onPress={() => confirmarQuitar(`${d.texto} ${pesos(d.valor)}`, () => quitar(d.asignacion!))}>
                <Text style={styles.quitar}>Quitar</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {l.sinAsignar > 0 ? (
          <View style={styles.sinAsignar}>
            <Text style={styles.sinAsignarTxt}>⚠ Sin asignar · {pesos(l.sinAsignar)}</Text>
            {!faltaSql && asignando !== l.clave && (
              <TouchableOpacity style={styles.btnAsignar} onPress={() => abrirAsignar(l)}>
                <Text style={styles.btnAsignarTxt}>Asignar</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={styles.completo}>✓ Todo asignado</Text>
        )}

        {asignando === l.clave && (
          <View style={styles.panel}>
            <Text style={styles.label}>¿A dónde va?</Text>
            <View style={styles.chips}>
              {(["credito", "ahorro"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, tipo === t && styles.chipActivo]}
                  onPress={() => {
                    setTipo(t);
                    setDestinoId(null);
                  }}
                >
                  <Text style={[styles.chipTxt, tipo === t && styles.chipTxtActivo]}>{t === "credito" ? "A un crédito" : "A un ahorro"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.chips}>
              {(tipo === "credito" ? deudas : metas).map((x) => (
                <TouchableOpacity key={x.id} style={[styles.chip, destinoId === x.id && styles.chipActivo]} onPress={() => setDestinoId(x.id)}>
                  <Text style={[styles.chipTxt, destinoId === x.id && styles.chipTxtActivo]}>{x.nombre}</Text>
                </TouchableOpacity>
              ))}
              {(tipo === "credito" ? deudas : metas).length === 0 && (
                <Text style={typography.caption}>{tipo === "credito" ? "No hay créditos creados." : "No hay metas de ahorro creadas."}</Text>
              )}
            </View>
            <Text style={styles.label}>Valor</Text>
            <TextInput style={styles.input} value={valor} onChangeText={setValor} keyboardType="numeric" placeholder="Valor" placeholderTextColor={colors.textMuted} />
            <Text style={styles.label}>Fecha</Text>
            <FechaInput value={fecha} onChange={setFecha} max={hoyISO()} />
            <Text style={styles.ayuda}>
              {tipo === "credito"
                ? "Queda como pago del crédito hecho por «La casa» (no cuenta como aporte de Jenny ni de Jhon)."
                : "Queda como aporte al ahorro hecho por «La casa»."}
            </Text>
            <PrimaryButton title="Guardar" onPress={() => guardar(l)} loading={guardando} />
            <PrimaryButton title="Cancelar" variant="outline" onPress={() => setAsignando(null)} style={{ marginTop: spacing.sm }} />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Caja de la casa" subtitle={`Entró ${pesos(total.entro)} · sin asignar ${pesos(total.sinAsignar)}`} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl }}>
        <View style={styles.mesFila}>
          <TouchableOpacity style={styles.chip} onPress={() => setMes(sumarMes(mes, -1))}>
            <Text style={styles.chipTxt}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.mesTxt}>{etiquetaMes(mes)}</Text>
          <TouchableOpacity style={styles.chip} onPress={() => setMes(sumarMes(mes, 1))}>
            <Text style={styles.chipTxt}>›</Text>
          </TouchableOpacity>
        </View>

        {faltaSql && (
          <Card style={{ backgroundColor: colors.warningBg, marginBottom: spacing.md }}>
            <Text style={styles.ayuda}>
              Falta crear la tabla de asignaciones: corre el archivo supabase_caja_casa.sql en Supabase (SQL Editor). Mientras tanto puedes ver lo que entró, pero no asignarlo desde aquí.
            </Text>
          </Card>
        )}

        {cargando ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
        ) : error ? (
          <Text style={styles.error}>Error cargando la caja: {error}</Text>
        ) : (
          <>
            <Card style={{ marginBottom: spacing.md }}>
              <View style={[styles.resFila, styles.resEnc]}>
                <Text style={[styles.resCelda, { flex: 1.4 }]}> </Text>
                <Text style={[styles.resCelda, styles.der, styles.resEncTxt]}>Entró</Text>
                <Text style={[styles.resCelda, styles.der, styles.resEncTxt]}>Asignado</Text>
                <Text style={[styles.resCelda, styles.der, styles.resEncTxt]}>Sin asignar</Text>
              </View>
              {SECCIONES.map((s) => (
                <View key={s.fuente} style={styles.resFila}>
                  <Text style={[styles.resCelda, { flex: 1.4 }]}>{s.titulo}</Text>
                  <Text style={[styles.resCelda, styles.der]}>{pesos(totales[s.fuente].entro)}</Text>
                  <Text style={[styles.resCelda, styles.der]}>{pesos(totales[s.fuente].asignado)}</Text>
                  <Text style={[styles.resCelda, styles.der, totales[s.fuente].sinAsignar > 0 && { color: colors.warning, fontWeight: "700" }]}>
                    {pesos(totales[s.fuente].sinAsignar)}
                  </Text>
                </View>
              ))}
              <View style={[styles.resFila, styles.resTotal]}>
                <Text style={[styles.resCelda, styles.neg, { flex: 1.4 }]}>Total</Text>
                <Text style={[styles.resCelda, styles.der, styles.neg]}>{pesos(total.entro)}</Text>
                <Text style={[styles.resCelda, styles.der, styles.neg]}>{pesos(total.asignado)}</Text>
                <Text style={[styles.resCelda, styles.der, styles.neg, total.sinAsignar > 0 && { color: colors.warning }]}>{pesos(total.sinAsignar)}</Text>
              </View>
            </Card>

            {total.entro === 0 && <Text style={styles.vacio}>No entró nada en {etiquetaMes(mes)} por arriendos, vehículos ni préstamos.</Text>}

            {SECCIONES.map((s) => {
              const delas = lineas.filter((l) => l.fuente === s.fuente);
              if (!delas.length) return null;
              return (
                <Card key={s.fuente} style={{ marginBottom: spacing.md }}>
                  <View style={styles.secTit}>
                    <Ionicons name={s.icono} size={16} color={colors.primary} />
                    <Text style={typography.h3}>{s.titulo}</Text>
                    <Text style={[typography.caption, { marginLeft: "auto" }]}>{pesos(totales[s.fuente].entro)}</Text>
                  </View>
                  {delas.map(renderLinea)}
                </Card>
              );
            })}
            <Text style={styles.ayuda}>
              «Sin asignar» es lo que entró y todavía no se mandó a un crédito, a un ahorro o a una persona. Los arriendos y los pagos de préstamos ya guardan su destino cuando los registras; el Uber siempre se asigna desde aquí.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mesFila: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  mesTxt: { fontSize: 15, fontWeight: "800", color: colors.textPrimary, marginHorizontal: spacing.sm, minWidth: 150, textAlign: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, marginBottom: 6 },
  chipActivo: { backgroundColor: colors.primary },
  chipTxt: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  chipTxtActivo: { color: colors.white },
  resFila: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  resEnc: { backgroundColor: colors.hero, borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
  resEncTxt: { color: colors.white, fontWeight: "700" },
  resTotal: { backgroundColor: colors.primaryLight, borderBottomWidth: 0 },
  resCelda: { flex: 1, paddingHorizontal: 6, paddingVertical: 8, fontSize: 12, color: colors.textPrimary },
  der: { textAlign: "right" },
  neg: { fontWeight: "800" },
  secTit: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  linea: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  lineaTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  monto: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  destino: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4, paddingLeft: 8 },
  destinoTxt: { fontSize: 12, color: colors.success, fontWeight: "600", flex: 1 },
  quitar: { fontSize: 11, color: colors.danger, fontWeight: "700", paddingHorizontal: 6 },
  sinAsignar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6, backgroundColor: colors.warningBg, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 6 },
  sinAsignarTxt: { fontSize: 12, color: colors.warning, fontWeight: "700", flex: 1 },
  btnAsignar: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 },
  btnAsignarTxt: { color: colors.white, fontSize: 12, fontWeight: "700" },
  completo: { fontSize: 12, color: colors.success, fontWeight: "700", marginTop: 6, paddingLeft: 8 },
  panel: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  label: { fontSize: 12, color: colors.textSecondary, fontWeight: "600", marginBottom: 4, marginTop: 4 },
  input: { backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: 10, fontSize: 14, color: colors.textPrimary, marginBottom: spacing.sm },
  ayuda: { fontSize: 11, color: colors.textMuted, marginVertical: spacing.sm },
  vacio: { textAlign: "center", color: colors.textMuted, marginVertical: spacing.lg },
  error: { color: colors.danger, margin: spacing.lg },
});
