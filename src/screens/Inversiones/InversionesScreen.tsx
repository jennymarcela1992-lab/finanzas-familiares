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
import { useInversiones, InversionConIndicadores } from "../../hooks/useInversiones";

export default function InversionesScreen() {
  const { inversiones, cargando, error, crearInversion, agregarMovimiento } = useInversiones();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("");
  const [inversionInicial, setInversionInicial] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [invSeleccionada, setInvSeleccionada] = useState<InversionConIndicadores | null>(null);
  const [tipoMovimiento, setTipoMovimiento] = useState<"ingreso" | "egreso">("ingreso");
  const [montoMovimiento, setMontoMovimiento] = useState("");
  const [conceptoMovimiento, setConceptoMovimiento] = useState("");

  async function manejarCrear() {
    if (!nombre.trim() || !inversionInicial.trim()) {
      Alert.alert("Faltan datos", "Escribe al menos el nombre y la inversión inicial.");
      return;
    }
    setGuardando(true);
    try {
      await crearInversion({
        nombre: nombre.trim(),
        tipo: tipo.trim() || undefined,
        inversionInicial: parseFloat(inversionInicial.replace(/[^0-9.]/g, "")),
      });
      setNombre("");
      setTipo("");
      setInversionInicial("");
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo crear la inversión.");
    } finally {
      setGuardando(false);
    }
  }

  async function manejarAgregarMovimiento() {
    if (!invSeleccionada || !montoMovimiento.trim()) return;
    setGuardando(true);
    try {
      await agregarMovimiento(invSeleccionada.id, tipoMovimiento, parseFloat(montoMovimiento.replace(/[^0-9.]/g, "")), conceptoMovimiento.trim() || undefined);
      setMontoMovimiento("");
      setConceptoMovimiento("");
      setInvSeleccionada(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el movimiento.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inversiones</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setMostrarForm(!mostrarForm)}>
          <Text style={styles.addButtonText}>{mostrarForm ? "Cancelar" : "+ Nueva"}</Text>
        </TouchableOpacity>
      </View>

      {mostrarForm && (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Nombre del proyecto" value={nombre} onChangeText={setNombre} />
          <TextInput style={styles.input} placeholder="Tipo (ej. negocio, inversión pasiva)" value={tipo} onChangeText={setTipo} />
          <TextInput style={styles.input} placeholder="Inversión inicial" value={inversionInicial} onChangeText={setInversionInicial} keyboardType="numeric" />
          <TouchableOpacity style={styles.saveButton} onPress={manejarCrear} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Crear proyecto</Text>}
          </TouchableOpacity>
        </View>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando inversiones: {error}</Text>
      ) : (
        <FlatList
          data={inversiones}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay proyectos de inversión.</Text>}
          renderItem={({ item: inv }) => (
            <TouchableOpacity style={styles.card} onPress={() => setInvSeleccionada(inv)}>
              <Text style={styles.nombre}>{inv.nombre}</Text>
              {inv.tipo && <Text style={styles.meta}>{inv.tipo}</Text>}
              <Text style={styles.meta}>Inversión inicial: ${Number(inv.inversion_inicial).toLocaleString("es-CO")}</Text>
              <View style={styles.indicadoresRow}>
                <Text style={styles.indicador}>ROI: {inv.roi.toFixed(1)}%</Text>
                <Text style={styles.indicador}>Margen: {inv.margenNeto.toFixed(1)}%</Text>
              </View>
              <Text style={[styles.utilidad, inv.utilidadNeta >= 0 ? styles.positivo : styles.negativo]}>
                Utilidad neta: ${inv.utilidadNeta.toLocaleString("es-CO")}
              </Text>
              <Text style={styles.hint}>Toca para registrar un ingreso o egreso</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!invSeleccionada} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={styles.title}>Movimiento: {invSeleccionada?.nombre}</Text>
            <View style={styles.rubrosRow}>
              <TouchableOpacity
                style={[styles.chip, tipoMovimiento === "ingreso" && styles.chipActivo]}
                onPress={() => setTipoMovimiento("ingreso")}
              >
                <Text style={[styles.chipText, tipoMovimiento === "ingreso" && styles.chipTextActivo]}>Ingreso</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, tipoMovimiento === "egreso" && styles.chipActivo]}
                onPress={() => setTipoMovimiento("egreso")}
              >
                <Text style={[styles.chipText, tipoMovimiento === "egreso" && styles.chipTextActivo]}>Egreso</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder="Monto" value={montoMovimiento} onChangeText={setMontoMovimiento} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder="Concepto (opcional)" value={conceptoMovimiento} onChangeText={setConceptoMovimiento} />
            <TouchableOpacity style={styles.saveButton} onPress={manejarAgregarMovimiento} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Guardar</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setInvSeleccionada(null)} style={{ marginTop: 12 }}>
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
  title: { fontSize: 17, fontWeight: "bold", color: "#1A1A1A" },
  addButton: { backgroundColor: "#1F6F5C", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  form: { paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#EEE" },
  input: { backgroundColor: "#F5F5F5", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, fontSize: 15 },
  saveButton: { backgroundColor: "#144B3F", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  saveButtonText: { color: "#fff", fontWeight: "bold" },
  card: { backgroundColor: "#F7F9F8", borderRadius: 12, padding: 14, marginBottom: 12 },
  nombre: { fontSize: 15, fontWeight: "bold", color: "#1A1A1A" },
  meta: { fontSize: 12, color: "#5B5B5B", marginTop: 2 },
  indicadoresRow: { flexDirection: "row", marginTop: 8 },
  indicador: { fontSize: 12, color: "#1F6F5C", fontWeight: "600", marginRight: 16 },
  utilidad: { fontSize: 14, fontWeight: "bold", marginTop: 4 },
  positivo: { color: "#1F6F5C" },
  negativo: { color: "#B5651D" },
  hint: { fontSize: 11, color: "#AAA", marginTop: 6 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  errorText: { color: "red", padding: 16 },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  modalCaja: { backgroundColor: "#fff", borderRadius: 12, padding: 20 },
  rubrosRow: { flexDirection: "row", marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: "#1F6F5C", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8 },
  chipActivo: { backgroundColor: "#1F6F5C" },
  chipText: { color: "#1F6F5C", fontSize: 13 },
  chipTextActivo: { color: "#fff" },
});
