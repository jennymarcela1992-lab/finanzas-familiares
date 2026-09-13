import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useVehiculos, VehiculoConResumen } from "../../hooks/useVehiculos";

const NOMBRES_DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function VehiculoScreen() {
  const { vehiculos, cargando, error, crearVehiculo, registrarPagoHoy } = useVehiculos();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [placa, setPlaca] = useState("");
  const [arrendatario, setArrendatario] = useState("");
  const [cuotaDiaria, setCuotaDiaria] = useState("");
  const [diaDescanso, setDiaDescanso] = useState(0);
  const [guardando, setGuardando] = useState(false);

  async function manejarCrear() {
    if (!nombre.trim() || !cuotaDiaria.trim()) {
      Alert.alert("Faltan datos", "Escribe al menos el nombre y la cuota diaria.");
      return;
    }
    setGuardando(true);
    try {
      await crearVehiculo({
        nombre: nombre.trim(),
        placa: placa.trim() || undefined,
        arrendatario: arrendatario.trim() || undefined,
        cuotaDiaria: parseFloat(cuotaDiaria.replace(/[^0-9.]/g, "")),
        diaDescanso,
      });
      setNombre("");
      setPlaca("");
      setArrendatario("");
      setCuotaDiaria("");
      setDiaDescanso(0);
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo crear el vehículo.");
    } finally {
      setGuardando(false);
    }
  }

  function manejarRegistrarHoy(v: VehiculoConResumen, pagado: boolean) {
    registrarPagoHoy(v.id, pagado ? "pagado" : "no_pagado", pagado ? v.cuota_diaria : undefined).catch((e) =>
      Alert.alert("Error", e.message ?? "No se pudo registrar el pago de hoy.")
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Vehículo rentado</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setMostrarForm(!mostrarForm)}>
          <Text style={styles.addButtonText}>{mostrarForm ? "Cancelar" : "+ Nuevo"}</Text>
        </TouchableOpacity>
      </View>

      {mostrarForm && (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Nombre/alias del vehículo" value={nombre} onChangeText={setNombre} />
          <TextInput style={styles.input} placeholder="Placa" value={placa} onChangeText={setPlaca} />
          <TextInput style={styles.input} placeholder="Conductor/arrendatario" value={arrendatario} onChangeText={setArrendatario} />
          <TextInput style={styles.input} placeholder="Cuota diaria esperada" value={cuotaDiaria} onChangeText={setCuotaDiaria} keyboardType="numeric" />

          <Text style={styles.label}>Día de descanso (sin pago)</Text>
          <View style={styles.rubrosRow}>
            {NOMBRES_DIAS.map((dia, i) => (
              <TouchableOpacity key={i} style={[styles.chip, diaDescanso === i && styles.chipActivo]} onPress={() => setDiaDescanso(i)}>
                <Text style={[styles.chipText, diaDescanso === i && styles.chipTextActivo]}>{dia}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={manejarCrear} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Crear vehículo</Text>}
          </TouchableOpacity>
        </View>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando vehículos: {error}</Text>
      ) : (
        <FlatList
          data={vehiculos}
          keyExtractor={(v) => v.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay vehículos registrados.</Text>}
          renderItem={({ item: v }) => (
            <View style={styles.card}>
              <Text style={styles.nombre}>
                {v.nombre} {v.placa ? `(${v.placa})` : ""}
              </Text>
              {v.arrendatario && <Text style={styles.meta}>Conductor: {v.arrendatario}</Text>}
              <Text style={styles.meta}>Cuota diaria: ${Number(v.cuota_diaria).toLocaleString("es-CO")} · Descansa: {NOMBRES_DIAS[v.dia_descanso]}</Text>
              <Text style={styles.resumen}>
                Este mes: ${v.totalRecibidoMes.toLocaleString("es-CO")} de ${v.totalEsperadoMes.toLocaleString("es-CO")} esperado
              </Text>
              {v.diasEnMora > 0 && <Text style={styles.mora}>⚠ {v.diasEnMora} día(s) en mora este mes</Text>}

              {!v.yaRegistradoHoy ? (
                <View style={styles.botonesHoy}>
                  <TouchableOpacity style={[styles.miniBoton, styles.botonPagado]} onPress={() => manejarRegistrarHoy(v, true)}>
                    <Text style={styles.miniBotonTexto}>✓ Pagó hoy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.miniBoton, styles.botonNoPagado]} onPress={() => manejarRegistrarHoy(v, false)}>
                    <Text style={styles.miniBotonTexto}>✕ No pagó hoy</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.yaRegistrado}>Ya se registró el día de hoy ✓</Text>
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
  title: { fontSize: 17, fontWeight: "bold", color: "#1A1A1A" },
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
  resumen: { fontSize: 13, color: "#1F6F5C", fontWeight: "600", marginTop: 8 },
  mora: { fontSize: 12, color: "#B5651D", fontWeight: "600", marginTop: 4 },
  botonesHoy: { flexDirection: "row", marginTop: 10 },
  miniBoton: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", marginRight: 6 },
  botonPagado: { backgroundColor: "#1F6F5C" },
  botonNoPagado: { backgroundColor: "#B5651D" },
  miniBotonTexto: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  yaRegistrado: { fontSize: 12, color: "#1F6F5C", marginTop: 8, fontStyle: "italic" },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  errorText: { color: "red", padding: 16 },
});
