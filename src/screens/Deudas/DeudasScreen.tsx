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
import { useDeudas, DeudaConCuotas } from "../../hooks/useDeudas";

export default function DeudasScreen() {
  const { deudas, cargando, error, crearDeuda, marcarCuotaPagada } = useDeudas();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [deudaAbierta, setDeudaAbierta] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [nombre, setNombre] = useState("");
  const [valorInicial, setValorInicial] = useState("");
  const [tasa, setTasa] = useState("");
  const [plazo, setPlazo] = useState("");
  const [entidadPago, setEntidadPago] = useState("");
  const [numeroCuenta, setNumeroCuenta] = useState("");
  const [aliasPago, setAliasPago] = useState("");

  async function manejarCrear() {
    if (!nombre.trim() || !valorInicial.trim() || !tasa.trim() || !plazo.trim()) {
      Alert.alert("Faltan datos", "Completa al menos nombre, valor, tasa y plazo.");
      return;
    }
    setGuardando(true);
    try {
      await crearDeuda({
        nombre: nombre.trim(),
        valorInicial: parseFloat(valorInicial.replace(/[^0-9.]/g, "")),
        tasaInteresMensual: parseFloat(tasa.replace(/[^0-9.]/g, "")),
        plazoMeses: parseInt(plazo.replace(/[^0-9]/g, ""), 10),
        entidadPago: entidadPago.trim() || undefined,
        numeroCuenta: numeroCuenta.trim() || undefined,
        aliasPago: aliasPago.trim() || undefined,
      });
      setNombre("");
      setValorInicial("");
      setTasa("");
      setPlazo("");
      setEntidadPago("");
      setNumeroCuenta("");
      setAliasPago("");
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo crear la deuda.");
    } finally {
      setGuardando(false);
    }
  }

  function renderDeuda(d: DeudaConCuotas) {
    const abierta = deudaAbierta === d.id;
    return (
      <View style={styles.deudaCard}>
        <TouchableOpacity onPress={() => setDeudaAbierta(abierta ? null : d.id)}>
          <Text style={styles.deudaNombre}>{d.nombre}</Text>
          <View style={styles.progresoFondo}>
            <View style={[styles.progresoRelleno, { width: `${d.porcentajePagado * 100}%` }]} />
          </View>
          <Text style={styles.deudaMeta}>
            {d.cuotasPagadas} de {d.cuotas.length} cuotas pagadas ({Math.round(d.porcentajePagado * 100)}%)
          </Text>
          {d.proximaCuota && (
            <Text style={styles.avisoPago}>
              Próxima cuota: ${Number(d.proximaCuota.cuota_total).toLocaleString("es-CO")} vence {d.proximaCuota.fecha_vencimiento}
              {d.entidad_pago ? ` · Pagar en ${d.entidad_pago}` : ""}
              {d.numero_cuenta ? ` (${d.numero_cuenta})` : ""}
              {d.alias_pago ? ` · ${d.alias_pago}` : ""}
            </Text>
          )}
          <Text style={styles.hint}>{abierta ? "Ocultar cuotas ▲" : "Ver todas las cuotas ▼"}</Text>
        </TouchableOpacity>

        {abierta && (
          <ScrollView style={{ maxHeight: 220, marginTop: 8 }}>
            {d.cuotas.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.cuotaRow}
                disabled={c.estado === "pagada"}
                onPress={() =>
                  Alert.alert("Marcar cuota pagada", `¿Confirmar pago de la cuota #${c.numero_cuota}?`, [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Confirmar", onPress: () => marcarCuotaPagada(c.id) },
                  ])
                }
              >
                <Text style={styles.cuotaTexto}>
                  #{c.numero_cuota} · ${Number(c.cuota_total).toLocaleString("es-CO")} · vence {c.fecha_vencimiento}
                </Text>
                <Text style={[styles.cuotaEstado, c.estado === "pagada" ? styles.pagada : styles.pendiente]}>
                  {c.estado === "pagada" ? `✓ ${c.pagada_por ?? "Pagada"}` : "Pendiente"}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Deudas y créditos</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setMostrarForm(!mostrarForm)}>
          <Text style={styles.addButtonText}>{mostrarForm ? "Cancelar" : "+ Nueva"}</Text>
        </TouchableOpacity>
      </View>

      {mostrarForm && (
        <ScrollView style={styles.form}>
          <TextInput style={styles.input} placeholder="Nombre (ej. Crédito apartamento)" value={nombre} onChangeText={setNombre} />
          <TextInput style={styles.input} placeholder="Valor inicial" value={valorInicial} onChangeText={setValorInicial} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Tasa de interés mensual (ej. 1.2)" value={tasa} onChangeText={setTasa} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Plazo en meses (ej. 180)" value={plazo} onChangeText={setPlazo} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Entidad de pago (ej. Bancolombia)" value={entidadPago} onChangeText={setEntidadPago} />
          <TextInput style={styles.input} placeholder="Número de cuenta / referencia" value={numeroCuenta} onChangeText={setNumeroCuenta} />
          <TextInput style={styles.input} placeholder="Alias de pago (ej. Nequi, PSE)" value={aliasPago} onChangeText={setAliasPago} />
          <TouchableOpacity style={styles.saveButton} onPress={manejarCrear} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Crear deuda y generar cuotas</Text>}
          </TouchableOpacity>
        </ScrollView>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando deudas: {error}</Text>
      ) : (
        <FlatList
          data={deudas}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay deudas registradas.</Text>}
          renderItem={({ item: d }) => renderDeuda(d)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  title: { fontSize: 20, fontWeight: "bold", color: "#1A1A1A" },
  addButton: { backgroundColor: "#1F6F5C", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: "#fff", fontWeight: "bold" },
  form: { paddingHorizontal: 16, paddingBottom: 16, maxHeight: 380, borderBottomWidth: 1, borderBottomColor: "#EEE" },
  input: { backgroundColor: "#F5F5F5", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, fontSize: 15 },
  saveButton: { backgroundColor: "#144B3F", borderRadius: 8, paddingVertical: 12, alignItems: "center", marginBottom: 8 },
  saveButtonText: { color: "#fff", fontWeight: "bold" },
  deudaCard: { backgroundColor: "#F7F9F8", borderRadius: 12, padding: 14, marginBottom: 12 },
  deudaNombre: { fontSize: 16, fontWeight: "bold", color: "#1A1A1A", marginBottom: 8 },
  progresoFondo: { height: 10, backgroundColor: "#E0E0E0", borderRadius: 6, overflow: "hidden" },
  progresoRelleno: { height: 10, backgroundColor: "#1F6F5C" },
  deudaMeta: { fontSize: 13, color: "#5B5B5B", marginTop: 8 },
  avisoPago: { fontSize: 12, color: "#B5651D", marginTop: 6, fontWeight: "600" },
  hint: { fontSize: 11, color: "#AAA", marginTop: 8 },
  cuotaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#EEE" },
  cuotaTexto: { fontSize: 12, color: "#333" },
  cuotaEstado: { fontSize: 12, fontWeight: "bold" },
  pagada: { color: "#1F6F5C" },
  pendiente: { color: "#B5651D" },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  errorText: { color: "red", padding: 16 },
});
