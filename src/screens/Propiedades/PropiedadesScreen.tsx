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
import { usePropiedades, PropiedadConDetalle } from "../../hooks/usePropiedades";
import { useDeudas } from "../../hooks/useDeudas";

export default function PropiedadesScreen() {
  const { propiedades, cargando, error, crearPropiedad, registrarArriendoRecibido } = usePropiedades();
  const { deudas } = useDeudas(); // para elegir el crédito asociado

  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [arrendatario, setArrendatario] = useState("");
  const [valorArriendo, setValorArriendo] = useState("");
  const [creditoId, setCreditoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [propSeleccionada, setPropSeleccionada] = useState<PropiedadConDetalle | null>(null);
  const [montoArriendo, setMontoArriendo] = useState("");

  async function manejarCrear() {
    if (!nombre.trim() || !valorArriendo.trim()) {
      Alert.alert("Faltan datos", "Escribe al menos el nombre y el valor del arriendo.");
      return;
    }
    setGuardando(true);
    try {
      await crearPropiedad({
        nombre: nombre.trim(),
        direccion: direccion.trim() || undefined,
        arrendatario: arrendatario.trim() || undefined,
        valorArriendo: parseFloat(valorArriendo.replace(/[^0-9.]/g, "")),
        creditoId: creditoId ?? undefined,
      });
      setNombre("");
      setDireccion("");
      setArrendatario("");
      setValorArriendo("");
      setCreditoId(null);
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo crear la propiedad.");
    } finally {
      setGuardando(false);
    }
  }

  async function manejarRegistrarArriendo() {
    if (!propSeleccionada || !montoArriendo.trim()) return;
    setGuardando(true);
    try {
      await registrarArriendoRecibido(propSeleccionada.id, parseFloat(montoArriendo.replace(/[^0-9.]/g, "")));
      setMontoArriendo("");
      setPropSeleccionada(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el arriendo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Propiedades en arriendo</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setMostrarForm(!mostrarForm)}>
          <Text style={styles.addButtonText}>{mostrarForm ? "Cancelar" : "+ Nueva"}</Text>
        </TouchableOpacity>
      </View>

      {mostrarForm && (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Nombre/alias (ej. Apto Torre 4)" value={nombre} onChangeText={setNombre} />
          <TextInput style={styles.input} placeholder="Dirección" value={direccion} onChangeText={setDireccion} />
          <TextInput style={styles.input} placeholder="Arrendatario" value={arrendatario} onChangeText={setArrendatario} />
          <TextInput style={styles.input} placeholder="Valor del arriendo mensual" value={valorArriendo} onChangeText={setValorArriendo} keyboardType="numeric" />

          <Text style={styles.label}>Crédito asociado (opcional)</Text>
          <View style={styles.rubrosRow}>
            <TouchableOpacity style={[styles.chip, creditoId === null && styles.chipActivo]} onPress={() => setCreditoId(null)}>
              <Text style={[styles.chipText, creditoId === null && styles.chipTextActivo]}>Ninguno</Text>
            </TouchableOpacity>
            {deudas.map((d) => (
              <TouchableOpacity key={d.id} style={[styles.chip, creditoId === d.id && styles.chipActivo]} onPress={() => setCreditoId(d.id)}>
                <Text style={[styles.chipText, creditoId === d.id && styles.chipTextActivo]}>{d.nombre}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={manejarCrear} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Crear propiedad</Text>}
          </TouchableOpacity>
        </View>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando propiedades: {error}</Text>
      ) : (
        <FlatList
          data={propiedades}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay propiedades registradas.</Text>}
          renderItem={({ item: p }) => (
            <TouchableOpacity style={styles.card} onPress={() => setPropSeleccionada(p)}>
              <Text style={styles.nombre}>{p.nombre}</Text>
              {p.arrendatario && <Text style={styles.meta}>Arrendatario: {p.arrendatario}</Text>}
              <Text style={styles.meta}>Arriendo: ${Number(p.valor_arriendo).toLocaleString("es-CO")}/mes</Text>
              {p.credito && (
                <Text style={styles.aviso}>
                  Crédito "{p.credito.nombre}": ${p.credito.proximaCuotaValor?.toLocaleString("es-CO")} vence {p.credito.proximaCuotaFecha}
                  {p.credito.entidad_pago ? ` · Pagar en ${p.credito.entidad_pago}` : ""}
                </Text>
              )}
              <Text style={styles.neto}>Neto del mes: ${p.netoMesActual.toLocaleString("es-CO")}</Text>
              <Text style={styles.hint}>Toca para registrar el arriendo recibido este mes</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!propSeleccionada} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={styles.title}>Arriendo recibido: {propSeleccionada?.nombre}</Text>
            <TextInput
              style={styles.input}
              placeholder="Monto recibido"
              value={montoArriendo}
              onChangeText={setMontoArriendo}
              keyboardType="numeric"
            />
            <TouchableOpacity style={styles.saveButton} onPress={manejarRegistrarArriendo} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Guardar</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPropSeleccionada(null)} style={{ marginTop: 12 }}>
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
  title: { fontSize: 17, fontWeight: "bold", color: "#1A1A1A", marginBottom: 8 },
  addButton: { backgroundColor: "#1F6F5C", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  form: { paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#EEE" },
  input: { backgroundColor: "#F5F5F5", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, fontSize: 15 },
  label: { fontSize: 13, color: "#5B5B5B", marginBottom: 6 },
  rubrosRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: "#1F6F5C", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6 },
  chipActivo: { backgroundColor: "#1F6F5C" },
  chipText: { color: "#1F6F5C", fontSize: 12 },
  chipTextActivo: { color: "#fff" },
  saveButton: { backgroundColor: "#144B3F", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  saveButtonText: { color: "#fff", fontWeight: "bold" },
  card: { backgroundColor: "#F7F9F8", borderRadius: 12, padding: 14, marginBottom: 12 },
  nombre: { fontSize: 15, fontWeight: "bold", color: "#1A1A1A" },
  meta: { fontSize: 12, color: "#5B5B5B", marginTop: 2 },
  aviso: { fontSize: 12, color: "#B5651D", marginTop: 6, fontWeight: "600" },
  neto: { fontSize: 14, fontWeight: "bold", color: "#1F6F5C", marginTop: 6 },
  hint: { fontSize: 11, color: "#AAA", marginTop: 4 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  errorText: { color: "red", padding: 16 },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  modalCaja: { backgroundColor: "#fff", borderRadius: 12, padding: 20 },
});
