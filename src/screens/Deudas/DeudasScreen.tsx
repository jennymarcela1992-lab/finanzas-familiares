import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDeudas, DeudaConCuotas } from "../../hooks/useDeudas";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import ProgressBar from "../../components/ProgressBar";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";

export default function DeudasScreen() {
  const { deudas, cargando, error, crearDeuda, marcarCuotaPagada } = useDeudas();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [deudaAbierta, setDeudaAbierta] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [nombre, setNombre] = useState("");
  const [valorInicial, setValorInicial] = useState("");
  const [tasa, setTasa] = useState("");
  const [plazo, setPlazo] = useState("");
  const [entidadPago, setEntidadPago] = useState("");
  const [numeroCuenta, setNumeroCuenta] = useState("");
  const [aliasPago, setAliasPago] = useState("");

  async function manejarCrear() {
    if (!nombre.trim() || !valorInicial.trim() || !tasa.trim() || !plazo.trim()) {
      Alert.alert("Faltan datos", "Completa al menos nombre, valor, tasa y plazo.");
      return;
    }
    setGuardando(true);
    try {
      await crearDeuda({
        nombre: nombre.trim(),
        valorInicial: parseFloat(valorInicial.replace(/[^0-9.]/g, "")),
        tasaInteresMensual: parseFloat(tasa.replace(/[^0-9.]/g, "")),
        plazoMeses: parseInt(plazo.replace(/[^0-9]/g, ""), 10),
        entidadPago: entidadPago.trim() || undefined,
        numeroCuenta: numeroCuenta.trim() || undefined,
        aliasPago: aliasPago.trim() || undefined,
      });
      setNombre(""); setValorInicial(""); setTasa(""); setPlazo(""); setEntidadPago(""); setNumeroCuenta(""); setAliasPago("");
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo crear la deuda.");
    } finally {
      setGuardando(false);
    }
  }

  function renderDeuda(d: DeudaConCuotas) {
    const abierta = deudaAbierta === d.id;
    return (
      <Card>
        <TouchableOpacity onPress={() => setDeudaAbierta(abierta ? null : d.id)}>
          <View style={styles.rowBetween}>
            <View style={styles.rowStart}>
              <View style={styles.iconoCircle}>
                <Ionicons name="card" size={17} color={colors.primary} />
              </View>
              <Text style={typography.h3}>{d.nombre}</Text>
            </View>
            <Text style={styles.pctText}>{Math.round(d.porcentajePagado * 100)}%</Text>
          </View>
          <View style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
            <ProgressBar progreso={d.porcentajePagado} />
          </View>
          <Text style={typography.caption}>
            {d.cuotasPagadas} de {d.cuotas.length} cuotas pagadas
          </Text>
          {d.proximaCuota && (
            <View style={styles.avisoBox}>
              <Ionicons name="alert-circle" size={14} color={colors.warning} />
              <Text style={styles.avisoTexto}>
                Próxima: ${Number(d.proximaCuota.cuota_total).toLocaleString("es-CO")} vence {d.proximaCuota.fecha_vencimiento}
                {d.entidad_pago ? ` · ${d.entidad_pago}` : ""}
                {d.numero_cuenta ? ` (${d.numero_cuenta})` : ""}
                {d.alias_pago ? ` · ${d.alias_pago}` : ""}
              </Text>
            </View>
          )}
          <Text style={styles.hint}>{abierta ? "Ocultar cuotas ▲" : "Ver todas las cuotas ▼"}</Text>
        </TouchableOpacity>

        {abierta && (
          <ScrollView style={{ maxHeight: 220, marginTop: spacing.sm }}>
            {d.cuotas.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.cuotaRow}
                disabled={c.estado === "pagada"}
                onPress={() =>
                  Alert.alert("Marcar cuota pagada", `¿Confirmar pago de la cuota #${c.numero_cuota}?`, [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Confirmar", onPress: () => marcarCuotaPagada(c.id) },
                  ])
                }
              >
                <Text style={styles.cuotaTexto}>
                  #{c.numero_cuota} · ${Number(c.cuota_total).toLocaleString("es-CO")} · vence {c.fecha_vencimiento}
                </Text>
                <View style={[styles.pill, c.estado === "pagada" ? styles.pillSuccess : styles.pillWarning]}>
                  <Text style={[styles.pillText, c.estado === "pagada" ? styles.pillTextSuccess : styles.pillTextWarning]}>
                    {c.estado === "pagada" ? `✓ ${c.pagada_por ?? "Pagada"}` : "Pendiente"}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Deudas y créditos" subtitle={`${deudas.length} registrada(s)`} actionLabel="Nueva" onAction={() => setMostrarForm(!mostrarForm)} actionActive={mostrarForm} />

      {mostrarForm && (
        <ScrollView style={[styles.form, { marginHorizontal: spacing.lg }]}>
          <Card>
            <TextInput style={styles.input} placeholder="Nombre (ej. Crédito apartamento)" placeholderTextColor={colors.textMuted} value={nombre} onChangeText={setNombre} />
            <TextInput style={styles.input} placeholder="Valor inicial" placeholderTextColor={colors.textMuted} value={valorInicial} onChangeText={setValorInicial} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder="Tasa de interés mensual (ej. 1.2)" placeholderTextColor={colors.textMuted} value={tasa} onChangeText={setTasa} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder="Plazo en meses (ej. 180)" placeholderTextColor={colors.textMuted} value={plazo} onChangeText={setPlazo} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder="Entidad de pago (ej. Bancolombia)" placeholderTextColor={colors.textMuted} value={entidadPago} onChangeText={setEntidadPago} />
            <TextInput style={styles.input} placeholder="Número de cuenta / referencia" placeholderTextColor={colors.textMuted} value={numeroCuenta} onChangeText={setNumeroCuenta} />
            <TextInput style={styles.input} placeholder="Alias de pago (ej. Nequi, PSE)" placeholderTextColor={colors.textMuted} value={aliasPago} onChangeText={setAliasPago} />
            <PrimaryButton title="Crear deuda y generar cuotas" onPress={manejarCrear} loading={guardando} />
          </Card>
        </ScrollView>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando deudas: {error}</Text>
      ) : (
        <FlatList
          data={deudas}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay deudas registradas.</Text>}
          renderItem={({ item: d }) => renderDeuda(d)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  form: { maxHeight: 460 },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowStart: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconoCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  pctText: { ...typography.h3, color: colors.primary },
  avisoBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: spacing.sm, backgroundColor: "#FCEFD9", padding: spacing.sm, borderRadius: radius.sm },
  avisoTexto: { fontSize: 12, color: colors.warning, fontWeight: "600", flex: 1 },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
  cuotaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  cuotaTexto: { fontSize: 12, color: colors.textPrimary, flex: 1 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pillWarning: { backgroundColor: "#FCEFD9" },
  pillSuccess: { backgroundColor: colors.primaryLight },
  pillText: { fontSize: 10, fontWeight: "700" },
  pillTextWarning: { color: colors.warning },
  pillTextSuccess: { color: colors.success },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
});
