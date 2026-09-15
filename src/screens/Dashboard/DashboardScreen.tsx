import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, Modal, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useCierreMensual } from "../../hooks/useCierreMensual";
import { useAhorros } from "../../hooks/useAhorros";
import { useAuth } from "../../hooks/useAuth";
import { useResumenGastos } from "../../hooks/useResumenGastos";
import { useDeudas } from "../../hooks/useDeudas";
import { usePropiedades } from "../../hooks/usePropiedades";
import { useVehiculos } from "../../hooks/useVehiculos";
import { generarBackupJSON } from "../../utils/backup";
import Card from "../../components/Card";
import BarChart from "../../components/BarChart";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";

export default function DashboardScreen() {
  const { resumen, cargando, error, definirAporte, enviarExcedenteAAhorro } = useCierreMensual();
  const { metas } = useAhorros();
  const { usuario } = useAuth();
  const { porRubro, porPersona } = useResumenGastos();
  const { deudas } = useDeudas();
  const { propiedades } = usePropiedades();
  const { vehiculos } = useVehiculos();
  const [exportando, setExportando] = useState(false);

  function diasHasta(fecha: string) {
    return Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000);
  }
  function mesActualStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  const alertas: { texto: string; icono: keyof typeof Ionicons.glyphMap }[] = [];
  deudas.forEach((d) => {
    if (d.proximaCuota && diasHasta(d.proximaCuota.fecha_vencimiento) <= d.dias_aviso_previo) {
      alertas.push({
        icono: "card",
        texto: `"${d.nombre}": cuota de $${Number(d.proximaCuota.cuota_total).toLocaleString("es-CO")} vence en ${diasHasta(d.proximaCuota.fecha_vencimiento)} día(s)${d.entidad_pago ? ` · ${d.entidad_pago}` : ""}`,
      });
    }
  });
  propiedades.forEach((p) => {
    const yaRecibido = p.arriendos.some((a) => a.mes === mesActualStr());
    if (!yaRecibido) alertas.push({ icono: "business", texto: `Arriendo de "${p.nombre}" no registrado este mes` });
  });
  vehiculos.forEach((v) => {
    if (v.diasEnMora > 0) alertas.push({ icono: "car", texto: `"${v.nombre}": ${v.diasEnMora} día(s) en mora este mes` });
  });

  async function manejarExportarBackup() {
    setExportando(true);
    try {
      const json = await generarBackupJSON();
      const nombreArchivo = `backup_finanzas_${new Date().toISOString().slice(0, 10)}.json`;

      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.download = nombreArchivo;
        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);
        URL.revokeObjectURL(url);
      } else {
        const ruta = FileSystem.documentDirectory + nombreArchivo;
        await FileSystem.writeAsStringAsync(ruta, json, { encoding: FileSystem.EncodingType.UTF8 });
        const disponible = await Sharing.isAvailableAsync();
        if (disponible) await Sharing.shareAsync(ruta, { mimeType: "application/json", dialogTitle: "Backup completo" });
        else Alert.alert("Backup guardado", `Se guardó en: ${ruta}`);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo generar el backup.");
    } finally {
      setExportando(false);
    }
  }

  const [editandoAporte, setEditandoAporte] = useState<string | null>(null);
  const [nuevoAporte, setNuevoAporte] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [mostrarEnviarExcedente, setMostrarEnviarExcedente] = useState(false);
  const [metaElegida, setMetaElegida] = useState<string | null>(null);
  const [montoExcedente, setMontoExcedente] = useState("");

  async function manejarGuardarAporte(nombrePersona: string) {
    if (!nuevoAporte.trim()) return;
    setGuardando(true);
    try {
      const esUsuarioActual = usuario?.user_metadata?.nombre === nombrePersona || usuario?.email === nombrePersona;
      await definirAporte(nombrePersona, parseFloat(nuevoAporte.replace(/[^0-9.]/g, "")), esUsuarioActual ? usuario?.id : undefined);
      setEditandoAporte(null);
      setNuevoAporte("");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar el aporte.");
    } finally {
      setGuardando(false);
    }
  }

  async function manejarEnviarExcedente() {
    if (!metaElegida || !montoExcedente.trim()) {
      Alert.alert("Faltan datos", "Elige una meta y el monto a enviar.");
      return;
    }
    setGuardando(true);
    try {
      await enviarExcedenteAAhorro(metaElegida, parseFloat(montoExcedente.replace(/[^0-9.]/g, "")));
      setMostrarEnviarExcedente(false);
      setMontoExcedente("");
      setMetaElegida(null);
      Alert.alert("Listo", "El excedente quedó registrado en tu meta de ahorro.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo enviar el excedente.");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />;
  if (error) return <Text style={styles.errorText}>Error cargando el resumen: {error}</Text>;
  if (!resumen) return null;

  const excedentePositivo = resumen.excedente >= 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={typography.h1}>Resumen del hogar</Text>
      <Text style={[typography.caption, { marginBottom: spacing.lg }]}>{resumen.mes}</Text>

      {resumen.personas.length === 0 && (
        <Card>
          <Text style={typography.body}>
            Todavía no hay aportes definidos ni gastos compartidos este mes. Registra gastos en la pestaña Gastos, o define un aporte abajo.
          </Text>
        </Card>
      )}

      {resumen.personas.map((p) => (
        <Card key={p.usuarioNombre}>
          <View style={styles.rowBetween}>
            <View style={styles.avatarRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{p.usuarioNombre.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={typography.h3}>{p.usuarioNombre}</Text>
            </View>
            <View style={[styles.pill, p.saldo >= 0 ? styles.pillWarning : styles.pillSuccess]}>
              <Text style={[styles.pillText, p.saldo >= 0 ? styles.pillTextWarning : styles.pillTextSuccess]}>
                {p.saldo >= 0 ? `Debe $${p.saldo.toLocaleString("es-CO")}` : `+$${Math.abs(p.saldo).toLocaleString("es-CO")}`}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.rowBetween}>
            <Text style={typography.body}>Aporte comprometido</Text>
            <Text style={typography.h3}>${p.aporte.toLocaleString("es-CO")}</Text>
          </View>
          <View style={[styles.rowBetween, { marginTop: 4 }]}>
            <Text style={typography.body}>Pagado realmente</Text>
            <Text style={typography.h3}>${p.pagado.toLocaleString("es-CO")}</Text>
          </View>

          {editandoAporte === p.usuarioNombre ? (
            <View style={styles.editRow}>
              <TextInput
                style={styles.editInput}
                placeholder="Nuevo aporte"
                value={nuevoAporte}
                onChangeText={setNuevoAporte}
                keyboardType="numeric"
                autoFocus
              />
              <TouchableOpacity style={styles.editSaveBtn} onPress={() => manejarGuardarAporte(p.usuarioNombre)} disabled={guardando}>
                <Ionicons name="checkmark" size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setEditandoAporte(p.usuarioNombre)} style={styles.editLinkRow}>
              <Ionicons name="pencil" size={13} color={colors.primary} />
              <Text style={styles.editLink}>Ajustar aporte de este mes</Text>
            </TouchableOpacity>
          )}
        </Card>
      ))}

      {alertas.length > 0 && (
        <Card>
          <Text style={typography.h3}>Alertas</Text>
          <View style={{ marginTop: spacing.sm }}>
            {alertas.map((a, i) => (
              <View key={i} style={styles.alertaFila}>
                <Ionicons name={a.icono} size={15} color={colors.warning} />
                <Text style={styles.alertaTexto}>{a.texto}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      <Card>
        <Text style={typography.h3}>Gastos por rubro este mes</Text>
        <View style={{ marginTop: spacing.md }}>
          <BarChart data={porRubro} />
        </View>
      </Card>

      <Card>
        <Text style={typography.h3}>Gastos por persona este mes</Text>
        <View style={{ marginTop: spacing.md }}>
          <BarChart data={porPersona} colorBarra={colors.accent} />
        </View>
      </Card>

      <Card style={{ backgroundColor: colors.primary }}>
        <Text style={[typography.h3, { color: colors.white }]}>Total del hogar</Text>
        <View style={styles.divider} />
        <View style={styles.rowBetween}>
          <Text style={styles.totalLabel}>Aportes comprometidos</Text>
          <Text style={styles.totalValue}>${resumen.totalAportes.toLocaleString("es-CO")}</Text>
        </View>
        <View style={[styles.rowBetween, { marginTop: 4 }]}>
          <Text style={styles.totalLabel}>Total pagado</Text>
          <Text style={styles.totalValue}>${resumen.totalPagado.toLocaleString("es-CO")}</Text>
        </View>

        <View style={styles.excedenteBox}>
          <Ionicons name={excedentePositivo ? "trending-up" : "trending-down"} size={20} color={colors.white} />
          <Text style={styles.excedenteText}>
            {excedentePositivo ? "Excedente" : "Faltante"}: ${Math.abs(resumen.excedente).toLocaleString("es-CO")}
          </Text>
        </View>

        {resumen.excedente > 0 && (
          <PrimaryButton
            title="Enviar excedente a ahorro"
            onPress={() => setMostrarEnviarExcedente(true)}
            variant="secondary"
            style={{ marginTop: spacing.md }}
          />
        )}
      </Card>

      <TouchableOpacity onPress={manejarExportarBackup} style={styles.backupBoton} disabled={exportando}>
        {exportando ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Ionicons name="cloud-download-outline" size={16} color={colors.primary} />
            <Text style={styles.backupTexto}>Exportar todos mis datos (backup)</Text>
          </>
        )}
      </TouchableOpacity>

      <Modal visible={mostrarEnviarExcedente} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={typography.h2}>Enviar excedente</Text>
            <Text style={[typography.body, { marginBottom: spacing.md }]}>Disponible: ${resumen.excedente.toLocaleString("es-CO")}</Text>

            <Text style={styles.label}>Elige la meta</Text>
            <View style={styles.chipsRow}>
              {metas.map((m) => (
                <TouchableOpacity key={m.id} style={[styles.chip, metaElegida === m.id && styles.chipActivo]} onPress={() => setMetaElegida(m.id)}>
                  <Text style={[styles.chipText, metaElegida === m.id && styles.chipTextActivo]}>{m.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {metas.length === 0 && <Text style={typography.caption}>Primero crea una meta en la pestaña Ahorros.</Text>}

            <TextInput style={styles.input} placeholder="Monto a enviar" value={montoExcedente} onChangeText={setMontoExcedente} keyboardType="numeric" />
            <PrimaryButton title="Confirmar envío" onPress={manejarEnviarExcedente} loading={guardando} />
            <TouchableOpacity onPress={() => setMostrarEnviarExcedente(false)} style={{ marginTop: spacing.md }}>
              <Text style={{ textAlign: "center", color: colors.textSecondary }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontWeight: "800" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillWarning: { backgroundColor: "#FCEFD9" },
  pillSuccess: { backgroundColor: colors.primaryLight },
  pillText: { fontSize: 11, fontWeight: "700" },
  pillTextWarning: { color: colors.warning },
  pillTextSuccess: { color: colors.success },
  editRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.md, gap: 8 },
  editInput: { flex: 1, backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  editSaveBtn: { backgroundColor: colors.primary, padding: 9, borderRadius: radius.sm },
  editLinkRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.md },
  editLink: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  totalLabel: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  totalValue: { color: colors.white, fontWeight: "700", fontSize: 14 },
  excedenteBox: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md, backgroundColor: "rgba(255,255,255,0.12)", padding: spacing.sm, borderRadius: radius.sm },
  excedenteText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  errorText: { color: colors.danger, padding: spacing.lg },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.xl },
  modalCaja: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  label: { ...typography.caption, marginBottom: spacing.sm },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, marginBottom: 6 },
  chipActivo: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  chipTextActivo: { color: colors.white },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.md, fontSize: 15 },
  alertaFila: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: spacing.sm },
  alertaTexto: { fontSize: 12, color: colors.textSecondary, flex: 1, lineHeight: 17 },
  backupBoton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.xl },
  backupTexto: { fontSize: 13, color: colors.primary, fontWeight: "600" },
});
