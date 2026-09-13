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
import { usePrestamos, PrestamoConAbonos } from "../../hooks/usePrestamos";

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
      await crearPrestamo({
        quienPresta: quienPresta.trim(),
        quienRecibe: quienRecibe.trim(),
        monto: parseFloat(monto.replace(/[^0-9.]/g, "")),
        motivo: motivo.trim() || undefined,
      });
      setQuienPresta("");
      setQuienRecibe("");
      setMonto("");
      setMotivo("");
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
      <View style={styles.header}>
        <Text style={styles.title}>Préstamos personales</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setMostrarForm(!mostrarForm)}>
          <Text style={styles.addButtonText}>{mostrarForm ? "Cancelar" : "+ Nuevo"}</Text>
        </TouchableOpacity>
      </View>

      {mostrarForm && (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="¿Quién prestó? (ej. Jenny)" value={quienPresta} onChangeText={setQuienPresta} />
          <TextInput style={styles.input} placeholder="¿Quién recibió? (ej. Jhon, o un tercero)" value={quienRecibe} onChangeText={setQuienRecibe} />
          <TextInput style={styles.input} placeholder="Monto" value={monto} onChangeText={setMonto} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Motivo (ej. pago moto)" value={motivo} onChangeText={setMotivo} />
          <TouchableOpacity style={styles.saveButton} onPress={manejarCrear} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Registrar préstamo</Text>}
          </TouchableOpacity>
        </View>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando préstamos: {error}</Text>
      ) : (
        <FlatList
          data={prestamos}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay préstamos registrados.</Text>}
          renderItem={({ item: p }) => (
            <TouchableOpacity style={styles.card} onPress={() => setPrestamoSeleccionado(p)}>
              <Text style={styles.nombre}>
                {p.quien_presta} → {p.quien_recibe}
              </Text>
              {p.motivo && <Text style={styles.motivo}>{p.motivo}</Text>}
              <Text style={styles.saldo}>
                Saldo pendiente: ${p.saldoPendiente.toLocaleString("es-CO")} de ${Number(p.monto).toLocaleString("es-CO")}
              </Text>
              <Text style={styles.hint}>Toca para registrar un abono</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!prestamoSeleccionado} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={styles.title}>
              Abono: {prestamoSeleccionado?.quien_presta} → {prestamoSeleccionado?.quien_recibe}
            </Text>
            <Text style={styles.saldo}>Saldo actual: ${prestamoSeleccionado?.saldoPendiente.toLocaleString("es-CO")}</Text>
            <TextInput style={styles.input} placeholder="Monto del abono" value={montoAbono} onChangeText={setMontoAbono} keyboardType="numeric" />
            <TouchableOpacity style={styles.saveButton} onPress={manejarAbono} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Guardar abono</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPrestamoSeleccionado(null)} style={{ marginTop: 12 }}>
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
  title: { fontSize: 18, fontWeight: "bold", color: "#1A1A1A", marginBottom: 8 },
  addButton: { backgroundColor: "#1F6F5C", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: "#fff", fontWeight: "bold" },
  form: { paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#EEE" },
  input: { backgroundColor: "#F5F5F5", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, fontSize: 15 },
  saveButton: { backgroundColor: "#144B3F", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  saveButtonText: { color: "#fff", fontWeight: "bold" },
  card: { backgroundColor: "#F7F9F8", borderRadius: 12, padding: 14, marginBottom: 12 },
  nombre: { fontSize: 15, fontWeight: "bold", color: "#1A1A1A" },
  motivo: { fontSize: 12, color: "#888", marginTop: 2, fontStyle: "italic" },
  saldo: { fontSize: 13, color: "#1F6F5C", fontWeight: "600", marginTop: 6 },
  hint: { fontSize: 11, color: "#AAA", marginTop: 4 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  errorText: { color: "red", padding: 16 },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  modalCaja: { backgroundColor: "#fff", borderRadius: 12, padding: 20 },
});
