import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Switch, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useGastos, GastoRow } from "../../hooks/useGastos";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";

const RUBROS = ["Mercado", "Servicios", "Salidas y Eventos", "Salud", "Gastos Fijos", "Otro"];
const ICONO_RUBRO: Record<string, keyof typeof Ionicons.glyphMap> = {
  Mercado: "cart",
  Servicios: "flash",
  "Salidas y Eventos": "sparkles",
  Salud: "medkit",
  "Gastos Fijos": "home",
  Otro: "ellipsis-horizontal",
};

export default function GastosScreen() {
  const { gastos, cargando, error, agregarGasto, borrarGasto } = useGastos();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [item, setItem] = useState("");
  const [valor, setValor] = useState("");
  const [fecha, setFecha] = useState(new Date());
  const [mostrarFecha, setMostrarFecha] = useState(false);
  const [rubro, setRubro] = useState(RUBROS[0]);
  const [esCompartido, setEsCompartido] = useState(true);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function manejarGuardar() {
    if (!item.trim() || !valor.trim()) {
      Alert.alert("Faltan datos", "Escribe al menos el nombre del gasto y el valor.");
      return;
    }
    setGuardando(true);
    try {
      await agregarGasto({
        fecha: fecha.toISOString().slice(0, 10),
        item: item.trim(),
        valor: parseFloat(valor.replace(/[^0-9.]/g, "")),
        rubro,
        esCompartido,
        nota: nota.trim() || undefined,
      });
      setItem("");
      setValor("");
      setNota("");
      setFecha(new Date());
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar el gasto.");
    } finally {
      setGuardando(false);
    }
  }

  function confirmarBorrado(g: GastoRow) {
    Alert.alert("Eliminar gasto", `¿Borrar "${g.item}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => borrarGasto(g.id) },
    ]);
  }

  const totalMes = gastos.reduce((s, g) => s + Number(g.valor), 0);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Gastos" subtitle={`$${totalMes.toLocaleString("es-CO")} registrados`} actionLabel="Nuevo" onAction={() => setMostrarForm(!mostrarForm)} actionActive={mostrarForm} />

      {mostrarForm && (
        <Card style={styles.formCard}>
          <TextInput style={styles.input} placeholder="¿Qué fue el gasto?" placeholderTextColor={colors.textMuted} value={item} onChangeText={setItem} />
          <TextInput style={styles.input} placeholder="Valor (ej. 45000)" placeholderTextColor={colors.textMuted} value={valor} onChangeText={setValor} keyboardType="numeric" />

          <TouchableOpacity style={styles.fechaBoton} onPress={() => setMostrarFecha(true)}>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={styles.fechaTexto}>{fecha.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}</Text>
          </TouchableOpacity>
          {mostrarFecha && (
            <DateTimePicker
              value={fecha}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              maximumDate={new Date()}
              onChange={(_event, seleccionada) => {
                setMostrarFecha(Platform.OS === "ios");
                if (seleccionada) setFecha(seleccionada);
              }}
            />
          )}

          <Text style={styles.label}>Rubro</Text>
          <View style={styles.chipsRow}>
            {RUBROS.map((r) => (
              <TouchableOpacity key={r} style={[styles.chip, rubro === r && styles.chipActivo]} onPress={() => setRubro(r)}>
                <Ionicons name={ICONO_RUBRO[r]} size={13} color={rubro === r ? colors.white : colors.primary} />
                <Text style={[styles.chipText, rubro === r && styles.chipTextActivo]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.switchRow}>
            <Text style={typography.body}>¿Se divide entre los dos?</Text>
            <Switch value={esCompartido} onValueChange={setEsCompartido} trackColor={{ true: colors.primary }} />
          </View>

          <TextInput style={styles.input} placeholder="Nota (opcional)" placeholderTextColor={colors.textMuted} value={nota} onChangeText={setNota} />
          <PrimaryButton title="Guardar gasto" onPress={manejarGuardar} loading={guardando} />
        </Card>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando gastos: {error}</Text>
      ) : (
        <FlatList
          data={gastos}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay gastos registrados.</Text>}
          renderItem={({ item: g }) => (
            <TouchableOpacity onLongPress={() => confirmarBorrado(g)} activeOpacity={0.8}>
              <Card style={styles.gastoCard}>
                <View style={styles.iconoRubro}>
                  <Ionicons name={ICONO_RUBRO[g.rubro ?? "Otro"] ?? "pricetag"} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={typography.h3}>{g.item}</Text>
                  <Text style={typography.caption}>
                    {g.rubro} · {g.fecha} {g.usuario_pago_nombre ? `· pagó ${g.usuario_pago_nombre}` : ""}
                  </Text>
                  {g.nota && <Text style={styles.nota}>{g.nota}</Text>}
                </View>
                <Text style={styles.valor}>${Number(g.valor).toLocaleString("es-CO")}</Text>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  formCard: { marginHorizontal: spacing.lg },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  fechaBoton: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm },
  fechaTexto: { fontSize: 14, color: colors.textPrimary, fontWeight: "600" },
  label: { ...typography.caption, marginBottom: spacing.sm },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6, marginBottom: 6 },
  chipActivo: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  chipTextActivo: { color: colors.white },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm, marginTop: 4 },
  gastoCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconoRubro: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  nota: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontStyle: "italic" },
  valor: { fontSize: 15, fontWeight: "800", color: colors.primary },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
});
