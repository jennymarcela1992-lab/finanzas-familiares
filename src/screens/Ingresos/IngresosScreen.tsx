import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNomina, NuevaDeduccion } from "../../hooks/useNomina";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function IngresosScreen() {
  const { nominas, cargando, error, crearNomina } = useNomina();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mes, setMes] = useState(mesActual());
  const [sueldoBruto, setSueldoBruto] = useState("");
  const [deducciones, setDeducciones] = useState<NuevaDeduccion[]>([{ nombre: "Salud", monto: 0 }]);
  const [guardando, setGuardando] = useState(false);

  function actualizarDeduccion(index: number, campo: "nombre" | "monto", valor: string) {
    const copia = [...deducciones];
    if (campo === "nombre") copia[index].nombre = valor;
    else copia[index].monto = parseFloat(valor.replace(/[^0-9.]/g, "")) || 0;
    setDeducciones(copia);
  }

  async function manejarGuardar() {
    if (!sueldoBruto.trim()) {
      Alert.alert("Falta el sueldo bruto", "Escribe el valor antes de guardar.");
      return;
    }
    setGuardando(true);
    try {
      const deduccionesValidas = deducciones.filter((d) => d.nombre.trim() && d.monto > 0);
      await crearNomina(mes, parseFloat(sueldoBruto.replace(/[^0-9.]/g, "")), deduccionesValidas);
      setSueldoBruto("");
      setDeducciones([{ nombre: "Salud", monto: 0 }]);
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar la nómina.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Ingresos" subtitle="Nómina y deducciones" actionLabel="Registrar mes" onAction={() => setMostrarForm(!mostrarForm)} actionActive={mostrarForm} />

      {mostrarForm && (
        <ScrollView style={{ maxHeight: 460, marginHorizontal: spacing.lg }}>
          <Card>
            <TextInput style={styles.input} placeholder="Mes (AAAA-MM)" placeholderTextColor={colors.textMuted} value={mes} onChangeText={setMes} />
            <TextInput style={styles.input} placeholder="Sueldo bruto" placeholderTextColor={colors.textMuted} value={sueldoBruto} onChangeText={setSueldoBruto} keyboardType="numeric" />

            <Text style={styles.label}>Deducciones</Text>
            {deducciones.map((d, i) => (
              <View key={i} style={styles.deduccionRow}>
                <TextInput style={[styles.input, { flex: 1.4, marginRight: 6, marginBottom: 0 }]} placeholder="Nombre" placeholderTextColor={colors.textMuted} value={d.nombre} onChangeText={(v) => actualizarDeduccion(i, "nombre", v)} />
                <TextInput style={[styles.input, { flex: 1, marginRight: 6, marginBottom: 0 }]} placeholder="Monto" placeholderTextColor={colors.textMuted} value={d.monto ? String(d.monto) : ""} onChangeText={(v) => actualizarDeduccion(i, "monto", v)} keyboardType="numeric" />
                <TouchableOpacity onPress={() => setDeducciones(deducciones.filter((_, idx) => idx !== i))}>
                  <Ionicons name="close-circle" size={22} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={() => setDeducciones([...deducciones, { nombre: "", monto: 0 }])} style={styles.addLinkRow}>
              <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
              <Text style={styles.addLink}>Agregar otra deducción</Text>
            </TouchableOpacity>

            <PrimaryButton title="Guardar nómina del mes" onPress={manejarGuardar} loading={guardando} style={{ marginTop: spacing.sm }} />
          </Card>
        </ScrollView>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando nómina: {error}</Text>
      ) : (
        <FlatList
          data={nominas}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay meses registrados.</Text>}
          renderItem={({ item: n }) => (
            <Card>
              <View style={styles.rowStart}>
                <View style={styles.iconoCircle}>
                  <Ionicons name="cash" size={17} color={colors.primary} />
                </View>
                <Text style={typography.h3}>{n.mes} · {n.usuario_nombre}</Text>
              </View>
              <View style={{ marginTop: spacing.sm }}>
                <Text style={typography.body}>Bruto: ${Number(n.sueldo_bruto).toLocaleString("es-CO")}</Text>
                <Text style={typography.body}>Deducciones: -${n.totalDeducciones.toLocaleString("es-CO")}</Text>
                <Text style={styles.neto}>Neto disponible: ${n.netoCalculado.toLocaleString("es-CO")}</Text>
              </View>
              {n.deducciones.length > 0 && (
                <View style={{ marginTop: spacing.sm }}>
                  {n.deducciones.map((d) => (
                    <Text key={d.id} style={typography.caption}>· {d.nombre}: ${Number(d.monto).toLocaleString("es-CO")}</Text>
                  ))}
                </View>
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
  label: { ...typography.caption, marginBottom: spacing.sm, marginTop: spacing.xs },
  deduccionRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  addLinkRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: spacing.md },
  addLink: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  rowStart: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconoCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  neto: { fontSize: 15, fontWeight: "800", color: colors.primary, marginTop: 4 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
});
