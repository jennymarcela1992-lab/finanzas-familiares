import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePropiedades, PropiedadConDetalle } from "../../hooks/usePropiedades";
import { useDeudas } from "../../hooks/useDeudas";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";

export default function PropiedadesScreen() {
  const { propiedades, cargando, error, crearPropiedad, registrarArriendoRecibido } = usePropiedades();
  const { deudas } = useDeudas();

  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [arrendatario, setArrendatario] = useState("");
  const [valorArriendo, setValorArriendo] = useState("");
  const [creditoId, setCreditoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [propSeleccionada, setPropSeleccionada] = useState<PropiedadConDetalle | null>(null);
  const [montoArriendo, setMontoArriendo] = useState("");

  async function manejarCrear() {
    if (!nombre.trim() || !valorArriendo.trim()) {
      Alert.alert("Faltan datos", "Escribe al menos el nombre y el valor del arriendo.");
      return;
    }
    setGuardando(true);
    try {
      await crearPropiedad({ nombre: nombre.trim(), direccion: direccion.trim() || undefined, arrendatario: arrendatario.trim() || undefined, valorArriendo: parseFloat(valorArriendo.replace(/[^0-9.]/g, "")), creditoId: creditoId ?? undefined });
      setNombre(""); setDireccion(""); setArrendatario(""); setValorArriendo(""); setCreditoId(null);
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo crear la propiedad.");
    } finally {
      setGuardando(false);
    }
  }

  async function manejarRegistrarArriendo() {
    if (!propSeleccionada || !montoArriendo.trim()) return;
    setGuardando(true);
    try {
      await registrarArriendoRecibido(propSeleccionada.id, parseFloat(montoArriendo.replace(/[^0-9.]/g, "")));
      setMontoArriendo("");
      setPropSeleccionada(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el arriendo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Propiedades" subtitle="En arriendo" actionLabel="Nueva" onAction={() => setMostrarForm(!mostrarForm)} actionActive={mostrarForm} />

      {mostrarForm && (
        <Card style={{ marginHorizontal: spacing.lg }}>
          <TextInput style={styles.input} placeholder="Nombre/alias (ej. Apto Torre 4)" placeholderTextColor={colors.textMuted} value={nombre} onChangeText={setNombre} />
          <TextInput style={styles.input} placeholder="Dirección" placeholderTextColor={colors.textMuted} value={direccion} onChangeText={setDireccion} />
          <TextInput style={styles.input} placeholder="Arrendatario" placeholderTextColor={colors.textMuted} value={arrendatario} onChangeText={setArrendatario} />
          <TextInput style={styles.input} placeholder="Valor del arriendo mensual" placeholderTextColor={colors.textMuted} value={valorArriendo} onChangeText={setValorArriendo} keyboardType="numeric" />

          <Text style={styles.label}>Crédito asociado (opcional)</Text>
          <View style={styles.chipsRow}>
            <TouchableOpacity style={[styles.chip, creditoId === null && styles.chipActivo]} onPress={() => setCreditoId(null)}>
              <Text style={[styles.chipText, creditoId === null && styles.chipTextActivo]}>Ninguno</Text>
            </TouchableOpacity>
            {deudas.map((d) => (
              <TouchableOpacity key={d.id} style={[styles.chip, creditoId === d.id && styles.chipActivo]} onPress={() => setCreditoId(d.id)}>
                <Text style={[styles.chipText, creditoId === d.id && styles.chipTextActivo]}>{d.nombre}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <PrimaryButton title="Crear propiedad" onPress={manejarCrear} loading={guardando} />
        </Card>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando propiedades: {error}</Text>
      ) : (
        <FlatList
          data={propiedades}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay propiedades registradas.</Text>}
          renderItem={({ item: p }) => (
            <TouchableOpacity onPress={() => setPropSeleccionada(p)} activeOpacity={0.85}>
              <Card>
                <View style={styles.rowStart}>
                  <View style={styles.iconoCircle}>
                    <Ionicons name="business" size={17} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.h3}>{p.nombre}</Text>
                    {p.arrendatario && <Text style={typography.caption}>Arrendatario: {p.arrendatario}</Text>}
                  </View>
                </View>
                <Text style={[typography.body, { marginTop: spacing.sm }]}>Arriendo: ${Number(p.valor_arriendo).toLocaleString("es-CO")}/mes</Text>
                {p.credito && (
                  <View style={styles.avisoBox}>
                    <Ionicons name="alert-circle" size={14} color={colors.warning} />
                    <Text style={styles.avisoTexto}>
                      "{p.credito.nombre}": ${p.credito.proximaCuotaValor?.toLocaleString("es-CO")} vence {p.credito.proximaCuotaFecha}
                      {p.credito.entidad_pago ? ` · ${p.credito.entidad_pago}` : ""}
                    </Text>
                  </View>
                )}
                <Text style={styles.neto}>Neto del mes: ${p.netoMesActual.toLocaleString("es-CO")}</Text>
                <Text style={styles.hint}>Toca para registrar el arriendo recibido este mes</Text>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!propSeleccionada} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={typography.h2}>Arriendo recibido: {propSeleccionada?.nombre}</Text>
            <TextInput style={styles.input} placeholder="Monto recibido" placeholderTextColor={colors.textMuted} value={montoArriendo} onChangeText={setMontoArriendo} keyboardType="numeric" />
            <PrimaryButton title="Guardar" onPress={manejarRegistrarArriendo} loading={guardando} />
            <TouchableOpacity onPress={() => setPropSeleccionada(null)} style={{ marginTop: spacing.md }}>
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
  label: { ...typography.caption, marginBottom: spacing.sm },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6 },
  chipActivo: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  chipTextActivo: { color: colors.white },
  rowStart: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconoCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  avisoBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: spacing.sm, backgroundColor: "#FCEFD9", padding: spacing.sm, borderRadius: radius.sm },
  avisoTexto: { fontSize: 12, color: colors.warning, fontWeight: "600", flex: 1 },
  neto: { fontSize: 14, fontWeight: "800", color: colors.primary, marginTop: spacing.sm },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.xl },
  modalCaja: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
});
