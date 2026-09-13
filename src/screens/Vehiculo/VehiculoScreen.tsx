import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useVehiculos, VehiculoConResumen, NOMBRES_DIAS } from "../../hooks/useVehiculos";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";

export default function VehiculoScreen() {
  const { vehiculos, cargando, error, crearVehiculo, registrarPagoHoy } = useVehiculos();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [placa, setPlaca] = useState("");
  const [arrendatario, setArrendatario] = useState("");
  const [cuotaDiaria, setCuotaDiaria] = useState("");
  const [diaDescanso, setDiaDescanso] = useState(0);
  const [guardando, setGuardando] = useState(false);

  async function manejarCrear() {
    if (!nombre.trim() || !cuotaDiaria.trim()) {
      Alert.alert("Faltan datos", "Escribe al menos el nombre y la cuota diaria.");
      return;
    }
    setGuardando(true);
    try {
      await crearVehiculo({ nombre: nombre.trim(), placa: placa.trim() || undefined, arrendatario: arrendatario.trim() || undefined, cuotaDiaria: parseFloat(cuotaDiaria.replace(/[^0-9.]/g, "")), diaDescanso });
      setNombre(""); setPlaca(""); setArrendatario(""); setCuotaDiaria(""); setDiaDescanso(0);
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo crear el vehículo.");
    } finally {
      setGuardando(false);
    }
  }

  function manejarRegistrarHoy(v: VehiculoConResumen, pagado: boolean) {
    registrarPagoHoy(v.id, pagado ? "pagado" : "no_pagado", pagado ? v.cuota_diaria : undefined).catch((e) => Alert.alert("Error", e.message ?? "No se pudo registrar."));
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Vehículo" subtitle="Renta diaria" actionLabel="Nuevo" onAction={() => setMostrarForm(!mostrarForm)} actionActive={mostrarForm} />

      {mostrarForm && (
        <Card style={{ marginHorizontal: spacing.lg }}>
          <TextInput style={styles.input} placeholder="Nombre/alias del vehículo" placeholderTextColor={colors.textMuted} value={nombre} onChangeText={setNombre} />
          <TextInput style={styles.input} placeholder="Placa" placeholderTextColor={colors.textMuted} value={placa} onChangeText={setPlaca} />
          <TextInput style={styles.input} placeholder="Conductor/arrendatario" placeholderTextColor={colors.textMuted} value={arrendatario} onChangeText={setArrendatario} />
          <TextInput style={styles.input} placeholder="Cuota diaria esperada" placeholderTextColor={colors.textMuted} value={cuotaDiaria} onChangeText={setCuotaDiaria} keyboardType="numeric" />

          <Text style={styles.label}>Día de descanso (sin pago)</Text>
          <View style={styles.chipsRow}>
            {NOMBRES_DIAS.map((dia, i) => (
              <TouchableOpacity key={i} style={[styles.chip, diaDescanso === i && styles.chipActivo]} onPress={() => setDiaDescanso(i)}>
                <Text style={[styles.chipText, diaDescanso === i && styles.chipTextActivo]}>{dia}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <PrimaryButton title="Crear vehículo" onPress={manejarCrear} loading={guardando} />
        </Card>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando vehículos: {error}</Text>
      ) : (
        <FlatList
          data={vehiculos}
          keyExtractor={(v) => v.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay vehículos registrados.</Text>}
          renderItem={({ item: v }) => (
            <Card>
              <View style={styles.rowStart}>
                <View style={styles.iconoCircle}>
                  <Ionicons name="car" size={17} color={colors.primary} />
                </View>
                <View>
                  <Text style={typography.h3}>{v.nombre} {v.placa ? `(${v.placa})` : ""}</Text>
                  {v.arrendatario && <Text style={typography.caption}>Conductor: {v.arrendatario}</Text>}
                </View>
              </View>
              <Text style={[typography.body, { marginTop: spacing.sm }]}>
                Cuota diaria: ${Number(v.cuota_diaria).toLocaleString("es-CO")} · Descansa: {NOMBRES_DIAS[v.dia_descanso]}
              </Text>
              <Text style={styles.resumen}>${v.totalRecibidoMes.toLocaleString("es-CO")} de ${v.totalEsperadoMes.toLocaleString("es-CO")} este mes</Text>
              {v.diasEnMora > 0 && (
                <View style={styles.avisoBox}>
                  <Ionicons name="alert-circle" size={14} color={colors.warning} />
                  <Text style={styles.avisoTexto}>{v.diasEnMora} día(s) en mora este mes</Text>
                </View>
              )}

              {!v.yaRegistradoHoy ? (
                <View style={styles.botonesHoy}>
                  <TouchableOpacity style={[styles.miniBoton, styles.botonPagado]} onPress={() => manejarRegistrarHoy(v, true)}>
                    <Ionicons name="checkmark" size={14} color={colors.white} />
                    <Text style={styles.miniBotonTexto}>Pagó hoy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.miniBoton, styles.botonNoPagado]} onPress={() => manejarRegistrarHoy(v, false)}>
                    <Ionicons name="close" size={14} color={colors.white} />
                    <Text style={styles.miniBotonTexto}>No pagó</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.yaRegistrado}>Ya se registró el día de hoy ✓</Text>
              )}
            </Card>
          )}
        />
      )}
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
  resumen: { fontSize: 13, color: colors.primary, fontWeight: "700", marginTop: spacing.sm },
  avisoBox: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs, backgroundColor: "#FCEFD9", padding: spacing.sm, borderRadius: radius.sm },
  avisoTexto: { fontSize: 12, color: colors.warning, fontWeight: "600" },
  botonesHoy: { flexDirection: "row", marginTop: spacing.md, gap: spacing.sm },
  miniBoton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: radius.sm },
  botonPagado: { backgroundColor: colors.success },
  botonNoPagado: { backgroundColor: colors.warning },
  miniBotonTexto: { color: colors.white, fontWeight: "700", fontSize: 12 },
  yaRegistrado: { fontSize: 12, color: colors.primary, marginTop: spacing.md, fontStyle: "italic" },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
});
