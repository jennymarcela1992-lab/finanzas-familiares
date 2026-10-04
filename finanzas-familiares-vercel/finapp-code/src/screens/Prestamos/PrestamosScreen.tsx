import React, { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, StyleSheet, ActivityIndicator, Alert, Modal, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePrestamos, PrestamoConAbonos, DestinoAbono, AbonoRow } from "../../hooks/usePrestamos";
import { usePersonas } from "../../hooks/usePersonas";
import { useDeudas } from "../../hooks/useDeudas";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import ProgressBar from "../../components/ProgressBar";
import PrimaryButton from "../../components/PrimaryButton";
import FechaInput from "../../components/FechaInput";
import TablaAmortizacion from "../../components/TablaAmortizacion";
import { colors, spacing, typography, radius } from "../../theme/theme";
import { aNumero } from "../../utils/numeros";
import { TipoTasa, TIPOS_TASA, vistaPrevia, formatoFecha, pesos, hoyISO, sumarMeses } from "../../utils/amortizacion";

const FORM_VACIO = {
  quienPresta: "",
  quienRecibe: "",
  monto: "",
  motivo: "",
  fecha: hoyISO(),
  conCuotas: true,
  tasa: "",
  tipoTasa: "MV" as TipoTasa,
  plazo: "",
  primerPago: sumarMeses(hoyISO(), 1),
};

export default function PrestamosScreen() {
  const { prestamos, cargando, error, crearPrestamo, editarPrestamo, eliminarPrestamo, registrarAbono, eliminarAbono } = usePrestamos();
  const { personas } = usePersonas();
  const { deudas, recargar: recargarDeudas } = useDeudas();

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  const [pagoDe, setPagoDe] = useState<PrestamoConAbonos | null>(null);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [destino, setDestino] = useState("hogar");
  const [nota, setNota] = useState("");

  const cambiar = (k: keyof typeof FORM_VACIO) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  const previa = useMemo(() => {
    const m = aNumero(form.monto);
    const plazo = Math.round(aNumero(form.plazo));
    const tasa = aNumero(form.tasa) || 0;
    if (!form.conCuotas || !(m > 0) || !(plazo > 0)) return null;
    return vistaPrevia(m, tasa, form.tipoTasa, plazo, 0);
  }, [form]);

  function abrirNuevo() {
    if (mostrarForm && !editandoId) return setMostrarForm(false);
    setForm({ ...FORM_VACIO, quienPresta: personas[0] ?? "" });
    setEditandoId(null);
    setMostrarForm(true);
  }

  function abrirEdicion(p: PrestamoConAbonos) {
    setForm({
      quienPresta: p.quien_presta,
      quienRecibe: p.quien_recibe,
      monto: Math.round(Number(p.monto)).toLocaleString("es-CO"),
      motivo: p.motivo ?? "",
      fecha: String(p.fecha).slice(0, 10),
      conCuotas: !!p.plazo_meses,
      tasa: p.tasa ? String(p.tasa).replace(".", ",") : "",
      tipoTasa: (p.tipo_tasa ?? "MV") as TipoTasa,
      plazo: p.plazo_meses ? String(p.plazo_meses) : "",
      primerPago: p.fecha_primer_pago ?? sumarMeses(hoyISO(), 1),
    });
    setEditandoId(p.id);
    setMostrarForm(true);
  }

  async function guardar() {
    const m = aNumero(form.monto);
    if (!form.quienPresta.trim() || !form.quienRecibe.trim() || !(m > 0)) return Alert.alert("Faltan datos", "Completa quién presta, quién recibe y el monto.");
    const plazo = Math.round(aNumero(form.plazo));
    if (form.conCuotas && !(plazo > 0)) return Alert.alert("Falta el plazo", "Escribe en cuántas cuotas se paga.");
    const datos = {
      quienPresta: form.quienPresta.trim(),
      quienRecibe: form.quienRecibe.trim(),
      monto: m,
      motivo: form.motivo.trim() || undefined,
      fecha: form.fecha,
      tasa: form.conCuotas ? aNumero(form.tasa) || 0 : 0,
      tipoTasa: form.tipoTasa,
      plazoMeses: form.conCuotas ? plazo : null,
      fechaPrimerPago: form.conCuotas ? form.primerPago : null,
    };
    setGuardando(true);
    try {
      if (editandoId) await editarPrestamo(editandoId, datos);
      else await crearPrestamo(datos);
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar el préstamo.");
    } finally {
      setGuardando(false);
    }
  }

  function abrirPago(p: PrestamoConAbonos) {
    setPagoDe(p);
    setMonto(Math.round(p.conCuotas ? p.restanteProxima : p.saldoPendiente).toLocaleString("es-CO"));
    setFecha(hoyISO());
    setDestino("hogar");
    setNota("");
  }

  async function guardarPago() {
    if (!pagoDe) return;
    const v = aNumero(monto);
    if (!(v > 0)) return Alert.alert("Falta el valor", "Escribe cuánto pagaron.");
    let dest: DestinoAbono = { tipo: "hogar" };
    if (destino.startsWith("p:")) dest = { tipo: "persona", persona: destino.slice(2) };
    if (destino.startsWith("c:")) dest = { tipo: "credito", deudaId: destino.slice(2) };
    setGuardando(true);
    try {
      await registrarAbono(pagoDe.id, v, fecha, dest, nota.trim() || undefined);
      if (dest.tipo === "credito") await recargarDeudas();
      setPagoDe(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el pago.");
    } finally {
      setGuardando(false);
    }
  }

  function destinoTexto(a: AbonoRow) {
    if (a.deuda_id) return `pagó ${deudas.find((d) => d.id === a.deuda_id)?.nombre ?? "un crédito"}`;
    if (a.destino_persona) return `para ${a.destino_persona}`;
    return "quedó en el hogar";
  }

  function renderPrestamo(p: PrestamoConAbonos) {
    const abiertoP = abierto === p.id;
    const total = p.conCuotas ? p.cuotas.reduce((s, c) => s + c.cuota_total, 0) : Number(p.monto);
    const avance = total > 0 ? Math.min(1, p.totalAbonado / total) : 0;
    const tercero = p.direccion === "prestamos" ? p.quien_recibe : p.direccion === "nos_prestan" ? p.quien_presta : null;
    // objeto compatible con la tabla de amortización de créditos
    const comoDeuda: any = {
      nombre: `Préstamo ${p.quien_recibe}`,
      valor_inicial: Number(p.monto),
      tasa_interes: Number(p.tasa ?? 0),
      tipo_tasa: p.tipo_tasa ?? "MV",
      iMensual: p.iMensual,
      cuotas: p.cuotas,
      abonos: [],
      desembolsos: [],
      proximaCuota: p.proximaCuota,
      montoTotal: Number(p.monto),
      saldoActual: p.proximaCuota ? Math.round(p.proximaCuota.saldo + p.proximaCuota.capital) : 0,
    };
    return (
      <Card>
        <TouchableOpacity onPress={() => setAbierto(abiertoP ? null : p.id)} activeOpacity={0.85}>
          <View style={styles.rowStart}>
            <View style={styles.iconoCircle}>
              <Ionicons name="people" size={17} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.h3}>
                {p.quien_presta} → {p.quien_recibe}
              </Text>
              <Text style={typography.caption}>
                {pesos(Number(p.monto))} · {formatoFecha(String(p.fecha).slice(0, 10))}
                {p.motivo ? ` · ${p.motivo}` : ""}
                {tercero ? (p.direccion === "prestamos" ? " · le prestamos a un tercero" : " · nos prestó un tercero") : ""}
              </Text>
            </View>
            <Text style={styles.pct}>{Math.round(avance * 100)}%</Text>
          </View>
          <View style={{ marginTop: spacing.sm, marginBottom: 4 }}>
            <ProgressBar progreso={avance} />
          </View>
          <Text style={typography.caption}>
            {p.direccion === "nos_prestan" ? "Pagado" : "Recibido"} {pesos(p.totalAbonado)} · falta {pesos(p.saldoPendiente)}
            {p.conCuotas ? ` · ${p.cuotas.filter((c) => c.estado === "pagada").length} de ${p.cuotas.length} cuotas` : ""}
          </Text>
          {p.proximaCuota && (
            <View style={styles.aviso}>
              <Ionicons name="alarm" size={14} color={colors.warning} />
              <Text style={styles.avisoTxt}>
                Próxima cuota #{p.proximaCuota.numero_cuota}: {pesos(p.restanteProxima)} vence {formatoFecha(p.proximaCuota.fecha_vencimiento)}
              </Text>
            </View>
          )}
          <Text style={styles.hint}>{abiertoP ? "Ocultar detalle ▲" : p.conCuotas ? "Ver tabla de amortización y pagos ▼" : "Ver pagos ▼"}</Text>
        </TouchableOpacity>

        <View style={styles.acciones}>
          {p.saldoPendiente > 0 && (
            <TouchableOpacity style={styles.accion} onPress={() => abrirPago(p)}>
              <Ionicons name="cash" size={15} color={colors.primary} />
              <Text style={styles.accionTxt}>Registrar pago</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.accion} onPress={() => abrirEdicion(p)}>
            <Ionicons name="create" size={15} color={colors.primary} />
            <Text style={styles.accionTxt}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.accion}
            onPress={() =>
              Alert.alert("Eliminar préstamo", "¿Eliminar este préstamo y todos sus pagos? Si algún pago abonó a un crédito, ese pago también se borra.", [
                { text: "Cancelar", style: "cancel" },
                { text: "Eliminar", style: "destructive", onPress: () => eliminarPrestamo(p).then(recargarDeudas).catch((e) => Alert.alert("Error", e.message)) },
              ])
            }
          >
            <Ionicons name="trash" size={15} color={colors.danger} />
            <Text style={[styles.accionTxt, { color: colors.danger }]}>Eliminar</Text>
          </TouchableOpacity>
        </View>

        {abiertoP && (
          <View style={{ marginTop: spacing.md }}>
            {p.conCuotas && (
              <>
                <Text style={styles.label}>Tabla de amortización</Text>
                <TablaAmortizacion deuda={comoDeuda} />
              </>
            )}
            <Text style={[styles.label, { marginTop: spacing.md }]}>Pagos registrados</Text>
            {p.abonos.length === 0 && <Text style={styles.listaTxt}>Todavía no hay pagos.</Text>}
            {p.abonos.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={styles.abonoFila}
                onPress={() =>
                  Alert.alert("Borrar pago", `¿Borrar el pago de ${pesos(Number(a.monto))} del ${formatoFecha(a.fecha)}?${a.deuda_id ? " También se borra el pago al crédito." : ""}`, [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Borrar", style: "destructive", onPress: () => eliminarAbono(a).then(recargarDeudas).catch((e) => Alert.alert("Error", e.message)) },
                  ])
                }
              >
                <Ionicons name={a.deuda_id ? "card" : a.destino_persona ? "person" : "home"} size={14} color={colors.primary} />
                <Text style={[styles.listaTxt, { flex: 1 }]}>
                  {formatoFecha(a.fecha)} · <Text style={{ fontWeight: "700" }}>{pesos(Number(a.monto))}</Text> · {destinoTexto(a)}
                  {a.nota ? ` · ${a.nota}` : ""}
                </Text>
                <Ionicons name="close-circle-outline" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Card>
    );
  }

  const esNosPrestan = pagoDe?.direccion === "nos_prestan";

  return (
    <View style={styles.container}>
      <ScreenHeader title="Préstamos" subtitle="A terceros o entre ustedes" actionLabel="Nuevo" onAction={abrirNuevo} actionActive={mostrarForm && !editandoId} />

      {mostrarForm ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={[typography.h3, { marginBottom: spacing.sm }]}>{editandoId ? "Editar préstamo" : "Nuevo préstamo"}</Text>
            <Text style={styles.label}>¿Quién prestó?</Text>
            <View style={styles.chips}>
              {personas.map((n) => (
                <TouchableOpacity key={n} onPress={() => cambiar("quienPresta")(n)} style={[styles.chip, form.quienPresta === n && styles.chipActivo]}>
                  <Text style={[styles.chipTxt, form.quienPresta === n && styles.chipTxtActivo]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="O escribe el nombre (si fue un tercero)" placeholderTextColor={colors.textMuted} value={form.quienPresta} onChangeText={cambiar("quienPresta")} />
            <Text style={styles.label}>¿Quién recibió el préstamo?</Text>
            <TextInput style={styles.input} placeholder="Ej. Carlos (primo)" placeholderTextColor={colors.textMuted} value={form.quienRecibe} onChangeText={cambiar("quienRecibe")} />
            <Text style={styles.label}>Valor prestado</Text>
            <TextInput style={styles.input} placeholder="Ej. 5.000.000" placeholderTextColor={colors.textMuted} value={form.monto} onChangeText={cambiar("monto")} keyboardType="numeric" />
            <Text style={styles.label}>Fecha del préstamo</Text>
            <FechaInput value={form.fecha} onChange={cambiar("fecha")} max={hoyISO()} />
            <TextInput style={styles.input} placeholder="Motivo (opcional)" placeholderTextColor={colors.textMuted} value={form.motivo} onChangeText={cambiar("motivo")} />

            <View style={styles.switchFila}>
              <Text style={[typography.body, { flex: 1 }]}>Se paga en cuotas mensuales (genera tabla de amortización)</Text>
              <Switch value={form.conCuotas} onValueChange={cambiar("conCuotas")} trackColor={{ true: colors.primary }} />
            </View>
            {form.conCuotas && (
              <>
                <Text style={styles.label}>Tasa de interés (0 si no cobra intereses)</Text>
                <TextInput style={styles.input} placeholder="Ej. 1,5" placeholderTextColor={colors.textMuted} value={form.tasa} onChangeText={cambiar("tasa")} keyboardType="decimal-pad" />
                <View style={styles.chips}>
                  {TIPOS_TASA.map((t) => (
                    <TouchableOpacity key={t.valor} onPress={() => cambiar("tipoTasa")(t.valor)} style={[styles.chip, form.tipoTasa === t.valor && styles.chipActivo]}>
                      <Text style={[styles.chipTxt, form.tipoTasa === t.valor && styles.chipTxtActivo]}>{t.etiqueta}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Número de cuotas</Text>
                <TextInput style={styles.input} placeholder="Ej. 12" placeholderTextColor={colors.textMuted} value={form.plazo} onChangeText={cambiar("plazo")} keyboardType="numeric" />
                <Text style={styles.label}>Fecha de la primera cuota</Text>
                <FechaInput value={form.primerPago} onChange={cambiar("primerPago")} />
                {previa && (
                  <View style={styles.previa}>
                    <Text style={styles.previaTit}>Cuota mensual: {pesos(previa.cuotaSinSeguro)}</Text>
                    <Text style={styles.previaTxt}>Intereses totales {pesos(previa.totalIntereses)} · total a pagar {pesos(previa.cuotaSinSeguro * Math.round(aNumero(form.plazo)))}</Text>
                  </View>
                )}
              </>
            )}
            <PrimaryButton title={editandoId ? "Guardar cambios" : "Guardar préstamo"} onPress={guardar} loading={guardando} />
            <PrimaryButton title="Cancelar" variant="outline" onPress={() => setMostrarForm(false)} style={{ marginTop: spacing.sm }} />
          </Card>
        </ScrollView>
      ) : cargando && !prestamos.length ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando préstamos: {error}</Text>
      ) : (
        <FlatList
          data={prestamos}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay préstamos registrados.</Text>}
          renderItem={({ item }) => renderPrestamo(item)}
        />
      )}

      <Modal visible={!!pagoDe} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <ScrollView style={styles.modalCaja} keyboardShouldPersistTaps="handled">
            {pagoDe && (
              <>
                <Text style={typography.h2}>{esNosPrestan ? "Pago que hicimos" : "Pago recibido"}</Text>
                <Text style={typography.caption}>
                  {pagoDe.quien_presta} → {pagoDe.quien_recibe} · falta {pesos(pagoDe.saldoPendiente)}
                </Text>
                {pagoDe.proximaCuota && (
                  <Text style={[styles.listaTxt, { marginTop: 6 }]}>
                    Cuota #{pagoDe.proximaCuota.numero_cuota} vence {formatoFecha(pagoDe.proximaCuota.fecha_vencimiento)} · falta {pesos(pagoDe.restanteProxima)}. Si pagan más, pasa a la siguiente cuota.
                  </Text>
                )}
                <Text style={[styles.label, { marginTop: spacing.md }]}>Valor</Text>
                <TextInput style={styles.input} value={monto} onChangeText={setMonto} keyboardType="numeric" placeholder="Valor" placeholderTextColor={colors.textMuted} />
                <Text style={styles.label}>Fecha</Text>
                <FechaInput value={fecha} onChange={setFecha} max={hoyISO()} />

                <Text style={styles.label}>{esNosPrestan ? "¿Quién hizo el pago?" : "¿A dónde fue este dinero?"}</Text>
                <View style={styles.chips}>
                  {!esNosPrestan && (
                    <TouchableOpacity onPress={() => setDestino("hogar")} style={[styles.chip, destino === "hogar" && styles.chipActivo]}>
                      <Text style={[styles.chipTxt, destino === "hogar" && styles.chipTxtActivo]}>Queda en el hogar</Text>
                    </TouchableOpacity>
                  )}
                  {personas.map((n) => (
                    <TouchableOpacity key={n} onPress={() => setDestino(`p:${n}`)} style={[styles.chip, destino === `p:${n}` && styles.chipActivo]}>
                      <Text style={[styles.chipTxt, destino === `p:${n}` && styles.chipTxtActivo]}>{esNosPrestan ? n : `Para ${n}`}</Text>
                    </TouchableOpacity>
                  ))}
                  {!esNosPrestan &&
                    deudas
                      .filter((d) => d.proximaCuota)
                      .map((d) => (
                        <TouchableOpacity key={d.id} onPress={() => setDestino(`c:${d.id}`)} style={[styles.chip, destino === `c:${d.id}` && styles.chipActivo]}>
                          <Text style={[styles.chipTxt, destino === `c:${d.id}` && styles.chipTxtActivo]}>Pagar {d.nombre}</Text>
                        </TouchableOpacity>
                      ))}
                </View>
                {destino.startsWith("c:") && (
                  <Text style={styles.ayuda}>
                    Se registra como pago de la cuota de {deudas.find((d) => d.id === destino.slice(2))?.nombre}: falta {pesos(deudas.find((d) => d.id === destino.slice(2))?.restanteProxima ?? 0)}.
                  </Text>
                )}
                <TextInput style={styles.input} placeholder="Nota (opcional)" placeholderTextColor={colors.textMuted} value={nota} onChangeText={setNota} />
                <PrimaryButton title="Guardar pago" onPress={guardarPago} loading={guardando} />
                <TouchableOpacity onPress={() => setPagoDe(null)} style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
                  <Text style={{ textAlign: "center", color: colors.textSecondary }}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  label: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 4 },
  ayuda: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.sm },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  chipActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  chipTxtActivo: { color: colors.white },
  switchFila: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: spacing.sm },
  previa: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm },
  previaTit: { fontSize: 15, fontWeight: "800", color: colors.primary },
  previaTxt: { fontSize: 12, color: colors.textPrimary, marginTop: 2 },
  rowStart: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconoCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  pct: { fontSize: 15, fontWeight: "800", color: colors.primary },
  aviso: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, backgroundColor: "#FCEFD9", padding: spacing.sm, borderRadius: radius.sm },
  avisoTxt: { fontSize: 12, color: colors.warning, fontWeight: "600", flex: 1 },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
  acciones: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  accion: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.background },
  accionTxt: { fontSize: 13, fontWeight: "600", color: colors.primary },
  listaTxt: { fontSize: 12, color: colors.textSecondary },
  abonoFila: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.lg },
  modalCaja: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, maxHeight: "90%", flexGrow: 0 },
});
