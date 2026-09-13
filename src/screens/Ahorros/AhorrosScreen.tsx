import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAhorros, MetaAhorro } from "../../hooks/useAhorros";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import ProgressBar from "../../components/ProgressBar";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";

export default function AhorrosScreen() {
  const { metas, cargando, error, crearMeta, agregarAporte } = useAhorros();
  const [mostrarNuevaMeta, setMostrarNuevaMeta] = useState(false);
  const [nombreMeta, setNombreMeta] = useState("");
  const [montoObjetivo, setMontoObjetivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [metaSeleccionada, setMetaSeleccionada] = useState<MetaAhorro | null>(null);
  const [montoAporte, setMontoAporte] = useState("");
  const [notaAporte, setNotaAporte] = useState("");

  async function manejarCrearMeta() {
    if (!nombreMeta.trim() || !montoObjetivo.trim()) {
      Alert.alert("Faltan datos", "Escribe el nombre y el monto objetivo.");
      return;
    }
    setGuardando(true);
    try {
      await crearMeta(nombreMeta.trim(), parseFloat(montoObjetivo.replace(/[^0-9.]/g, "")));
      setNombreMeta("");
      setMontoObjetivo("");
      setMostrarNuevaMeta(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo crear la meta.");
    } finally {
      setGuardando(false);
    }
  }

  async function manejarAgregarAporte() {
    if (!metaSeleccionada || !montoAporte.trim()) return;
    setGuardando(true);
    try {
      await agregarAporte(metaSeleccionada.id, parseFloat(montoAporte.replace(/[^0-9.]/g, "")), notaAporte.trim() || undefined);
      setMontoAporte("");
      setNotaAporte("");
      setMetaSeleccionada(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el aporte.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Ahorros" subtitle={`${metas.length} meta(s) activa(s)`} actionLabel="Meta" actionIcon="flag" onAction={() => setMostrarNuevaMeta(!mostrarNuevaMeta)} actionActive={mostrarNuevaMeta} />

      {mostrarNuevaMeta && (
        <Card style={{ marginHorizontal: spacing.lg }}>
          <TextInput style={styles.input} placeholder="Nombre de la meta (ej. Vacaciones)" placeholderTextColor={colors.textMuted} value={nombreMeta} onChangeText={setNombreMeta} />
          <TextInput style={styles.input} placeholder="Monto objetivo" placeholderTextColor={colors.textMuted} value={montoObjetivo} onChangeText={setMontoObjetivo} keyboardType="numeric" />
          <PrimaryButton title="Crear meta" onPress={manejarCrearMeta} loading={guardando} />
        </Card>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando ahorros: {error}</Text>
      ) : (
        <FlatList
          data={metas}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay metas de ahorro.</Text>}
          renderItem={({ item: m }) => (
            <TouchableOpacity onPress={() => setMetaSeleccionada(m)} activeOpacity={0.85}>
              <Card>
                <View style={styles.rowBetween}>
                  <View style={styles.iconoCircle}>
                    <Ionicons name="flag" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.pctText}>{Math.round(m.progreso * 100)}%</Text>
                </View>
                <Text style={[typography.h3, { marginTop: spacing.sm }]}>{m.nombre}</Text>
                <View style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
                  <ProgressBar progreso={m.progreso} />
                </View>
                <Text style={typography.caption}>
                  ${m.totalAportado.toLocaleString("es-CO")} de ${m.monto_objetivo.toLocaleString("es-CO")}
                </Text>
                <Text style={styles.hint}>Toca para agregar un aporte</Text>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!metaSeleccionada} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={typography.h2}>Aportar a "{metaSeleccionada?.nombre}"</Text>
            <TextInput style={styles.input} placeholder="Monto" placeholderTextColor={colors.textMuted} value={montoAporte} onChangeText={setMontoAporte} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder="Nota (ej. Enviado a Nu)" placeholderTextColor={colors.textMuted} value={notaAporte} onChangeText={setNotaAporte} />
            <PrimaryButton title="Guardar aporte" onPress={manejarAgregarAporte} loading={guardando} />
            <TouchableOpacity onPress={() => setMetaSeleccionada(null)} style={{ marginTop: spacing.md }}>
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
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  iconoCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  pctText: { ...typography.h3, color: colors.primary },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.xl },
  modalCaja: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
});
