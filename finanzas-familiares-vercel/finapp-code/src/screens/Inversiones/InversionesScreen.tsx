import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useInversiones, InversionConIndicadores } from "../../hooks/useInversiones";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";

export default function InversionesScreen() {
  const { inversiones, cargando, error, crearInversion, agregarMovimiento } = useInversiones();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("");
  const [inversionInicial, setInversionInicial] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [invSeleccionada, setInvSeleccionada] = useState<InversionConIndicadores | null>(null);
  const [tipoMovimiento, setTipoMovimiento] = useState<"ingreso" | "egreso">("ingreso");
  const [montoMovimiento, setMontoMovimiento] = useState("");
  const [conceptoMovimiento, setConceptoMovimiento] = useState("");

  async function manejarCrear() {
    if (!nombre.trim() || !inversionInicial.trim()) {
      Alert.alert("Faltan datos", "Escribe al menos el nombre y la inversión inicial.");
      return;
    }
    setGuardando(true);
    try {
      await crearInversion({ nombre: nombre.trim(), tipo: tipo.trim() || undefined, inversionInicial: parseFloat(inversionInicial.replace(/[^0-9.]/g, "")) });
      setNombre(""); setTipo(""); setInversionInicial("");
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo crear la inversión.");
    } finally {
      setGuardando(false);
    }
  }

  async function manejarAgregarMovimiento() {
    if (!invSeleccionada || !montoMovimiento.trim()) return;
    setGuardando(true);
    try {
      await agregarMovimiento(invSeleccionada.id, tipoMovimiento, parseFloat(montoMovimiento.replace(/[^0-9.]/g, "")), conceptoMovimiento.trim() || undefined);
      setMontoMovimiento(""); setConceptoMovimiento(""); setInvSeleccionada(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el movimiento.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Inversiones" subtitle="Miniproyectos" actionLabel="Nueva" onAction={() => setMostrarForm(!mostrarForm)} actionActive={mostrarForm} />

      {mostrarForm && (
        <Card style={{ marginHorizontal: spacing.lg }}>
          <TextInput style={styles.input} placeholder="Nombre del proyecto" placeholderTextColor={colors.textMuted} value={nombre} onChangeText={setNombre} />
          <TextInput style={styles.input} placeholder="Tipo (ej. negocio, inversión pasiva)" placeholderTextColor={colors.textMuted} value={tipo} onChangeText={setTipo} />
          <TextInput style={styles.input} placeholder="Inversión inicial" placeholderTextColor={colors.textMuted} value={inversionInicial} onChangeText={setInversionInicial} keyboardType="numeric" />
          <PrimaryButton title="Crear proyecto" onPress={manejarCrear} loading={guardando} />
        </Card>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando inversiones: {error}</Text>
      ) : (
        <FlatList
          data={inversiones}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay proyectos de inversión.</Text>}
          renderItem={({ item: inv }) => (
            <TouchableOpacity onPress={() => setInvSeleccionada(inv)} activeOpacity={0.85}>
              <Card>
                <View style={styles.rowStart}>
                  <View style={styles.iconoCircle}>
                    <Ionicons name="trending-up" size={17} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={typography.h3}>{inv.nombre}</Text>
                    {inv.tipo && <Text style={typography.caption}>{inv.tipo}</Text>}
                  </View>
                </View>
                <Text style={[typography.body, { marginTop: spacing.sm }]}>Inversión inicial: ${Number(inv.inversion_inicial).toLocaleString("es-CO")}</Text>
                <View style={styles.indicadoresRow}>
                  <View style={styles.pill}><Text style={styles.pillText}>ROI {inv.roi.toFixed(1)}%</Text></View>
                  <View style={styles.pill}><Text style={styles.pillText}>Margen {inv.margenNeto.toFixed(1)}%</Text></View>
                </View>
                <Text style={[styles.utilidad, inv.utilidadNeta >= 0 ? styles.positivo : styles.negativo]}>
                  Utilidad neta: ${inv.utilidadNeta.toLocaleString("es-CO")}
                </Text>
                <Text style={styles.hint}>Toca para registrar un ingreso o egreso</Text>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!invSeleccionada} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={typography.h2}>Movimiento: {invSeleccionada?.nombre}</Text>
            <View style={[styles.chipsRow, { marginTop: spacing.sm }]}>
              <TouchableOpacity style={[styles.chip, tipoMovimiento === "ingreso" && styles.chipActivo]} onPress={() => setTipoMovimiento("ingreso")}>
                <Text style={[styles.chipText, tipoMovimiento === "ingreso" && styles.chipTextActivo]}>Ingreso</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.chip, tipoMovimiento === "egreso" && styles.chipActivo]} onPress={() => setTipoMovimiento("egreso")}>
                <Text style={[styles.chipText, tipoMovimiento === "egreso" && styles.chipTextActivo]}>Egreso</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder="Monto" placeholderTextColor={colors.textMuted} value={montoMovimiento} onChangeText={setMontoMovimiento} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder="Concepto (opcional)" placeholderTextColor={colors.textMuted} value={conceptoMovimiento} onChangeText={setConceptoMovimiento} />
            <PrimaryButton title="Guardar" onPress={manejarAgregarMovimiento} loading={guardando} />
            <TouchableOpacity onPress={() => setInvSeleccionada(null)} style={{ marginTop: spacing.md }}>
              <Text style={{ textAlign: "center", color: colors.textSecondary }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  rowStart: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconoCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  indicadoresRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  pill: { backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { fontSize: 11, fontWeight: "700", color: colors.primary },
  utilidad: { fontSize: 14, fontWeight: "800", marginTop: spacing.sm },
  positivo: { color: colors.success },
  negativo: { color: colors.warning },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.xl },
  modalCaja: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8, marginBottom: 6 },
  chipActivo: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontSize: 13 },
  chipTextActivo: { color: colors.white },
});
