import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDashboard, mesHoy, moverMes } from "../../hooks/useDashboard";
import { useCierreMensual } from "../../hooks/useCierreMensual";
import { useAuth } from "../../hooks/useAuth";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import { colors, spacing, typography, radius } from "../../theme/theme";
import { aNumero } from "../../utils/numeros";
import { pesos } from "../../utils/amortizacion";
import { APORTE_BASE } from "../../config/hogar";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

export default function IngresosScreen() {
  const [mes, setMes] = useState(mesHoy());
  const { datos, cargando, error, recargar } = useDashboard(mes);
  const { definirAporte } = useCierreMensual(mes);
  const { usuario } = useAuth();
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const esMesActual = mes === mesHoy();

  async function guardarAporte(nombre: string, nuevo: number) {
    if (!(nuevo >= 0)) return Alert.alert("Valor no válido", "Escribe el aporte de este mes.");
    setGuardando(true);
    try {
      const esYo = usuario?.user_metadata?.nombre === nombre || usuario?.email === nombre;
      await definirAporte(nombre, Math.round(nuevo), esYo ? usuario?.id : undefined);
      setEditando(null);
      setValor("");
      await recargar();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar el aporte.");
    } finally {
      setGuardando(false);
    }
  }

  const a = datos?.actual;
  const otras = a
    ? [
        { icono: "business", texto: "Arriendos recibidos", valor: a.arriendos, donde: "Se registran en Propiedades" },
        { icono: "car", texto: "Carro rentado", valor: a.vehiculo, donde: "Se registra en Vehículo rentado" },
        { icono: "trending-up", texto: "Inversiones en conjunto", valor: a.inversiones, donde: "Ingresos registrados en Inversiones" },
        { icono: "people", texto: "Préstamos a terceros (abonos recibidos)", valor: a.prestamosCobrados, donde: "Abonos registrados en Préstamos personales" },
      ]
    : [];
  const totalOtras = otras.reduce((s, o) => s + o.valor, 0);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Ingresos del hogar" subtitle="Aportes y entradas en conjunto" />

      <View style={styles.selector}>
        <TouchableOpacity onPress={() => setMes(moverMes(mes, -1))} style={styles.flecha} accessibilityLabel="Mes anterior">
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[typography.h2, { textTransform: "capitalize" }]}>{nombreMes(mes)}</Text>
        <TouchableOpacity onPress={() => setMes(moverMes(mes, 1))} style={[styles.flecha, esMesActual && { opacity: 0.3 }]} disabled={esMesActual} accessibilityLabel="Mes siguiente">
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {cargando && !datos ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
      ) : error || !datos || !a ? (
        <Text style={styles.errorText}>Error cargando ingresos: {error}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md, width: "100%", maxWidth: 760, alignSelf: "center" }}>
          <Card style={{ backgroundColor: colors.primary }}>
            <Text style={styles.heroEtiqueta}>Entradas del hogar en {MESES[Number(mes.slice(5, 7)) - 1]}</Text>
            <Text style={styles.heroValor}>{pesos(a.ingresos)}</Text>
            <Text style={styles.heroDetalle}>
              Aportes {pesos(a.aportes)} + otras entradas {pesos(totalOtras)}
            </Text>
          </Card>

          <Card>
            <Text style={typography.h3}>Aportes de cada persona</Text>
            <Text style={styles.ayuda}>
              Cada uno aporta {pesos(APORTE_BASE)} al mes, salvo que lo ajuste para ese mes. El ajuste solo cambia el mes que estás viendo.
            </Text>
            {datos.aportesPersonas.length === 0 && <Text style={typography.body}>No hay personas registradas.</Text>}
            {datos.aportesPersonas.map((p) => (
              <View key={p.nombre} style={styles.personaFila}>
                <View style={styles.fila}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTexto}>{p.nombre.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.h3}>{p.nombre}</Text>
                    <Text style={typography.caption}>{p.esBase ? "Valor base" : "Ajustado para este mes"}</Text>
                  </View>
                  <Text style={styles.monto}>{pesos(p.aporte)}</Text>
                </View>

                {editando === p.nombre ? (
                  <View style={styles.editarFila}>
                    <TextInput
                      style={styles.input}
                      value={valor}
                      onChangeText={setValor}
                      keyboardType="numeric"
                      placeholder={`Aporte de ${MESES[Number(mes.slice(5, 7)) - 1]}`}
                      placeholderTextColor={colors.textMuted}
                      autoFocus
                    />
                    <TouchableOpacity style={styles.botonOk} onPress={() => guardarAporte(p.nombre, aNumero(valor))} disabled={guardando}>
                      {guardando ? <ActivityIndicator color={colors.white} /> : <Ionicons name="checkmark" size={18} color={colors.white} />}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.botonCancelar} onPress={() => setEditando(null)}>
                      <Ionicons name="close" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.acciones}>
                    <TouchableOpacity
                      onPress={() => {
                        setEditando(p.nombre);
                        setValor(Math.round(p.aporte).toLocaleString("es-CO"));
                      }}
                      style={styles.enlace}
                    >
                      <Ionicons name="pencil" size={13} color={colors.primary} />
                      <Text style={styles.enlaceTexto}>Ajustar este mes</Text>
                    </TouchableOpacity>
                    {!p.esBase && p.aporte !== APORTE_BASE && (
                      <TouchableOpacity onPress={() => guardarAporte(p.nombre, APORTE_BASE)} style={styles.enlace}>
                        <Ionicons name="refresh" size={13} color={colors.primary} />
                        <Text style={styles.enlaceTexto}>Volver a {pesos(APORTE_BASE)}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))}
          </Card>

          <Card>
            <Text style={typography.h3}>Otras entradas en conjunto</Text>
            {otras.map((o) => (
              <View key={o.texto} style={styles.otraFila}>
                <View style={styles.icono}>
                  <Ionicons name={o.icono as any} size={15} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.otraTexto}>{o.texto}</Text>
                  <Text style={typography.caption}>{o.donde}</Text>
                </View>
                <Text style={[styles.monto, o.valor === 0 && { color: colors.textMuted }]}>{pesos(o.valor)}</Text>
              </View>
            ))}
            <View style={[styles.otraFila, { borderTopColor: colors.textMuted }]}>
              <Text style={[styles.otraTexto, { flex: 1, fontWeight: "800" }]}>Total otras entradas</Text>
              <Text style={styles.monto}>{pesos(totalOtras)}</Text>
            </View>
            <Text style={styles.ayuda}>La nómina individual no se suma: los ingresos de cada persona entran al hogar como su aporte.</Text>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  selector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, width: "100%", maxWidth: 760, alignSelf: "center" },
  flecha: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  heroEtiqueta: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  heroValor: { color: colors.white, fontSize: 30, fontWeight: "800", marginTop: 2 },
  heroDetalle: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 4 },
  ayuda: { fontSize: 11, color: colors.textMuted, marginTop: 4, marginBottom: spacing.sm },
  personaFila: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  fila: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  avatarTexto: { color: colors.primary, fontWeight: "800" },
  monto: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  acciones: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm, marginLeft: 44 },
  enlace: { flexDirection: "row", alignItems: "center", gap: 5 },
  enlaceTexto: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  editarFila: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm },
  input: { flex: 1, backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: colors.textPrimary },
  botonOk: { backgroundColor: colors.primary, padding: 9, borderRadius: radius.sm },
  botonCancelar: { backgroundColor: colors.background, padding: 9, borderRadius: radius.sm },
  otraFila: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  icono: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  otraTexto: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  errorText: { color: colors.danger, padding: spacing.lg },
});
