import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { useCierreMensual } from "../../hooks/useCierreMensual";
import { useAhorros } from "../../hooks/useAhorros";
import { useAuth } from "../../hooks/useAuth";

export default function DashboardScreen() {
  const { resumen, cargando, error, definirAporte, enviarExcedenteAAhorro, recargar } = useCierreMensual();
  const { metas } = useAhorros();
  const { usuario } = useAuth();

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

  if (cargando) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (error) return <Text style={styles.errorText}>Error cargando el resumen: {error}</Text>;
  if (!resumen) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Resumen del hogar</Text>
      <Text style={styles.mes}>{resumen.mes}</Text>

      {resumen.personas.length === 0 && (
        <Text style={styles.empty}>
          Todavía no hay aportes definidos ni gastos compartidos este mes. Registra gastos en la pestaña Gastos, o define un aporte abajo.
        </Text>
      )}

      {resumen.personas.map((p) => (
        <View key={p.usuarioNombre} style={styles.personaCard}>
          <Text style={styles.personaNombre}>{p.usuarioNombre}</Text>
          <Text style={styles.linea}>Aporte comprometido: ${p.aporte.toLocaleString("es-CO")}</Text>
          <Text style={styles.linea}>Pagado realmente: ${p.pagado.toLocaleString("es-CO")}</Text>
          <Text style={[styles.saldo, p.saldo >= 0 ? styles.saldoPositivo : styles.saldoNegativo]}>
            {p.saldo >= 0 ? `Debe aportar $${p.saldo.toLocaleString("es-CO")} más` : `Pagó $${Math.abs(p.saldo).toLocaleString("es-CO")} de más`}
          </Text>

          {editandoAporte === p.usuarioNombre ? (
            <View style={styles.editarRow}>
              <TextInput
                style={styles.input}
                placeholder="Nuevo aporte"
                value={nuevoAporte}
                onChangeText={setNuevoAporte}
                keyboardType="numeric"
                autoFocus
              />
              <TouchableOpacity style={styles.miniBoton} onPress={() => manejarGuardarAporte(p.usuarioNombre)} disabled={guardando}>
                <Text style={styles.miniBotonTexto}>Guardar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setEditandoAporte(p.usuarioNombre)}>
              <Text style={styles.editarLink}>Ajustar aporte de este mes</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <View style={styles.totalCard}>
        <Text style={styles.totalTitulo}>Total del hogar</Text>
        <Text style={styles.linea}>Aportes comprometidos: ${resumen.totalAportes.toLocaleString("es-CO")}</Text>
        <Text style={styles.linea}>Total pagado: ${resumen.totalPagado.toLocaleString("es-CO")}</Text>
        <Text style={[styles.excedente, resumen.excedente >= 0 ? styles.saldoPositivo : styles.saldoNegativo]}>
          {resumen.excedente >= 0 ? `Excedente: $${resumen.excedente.toLocaleString("es-CO")}` : `Faltante: $${Math.abs(resumen.excedente).toLocaleString("es-CO")}`}
        </Text>

        {resumen.excedente > 0 && (
          <TouchableOpacity style={styles.saveButton} onPress={() => setMostrarEnviarExcedente(true)}>
            <Text style={styles.saveButtonText}>Enviar excedente a una meta de ahorro</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={mostrarEnviarExcedente} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={styles.title}>Enviar excedente</Text>
            <Text style={styles.linea}>Disponible: ${resumen.excedente.toLocaleString("es-CO")}</Text>

            <Text style={styles.label}>Elige la meta</Text>
            <View style={styles.rubrosRow}>
              {metas.map((m) => (
                <TouchableOpacity key={m.id} style={[styles.chip, metaElegida === m.id && styles.chipActivo]} onPress={() => setMetaElegida(m.id)}>
                  <Text style={[styles.chipText, metaElegida === m.id && styles.chipTextActivo]}>{m.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {metas.length === 0 && <Text style={styles.empty}>Primero crea una meta en la pestaña Ahorros.</Text>}

            <TextInput style={styles.input} placeholder="Monto a enviar" value={montoExcedente} onChangeText={setMontoExcedente} keyboardType="numeric" />
            <TouchableOpacity style={styles.saveButton} onPress={manejarEnviarExcedente} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Confirmar envío</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMostrarEnviarExcedente(false)} style={{ marginTop: 12 }}>
              <Text style={{ textAlign: "center", color: "#5B5B5B" }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "bold", color: "#1A1A1A" },
  mes: { fontSize: 13, color: "#5B5B5B", marginBottom: 16 },
  empty: { textAlign: "center", color: "#888", marginTop: 20, fontSize: 13 },
  personaCard: { backgroundColor: "#F7F9F8", borderRadius: 12, padding: 14, marginBottom: 12 },
  personaNombre: { fontSize: 15, fontWeight: "bold", color: "#1A1A1A", marginBottom: 6 },
  linea: { fontSize: 13, color: "#5B5B5B" },
  saldo: { fontSize: 14, fontWeight: "bold", marginTop: 6 },
  saldoPositivo: { color: "#1F6F5C" },
  saldoNegativo: { color: "#B5651D" },
  editarLink: { color: "#1F6F5C", fontSize: 12, marginTop: 8, fontWeight: "600" },
  editarRow: { flexDirection: "row", marginTop: 8, alignItems: "center" },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#DDD", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10, fontSize: 14, flex: 1, marginRight: 8 },
  miniBoton: { backgroundColor: "#1F6F5C", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8 },
  miniBotonTexto: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  totalCard: { backgroundColor: "#1F6F5C", borderRadius: 12, padding: 16, marginTop: 8 },
  totalTitulo: { fontSize: 15, fontWeight: "bold", color: "#fff", marginBottom: 6 },
  excedente: { fontSize: 16, fontWeight: "bold", marginTop: 8, color: "#fff" },
  saveButton: { backgroundColor: "#144B3F", borderRadius: 8, paddingVertical: 12, alignItems: "center", marginTop: 12 },
  saveButtonText: { color: "#fff", fontWeight: "bold" },
  errorText: { color: "red", padding: 16 },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  modalCaja: { backgroundColor: "#fff", borderRadius: 12, padding: 20 },
  label: { fontSize: 13, color: "#5B5B5B", marginTop: 8, marginBottom: 6 },
  rubrosRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: "#1F6F5C", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6 },
  chipActivo: { backgroundColor: "#1F6F5C" },
  chipText: { color: "#1F6F5C", fontSize: 12 },
  chipTextActivo: { color: "#fff" },
});
