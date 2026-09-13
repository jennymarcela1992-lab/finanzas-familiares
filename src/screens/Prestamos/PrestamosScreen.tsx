import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePrestamos, PrestamoConAbonos } from "../../hooks/usePrestamos";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";

export default function PrestamosScreen() {
  const { prestamos, cargando, error, crearPrestamo, agregarAbono } = usePrestamos();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [quienPresta, setQuienPresta] = useState("");
  const [quienRecibe, setQuienRecibe] = useState("");
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [prestamoSeleccionado, setPrestamoSeleccionado] = useState<PrestamoConAbonos | null>(null);
  const [montoAbono, setMontoAbono] = useState("");

  async function manejarCrear() {
    if (!quienPresta.trim() || !quienRecibe.trim() || !monto.trim()) {
      Alert.alert("Faltan datos", "Completa quién presta, quién recibe y el monto.");
      return;
    }
    setGuardando(true);
    try {
      await crearPrestamo({ quienPresta: quienPresta.trim(), quienRecibe: quienRecibe.trim(), monto: parseFloat(monto.replace(/[^0-9.]/g, "")), motivo: motivo.trim() || undefined });
      setQuienPresta(""); setQuienRecibe(""); setMonto(""); setMotivo("");
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el préstamo.");
    } finally {
      setGuardando(false);
    }
  }

  async function manejarAbono() {
    if (!prestamoSeleccionado || !montoAbono.trim()) return;
    setGuardando(true);
    try {
      await agregarAbono(prestamoSeleccionado.id, parseFloat(montoAbono.replace(/[^0-9.]/g, "")));
      setMontoAbono("");
      setPrestamoSeleccionado(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el abono.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Préstamos" subtitle="Entre ustedes o con terceros" actionLabel="Nuevo" onAction={() => setMostrarForm(!mostrarForm)} actionActive={mostrarForm} />

      {mostrarForm && (
        <Card style={{ marginHorizontal: spacing.lg }}>
          <TextInput style={styles.input} placeholder="¿Quién prestó? (ej. Jenny)" placeholderTextColor={colors.textMuted} value={quienPresta} onChangeText={setQuienPresta} />
          <TextInput style={styles.input} placeholder="¿Quién recibió? (ej. Jhon, o un tercero)" placeholderTextColor={colors.textMuted} value={quienRecibe} onChangeText={setQuienRecibe} />
          <TextInput style={styles.input} placeholder="Monto" placeholderTextColor={colors.textMuted} value={monto} onChangeText={setMonto} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Motivo (ej. pago moto)" placeholderTextColor={colors.textMuted} value={motivo} onChangeText={setMotivo} />
          <PrimaryButton title="Registrar préstamo" onPress={manejarCrear} loading={guardando} />
        </Card>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando préstamos: {error}</Text>
      ) : (
        <FlatList
          data={prestamos}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay préstamos registrados.</Text>}
          renderItem={({ item: p }) => (
            <TouchableOpacity onPress={() => setPrestamoSeleccionado(p)} activeOpacity={0.85}>
              <Card style={styles.rowStart}>
                <View style={styles.iconoCircle}>
                  <Ionicons name="swap-horizontal" size={17} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={typography.h3}>{p.quien_presta} → {p.quien_recibe}</Text>
                  {p.motivo && <Text style={typography.caption}>{p.motivo}</Text>}
                  <Text style={styles.saldo}>
                    Saldo: ${p.saldoPendiente.toLocaleString("es-CO")} de ${Number(p.monto).toLocaleString("es-CO")}
                  </Text>
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!prestamoSeleccionado} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={typography.h2}>
              Abono: {prestamoSeleccionado?.quien_presta} → {prestamoSeleccionado?.quien_recibe}
            </Text>
            <Text style={[typography.body, { marginBottom: spacing.md }]}>Saldo actual: ${prestamoSeleccionado?.saldoPendiente.toLocaleString("es-CO")}</Text>
            <TextInput style={styles.input} placeholder="Monto del abono" placeholderTextColor={colors.textMuted} value={montoAbono} onChangeText={setMontoAbono} keyboardType="numeric" />
            <PrimaryButton title="Guardar abono" onPress={manejarAbono} loading={guardando} />
            <TouchableOpacity onPress={() => setPrestamoSeleccionado(null)} style={{ marginTop: spacing.md }}>
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
  iconoCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  saldo: { fontSize: 13, color: colors.primary, fontWeight: "700", marginTop: 4 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.xl },
  modalCaja: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
});
