import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Alert,
} from "react-native";
import { useGastos, GastoRow } from "../../hooks/useGastos";

const RUBROS = ["Mercado", "Servicios", "Salidas y Eventos", "Salud", "Gastos Fijos", "Otro"];

export default function GastosScreen() {
  const { gastos, cargando, error, agregarGasto, borrarGasto } = useGastos();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [item, setItem] = useState("");
  const [valor, setValor] = useState("");
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
        fecha: new Date().toISOString().slice(0, 10),
        item: item.trim(),
        valor: parseFloat(valor.replace(/[^0-9.]/g, "")),
        rubro,
        esCompartido,
        nota: nota.trim() || undefined,
      });
      setItem("");
      setValor("");
      setNota("");
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Gastos</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setMostrarForm(!mostrarForm)}>
          <Text style={styles.addButtonText}>{mostrarForm ? "Cancelar" : "+ Nuevo"}</Text>
        </TouchableOpacity>
      </View>

      {mostrarForm && (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="¿Qué fue el gasto?" value={item} onChangeText={setItem} />
          <TextInput style={styles.input} placeholder="Valor (ej. 45000)" value={valor} onChangeText={setValor} keyboardType="numeric" />

          <Text style={styles.label}>Rubro</Text>
          <View style={styles.rubrosRow}>
            {RUBROS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.rubroChip, rubro === r && styles.rubroChipActivo]}
                onPress={() => setRubro(r)}
              >
                <Text style={[styles.rubroChipText, rubro === r && styles.rubroChipTextActivo]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.label}>¿Se divide entre los dos?</Text>
            <Switch value={esCompartido} onValueChange={setEsCompartido} />
          </View>

          <TextInput style={styles.input} placeholder="Nota (opcional)" value={nota} onChangeText={setNota} />

          <TouchableOpacity style={styles.saveButton} onPress={manejarGuardar} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Guardar gasto</Text>}
          </TouchableOpacity>
        </View>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando gastos: {error}</Text>
      ) : (
        <FlatList
          data={gastos}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay gastos registrados.</Text>}
          renderItem={({ item: g }) => (
            <TouchableOpacity style={styles.gastoRow} onLongPress={() => confirmarBorrado(g)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.gastoItem}>{g.item}</Text>
                <Text style={styles.gastoMeta}>
                  {g.rubro} · {g.fecha} {g.usuario_pago_nombre ? `· pagó ${g.usuario_pago_nombre}` : ""}
                </Text>
                {g.nota && <Text style={styles.gastoNota}>{g.nota}</Text>}
              </View>
              <Text style={styles.gastoValor}>${Number(g.valor).toLocaleString("es-CO")}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  title: { fontSize: 22, fontWeight: "bold", color: "#1A1A1A" },
  addButton: { backgroundColor: "#1F6F5C", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: "#fff", fontWeight: "bold" },
  form: { paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#EEE" },
  input: { backgroundColor: "#F5F5F5", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, fontSize: 15 },
  label: { fontSize: 13, color: "#5B5B5B", marginBottom: 6 },
  rubrosRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  rubroChip: { borderWidth: 1, borderColor: "#1F6F5C", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6 },
  rubroChipActivo: { backgroundColor: "#1F6F5C" },
  rubroChipText: { color: "#1F6F5C", fontSize: 12 },
  rubroChipTextActivo: { color: "#fff" },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  saveButton: { backgroundColor: "#144B3F", borderRadius: 8, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  saveButtonText: { color: "#fff", fontWeight: "bold" },
  gastoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  gastoItem: { fontSize: 15, fontWeight: "600", color: "#1A1A1A" },
  gastoMeta: { fontSize: 12, color: "#5B5B5B", marginTop: 2 },
  gastoNota: { fontSize: 12, color: "#888", marginTop: 2, fontStyle: "italic" },
  gastoValor: { fontSize: 15, fontWeight: "bold", color: "#1F6F5C" },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  errorText: { color: "red", padding: 16 },
});
