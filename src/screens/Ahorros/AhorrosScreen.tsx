import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { useAhorros, MetaAhorro } from "../../hooks/useAhorros";

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
      <View style={styles.header}>
        <Text style={styles.title}>Ahorros</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setMostrarNuevaMeta(!mostrarNuevaMeta)}>
          <Text style={styles.addButtonText}>{mostrarNuevaMeta ? "Cancelar" : "+ Meta"}</Text>
        </TouchableOpacity>
      </View>

      {mostrarNuevaMeta && (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Nombre de la meta (ej. Vacaciones)" value={nombreMeta} onChangeText={setNombreMeta} />
          <TextInput style={styles.input} placeholder="Monto objetivo" value={montoObjetivo} onChangeText={setMontoObjetivo} keyboardType="numeric" />
          <TouchableOpacity style={styles.saveButton} onPress={manejarCrearMeta} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Crear meta</Text>}
          </TouchableOpacity>
        </View>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando ahorros: {error}</Text>
      ) : (
        <FlatList
          data={metas}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay metas de ahorro.</Text>}
          renderItem={({ item: m }) => (
            <TouchableOpacity style={styles.metaCard} onPress={() => setMetaSeleccionada(m)}>
              <Text style={styles.metaNombre}>{m.nombre}</Text>
              <View style={styles.progresoFondo}>
                <View style={[styles.progresoRelleno, { width: `${m.progreso * 100}%` }]} />
              </View>
              <Text style={styles.metaMonto}>
                ${m.totalAportado.toLocaleString("es-CO")} de ${m.monto_objetivo.toLocaleString("es-CO")} ({Math.round(m.progreso * 100)}%)
              </Text>
              <Text style={styles.metaHint}>Toca para agregar un aporte</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!metaSeleccionada} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={styles.title}>Aportar a "{metaSeleccionada?.nombre}"</Text>
            <TextInput style={styles.input} placeholder="Monto" value={montoAporte} onChangeText={setMontoAporte} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder="Nota (ej. Enviado a Nu)" value={notaAporte} onChangeText={setNotaAporte} />
            <TouchableOpacity style={styles.saveButton} onPress={manejarAgregarAporte} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Guardar aporte</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMetaSeleccionada(null)} style={{ marginTop: 12 }}>
              <Text style={{ textAlign: "center", color: "#5B5B5B" }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  title: { fontSize: 20, fontWeight: "bold", color: "#1A1A1A", marginBottom: 12 },
  addButton: { backgroundColor: "#1F6F5C", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: "#fff", fontWeight: "bold" },
  form: { paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#EEE" },
  input: { backgroundColor: "#F5F5F5", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, fontSize: 15 },
  saveButton: { backgroundColor: "#144B3F", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  saveButtonText: { color: "#fff", fontWeight: "bold" },
  metaCard: { backgroundColor: "#F7F9F8", borderRadius: 12, padding: 14, marginBottom: 12 },
  metaNombre: { fontSize: 16, fontWeight: "bold", color: "#1A1A1A", marginBottom: 8 },
  progresoFondo: { height: 10, backgroundColor: "#E0E0E0", borderRadius: 6, overflow: "hidden" },
  progresoRelleno: { height: 10, backgroundColor: "#1F6F5C" },
  metaMonto: { fontSize: 13, color: "#5B5B5B", marginTop: 8 },
  metaHint: { fontSize: 11, color: "#AAA", marginTop: 2 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  errorText: { color: "red", padding: 16 },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  modalCaja: { backgroundColor: "#fff", borderRadius: 12, padding: 20 },
});
