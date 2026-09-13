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
} from "react-native";
import { useNomina, NuevaDeduccion } from "../../hooks/useNomina";

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function IngresosScreen() {
  const { nominas, cargando, error, crearNomina } = useNomina();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mes, setMes] = useState(mesActual());
  const [sueldoBruto, setSueldoBruto] = useState("");
  const [deducciones, setDeducciones] = useState<NuevaDeduccion[]>([{ nombre: "Salud", monto: 0 }]);
  const [guardando, setGuardando] = useState(false);

  function actualizarDeduccion(index: number, campo: "nombre" | "monto", valor: string) {
    const copia = [...deducciones];
    if (campo === "nombre") copia[index].nombre = valor;
    else copia[index].monto = parseFloat(valor.replace(/[^0-9.]/g, "")) || 0;
    setDeducciones(copia);
  }

  function agregarFilaDeduccion() {
    setDeducciones([...deducciones, { nombre: "", monto: 0 }]);
  }

  function quitarFilaDeduccion(index: number) {
    setDeducciones(deducciones.filter((_, i) => i !== index));
  }

  async function manejarGuardar() {
    if (!sueldoBruto.trim()) {
      Alert.alert("Falta el sueldo bruto", "Escribe el valor antes de guardar.");
      return;
    }
    setGuardando(true);
    try {
      const deduccionesValidas = deducciones.filter((d) => d.nombre.trim() && d.monto > 0);
      await crearNomina(mes, parseFloat(sueldoBruto.replace(/[^0-9.]/g, "")), deduccionesValidas);
      setSueldoBruto("");
      setDeducciones([{ nombre: "Salud", monto: 0 }]);
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar la nómina.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ingresos y nómina</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setMostrarForm(!mostrarForm)}>
          <Text style={styles.addButtonText}>{mostrarForm ? "Cancelar" : "+ Registrar mes"}</Text>
        </TouchableOpacity>
      </View>

      {mostrarForm && (
        <ScrollView style={styles.form}>
          <TextInput style={styles.input} placeholder="Mes (AAAA-MM)" value={mes} onChangeText={setMes} />
          <TextInput style={styles.input} placeholder="Sueldo bruto" value={sueldoBruto} onChangeText={setSueldoBruto} keyboardType="numeric" />

          <Text style={styles.label}>Deducciones</Text>
          {deducciones.map((d, i) => (
            <View key={i} style={styles.deduccionRow}>
              <TextInput
                style={[styles.input, { flex: 1.4, marginRight: 6, marginBottom: 0 }]}
                placeholder="Nombre (ej. Pensión)"
                value={d.nombre}
                onChangeText={(v) => actualizarDeduccion(i, "nombre", v)}
              />
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 6, marginBottom: 0 }]}
                placeholder="Monto"
                value={d.monto ? String(d.monto) : ""}
                onChangeText={(v) => actualizarDeduccion(i, "monto", v)}
                keyboardType="numeric"
              />
              <TouchableOpacity onPress={() => quitarFilaDeduccion(i)}>
                <Text style={{ color: "#B5651D", fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={agregarFilaDeduccion} style={{ marginBottom: 12 }}>
            <Text style={{ color: "#1F6F5C", fontWeight: "600" }}>+ Agregar otra deducción</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.saveButton} onPress={manejarGuardar} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Guardar nómina del mes</Text>}
          </TouchableOpacity>
        </ScrollView>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando nómina: {error}</Text>
      ) : (
        <FlatList
          data={nominas}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay meses registrados.</Text>}
          renderItem={({ item: n }) => (
            <View style={styles.card}>
              <Text style={styles.nombre}>
                {n.mes} · {n.usuario_nombre}
              </Text>
              <Text style={styles.linea}>Bruto: ${Number(n.sueldo_bruto).toLocaleString("es-CO")}</Text>
              <Text style={styles.linea}>Deducciones: -${n.totalDeducciones.toLocaleString("es-CO")}</Text>
              <Text style={styles.neto}>Neto disponible: ${n.netoCalculado.toLocaleString("es-CO")}</Text>
              {n.deducciones.length > 0 && (
                <View style={{ marginTop: 6 }}>
                  {n.deducciones.map((d) => (
                    <Text key={d.id} style={styles.detalle}>
                      · {d.nombre}: ${Number(d.monto).toLocaleString("es-CO")}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  title: { fontSize: 18, fontWeight: "bold", color: "#1A1A1A" },
  addButton: { backgroundColor: "#1F6F5C", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  form: { paddingHorizontal: 16, paddingBottom: 16, maxHeight: 420, borderBottomWidth: 1, borderBottomColor: "#EEE" },
  input: { backgroundColor: "#F5F5F5", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, fontSize: 15 },
  label: { fontSize: 13, color: "#5B5B5B", marginBottom: 6, fontWeight: "600" },
  deduccionRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  saveButton: { backgroundColor: "#144B3F", borderRadius: 8, paddingVertical: 12, alignItems: "center", marginBottom: 8 },
  saveButtonText: { color: "#fff", fontWeight: "bold" },
  card: { backgroundColor: "#F7F9F8", borderRadius: 12, padding: 14, marginBottom: 12 },
  nombre: { fontSize: 15, fontWeight: "bold", color: "#1A1A1A", marginBottom: 6 },
  linea: { fontSize: 13, color: "#5B5B5B" },
  neto: { fontSize: 15, fontWeight: "bold", color: "#1F6F5C", marginTop: 6 },
  detalle: { fontSize: 12, color: "#888" },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  errorText: { color: "red", padding: 16 },
});
