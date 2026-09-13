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
  ScrollView,
  Modal,
} from "react-native";
import { usePresupuestosEvento, PresupuestoConItems, ItemPresupuestoRow } from "../../hooks/usePresupuestosEvento";

export default function EventosScreen() {
  const { presupuestos, cargando, error, crearPresupuesto, agregarItem, registrarValorReal } = usePresupuestosEvento();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [eventoAbierto, setEventoAbierto] = useState<string | null>(null);
  const [nombreItem, setNombreItem] = useState("");
  const [valorPlaneadoItem, setValorPlaneadoItem] = useState("");

  const [itemSeleccionado, setItemSeleccionado] = useState<ItemPresupuestoRow | null>(null);
  const [valorRealInput, setValorRealInput] = useState("");

  async function manejarCrearEvento() {
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Escribe el nombre del evento o viaje.");
      return;
    }
    setGuardando(true);
    try {
      const id = await crearPresupuesto(nombre.trim(), new Date().toISOString().slice(0, 10));
      setNombre("");
      setMostrarForm(false);
      setEventoAbierto(id);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo crear el evento.");
    } finally {
      setGuardando(false);
    }
  }

  async function manejarAgregarItem(presupuestoId: string) {
    if (!nombreItem.trim() || !valorPlaneadoItem.trim()) return;
    setGuardando(true);
    try {
      await agregarItem(presupuestoId, nombreItem.trim(), parseFloat(valorPlaneadoItem.replace(/[^0-9.]/g, "")));
      setNombreItem("");
      setValorPlaneadoItem("");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo agregar el ítem.");
    } finally {
      setGuardando(false);
    }
  }

  async function manejarRegistrarReal() {
    if (!itemSeleccionado || !valorRealInput.trim()) return;
    setGuardando(true);
    try {
      await registrarValorReal(itemSeleccionado.id, parseFloat(valorRealInput.replace(/[^0-9.]/g, "")));
      setValorRealInput("");
      setItemSeleccionado(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar el gasto real.");
    } finally {
      setGuardando(false);
    }
  }

  function renderEvento(p: PresupuestoConItems) {
    const abierto = eventoAbierto === p.id;
    return (
      <View style={styles.card}>
        <TouchableOpacity onPress={() => setEventoAbierto(abierto ? null : p.id)}>
          <Text style={styles.nombre}>{p.nombre}</Text>
          <Text style={styles.meta}>
            Planeado: ${p.totalPlaneado.toLocaleString("es-CO")} · Real: ${p.totalReal.toLocaleString("es-CO")}
          </Text>
          <Text style={[styles.diferencia, p.diferencia >= 0 ? styles.positivo : styles.negativo]}>
            {p.diferencia >= 0 ? "Dentro del presupuesto por" : "Excedido por"} ${Math.abs(p.diferencia).toLocaleString("es-CO")}
          </Text>
          <Text style={styles.hint}>{abierto ? "Ocultar ítems ▲" : "Ver ítems ▼"}</Text>
        </TouchableOpacity>

        {abierto && (
          <View style={{ marginTop: 10 }}>
            {p.items.map((it) => (
              <TouchableOpacity key={it.id} style={styles.itemRow} onPress={() => setItemSeleccionado(it)}>
                <Text style={styles.itemNombre}>{it.nombre}</Text>
                <Text style={styles.itemValores}>
                  ${Number(it.valor_planeado).toLocaleString("es-CO")}
                  {it.valor_real != null ? ` → real: $${Number(it.valor_real).toLocaleString("es-CO")}` : " (sin gasto real aún)"}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.nuevoItemRow}>
              <TextInput
                style={[styles.input, { flex: 1.4, marginRight: 6, marginBottom: 0 }]}
                placeholder="Nuevo ítem"
                value={nombreItem}
                onChangeText={setNombreItem}
              />
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 6, marginBottom: 0 }]}
                placeholder="Planeado"
                value={valorPlaneadoItem}
                onChangeText={setValorPlaneadoItem}
                keyboardType="numeric"
              />
              <TouchableOpacity style={styles.miniBoton} onPress={() => manejarAgregarItem(p.id)}>
                <Text style={styles.miniBotonTexto}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Eventos y viajes</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setMostrarForm(!mostrarForm)}>
          <Text style={styles.addButtonText}>{mostrarForm ? "Cancelar" : "+ Nuevo"}</Text>
        </TouchableOpacity>
      </View>

      {mostrarForm && (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Nombre (ej. Vacaciones diciembre)" value={nombre} onChangeText={setNombre} />
          <TouchableOpacity style={styles.saveButton} onPress={manejarCrearEvento} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Crear evento</Text>}
          </TouchableOpacity>
        </View>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando eventos: {error}</Text>
      ) : (
        <FlatList
          data={presupuestos}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay eventos o viajes presupuestados.</Text>}
          renderItem={({ item: p }) => renderEvento(p)}
        />
      )}

      <Modal visible={!!itemSeleccionado} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={styles.title}>Gasto real: {itemSeleccionado?.nombre}</Text>
            <Text style={styles.meta}>Planeado: ${Number(itemSeleccionado?.valor_planeado).toLocaleString("es-CO")}</Text>
            <TextInput style={styles.input} placeholder="Valor real gastado" value={valorRealInput} onChangeText={setValorRealInput} keyboardType="numeric" />
            <TouchableOpacity style={styles.saveButton} onPress={manejarRegistrarReal} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Guardar</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setItemSeleccionado(null)} style={{ marginTop: 12 }}>
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
  input: { backgroundColor: "#F5F5F5", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, fontSize: 14 },
  saveButton: { backgroundColor: "#144B3F", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  saveButtonText: { color: "#fff", fontWeight: "bold" },
  card: { backgroundColor: "#F7F9F8", borderRadius: 12, padding: 14, marginBottom: 12 },
  nombre: { fontSize: 15, fontWeight: "bold", color: "#1A1A1A" },
  meta: { fontSize: 12, color: "#5B5B5B", marginTop: 4 },
  diferencia: { fontSize: 13, fontWeight: "bold", marginTop: 4 },
  positivo: { color: "#1F6F5C" },
  negativo: { color: "#B5651D" },
  hint: { fontSize: 11, color: "#AAA", marginTop: 6 },
  itemRow: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#EEE" },
  itemNombre: { fontSize: 13, fontWeight: "600", color: "#333" },
  itemValores: { fontSize: 12, color: "#5B5B5B" },
  nuevoItemRow: { flexDirection: "row", marginTop: 8, alignItems: "center" },
  miniBoton: { backgroundColor: "#1F6F5C", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  miniBotonTexto: { color: "#fff", fontWeight: "bold" },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  errorText: { color: "red", padding: 16 },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  modalCaja: { backgroundColor: "#fff", borderRadius: 12, padding: 20 },
});
