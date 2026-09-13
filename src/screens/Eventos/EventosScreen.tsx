import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePresupuestosEvento, PresupuestoConItems, ItemPresupuestoRow } from "../../hooks/usePresupuestosEvento";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";

export default function EventosScreen() {
  const { presupuestos, cargando, error, crearPresupuesto, agregarItem, registrarValorReal } = usePresupuestosEvento();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [eventoAbierto, setEventoAbierto] = useState<string | null>(null);
  const [nombreItem, setNombreItem] = useState("");
  const [valorPlaneadoItem, setValorPlaneadoItem] = useState("");

  const [itemSeleccionado, setItemSeleccionado] = useState<ItemPresupuestoRow | null>(null);
  const [valorRealInput, setValorRealInput] = useState("");

  async function manejarCrearEvento() {
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Escribe el nombre del evento o viaje.");
      return;
    }
    setGuardando(true);
    try {
      const id = await crearPresupuesto(nombre.trim(), new Date().toISOString().slice(0, 10));
      setNombre("");
      setMostrarForm(false);
      setEventoAbierto(id);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo crear el evento.");
    } finally {
      setGuardando(false);
    }
  }

  async function manejarAgregarItem(presupuestoId: string) {
    if (!nombreItem.trim() || !valorPlaneadoItem.trim()) return;
    setGuardando(true);
    try {
      await agregarItem(presupuestoId, nombreItem.trim(), parseFloat(valorPlaneadoItem.replace(/[^0-9.]/g, "")));
      setNombreItem(""); setValorPlaneadoItem("");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo agregar el ítem.");
    } finally {
      setGuardando(false);
    }
  }

  async function manejarRegistrarReal() {
    if (!itemSeleccionado || !valorRealInput.trim()) return;
    setGuardando(true);
    try {
      await registrarValorReal(itemSeleccionado.id, parseFloat(valorRealInput.replace(/[^0-9.]/g, "")));
      setValorRealInput(""); setItemSeleccionado(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar el gasto real.");
    } finally {
      setGuardando(false);
    }
  }

  function renderEvento(p: PresupuestoConItems) {
    const abierto = eventoAbierto === p.id;
    const positivo = p.diferencia >= 0;
    return (
      <Card>
        <TouchableOpacity onPress={() => setEventoAbierto(abierto ? null : p.id)}>
          <View style={styles.rowStart}>
            <View style={styles.iconoCircle}>
              <Ionicons name="airplane" size={17} color={colors.primary} />
            </View>
            <Text style={typography.h3}>{p.nombre}</Text>
          </View>
          <Text style={[typography.body, { marginTop: spacing.sm }]}>
            Planeado: ${p.totalPlaneado.toLocaleString("es-CO")} · Real: ${p.totalReal.toLocaleString("es-CO")}
          </Text>
          <View style={[styles.pill, positivo ? styles.pillSuccess : styles.pillWarning]}>
            <Text style={[styles.pillText, positivo ? styles.pillTextSuccess : styles.pillTextWarning]}>
              {positivo ? "Dentro del presupuesto por" : "Excedido por"} ${Math.abs(p.diferencia).toLocaleString("es-CO")}
            </Text>
          </View>
          <Text style={styles.hint}>{abierto ? "Ocultar ítems ▲" : "Ver ítems ▼"}</Text>
        </TouchableOpacity>

        {abierto && (
          <View style={{ marginTop: spacing.sm }}>
            {p.items.map((it) => (
              <TouchableOpacity key={it.id} style={styles.itemRow} onPress={() => setItemSeleccionado(it)}>
                <Text style={styles.itemNombre}>{it.nombre}</Text>
                <Text style={styles.itemValores}>
                  ${Number(it.valor_planeado).toLocaleString("es-CO")}{it.valor_real != null ? ` → $${Number(it.valor_real).toLocaleString("es-CO")}` : " (sin real)"}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.nuevoItemRow}>
              <TextInput style={[styles.input, { flex: 1.4, marginRight: 6, marginBottom: 0 }]} placeholder="Nuevo ítem" placeholderTextColor={colors.textMuted} value={nombreItem} onChangeText={setNombreItem} />
              <TextInput style={[styles.input, { flex: 1, marginRight: 6, marginBottom: 0 }]} placeholder="Planeado" placeholderTextColor={colors.textMuted} value={valorPlaneadoItem} onChangeText={setValorPlaneadoItem} keyboardType="numeric" />
              <TouchableOpacity style={styles.miniBoton} onPress={() => manejarAgregarItem(p.id)}>
                <Ionicons name="add" size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Eventos" subtitle="Viajes y presupuestos" actionLabel="Nuevo" onAction={() => setMostrarForm(!mostrarForm)} actionActive={mostrarForm} />

      {mostrarForm && (
        <Card style={{ marginHorizontal: spacing.lg }}>
          <TextInput style={styles.input} placeholder="Nombre (ej. Vacaciones diciembre)" placeholderTextColor={colors.textMuted} value={nombre} onChangeText={setNombre} />
          <PrimaryButton title="Crear evento" onPress={manejarCrearEvento} loading={guardando} />
        </Card>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando eventos: {error}</Text>
      ) : (
        <FlatList
          data={presupuestos}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay eventos o viajes presupuestados.</Text>}
          renderItem={({ item: p }) => renderEvento(p)}
        />
      )}

      <Modal visible={!!itemSeleccionado} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={typography.h2}>Gasto real: {itemSeleccionado?.nombre}</Text>
            <Text style={[typography.body, { marginBottom: spacing.sm }]}>Planeado: ${Number(itemSeleccionado?.valor_planeado).toLocaleString("es-CO")}</Text>
            <TextInput style={styles.input} placeholder="Valor real gastado" placeholderTextColor={colors.textMuted} value={valorRealInput} onChangeText={setValorRealInput} keyboardType="numeric" />
            <PrimaryButton title="Guardar" onPress={manejarRegistrarReal} loading={guardando} />
            <TouchableOpacity onPress={() => setItemSeleccionado(null)} style={{ marginTop: spacing.md }}>
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
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 14, color: colors.textPrimary },
  rowStart: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconoCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, marginTop: spacing.sm },
  pillSuccess: { backgroundColor: colors.primaryLight },
  pillWarning: { backgroundColor: "#FCEFD9" },
  pillText: { fontSize: 11, fontWeight: "700" },
  pillTextSuccess: { color: colors.success },
  pillTextWarning: { color: colors.warning },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
  itemRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  itemNombre: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  itemValores: { fontSize: 12, color: colors.textSecondary },
  nuevoItemRow: { flexDirection: "row", marginTop: spacing.sm, alignItems: "center" },
  miniBoton: { backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.sm },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.xl },
  modalCaja: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
});
