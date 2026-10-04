import React, { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert, ScrollView, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDeudas, DeudaConCuotas, CuotaRow, AbonoRow, DatosDeuda } from "../../hooks/useDeudas";
import { usePersonas } from "../../hooks/usePersonas";
import { PagoDeudaRow } from "../../utils/pagosDeuda";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import ProgressBar from "../../components/ProgressBar";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";
import { aNumero } from "../../utils/numeros";
import {
  TipoTasa,
  TIPOS_TASA,
  vistaPrevia,
  generarCuotas,
  esFechaValida,
  hoyISO,
  sumarMeses,
  formatoFecha,
  pesos,
} from "../../utils/amortizacion";

const FORM_VACIO = {
  nombre: "",
  valor: "",
  tasa: "",
  tipoTasa: "EA" as TipoTasa,
  plazo: "",
  seguro: "",
  fechaPrimerPago: sumarMeses(hoyISO(), 1),
  entidad: "",
  cuenta: "",
  alias: "",
};

export default function DeudasScreen() {
  const {
    deudas,
    cargando,
    error,
    crearDeuda,
    editarDeuda,
    eliminarDeuda,
    registrarPago,
    eliminarPago,
    registrarAbono,
    eliminarAbono,
  } = useDeudas();

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [marcarVencidas, setMarcarVencidas] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [deudaAbierta, setDeudaAbierta] = useState<string | null>(null);
  const [abonoEn, setAbonoEn] = useState<string | null>(null);
  const [pagoEn, setPagoEn] = useState<string | null>(null);
  const { personas, yo } = usePersonas();

  const cambiar = (campo: keyof typeof FORM_VACIO) => (v: string) => setForm((f) => ({ ...f, [campo]: v }));

  // ---------- Vista previa del formulario ----------
  const previa = useMemo(() => {
    const valor = aNumero(form.valor);
    const tasa = aNumero(form.tasa);
    const plazo = Math.round(aNumero(form.plazo));
    const seguro = aNumero(form.seguro) || 0;
    if (!(valor > 0) || !(tasa >= 0) || !(plazo > 0)) return null;
    return vistaPrevia(valor, tasa, form.tipoTasa, plazo, seguro);
  }, [form.valor, form.tasa, form.plazo, form.seguro, form.tipoTasa]);

  const fechaOk = esFechaValida(form.fechaPrimerPago);
  const fechaEnPasado = fechaOk && form.fechaPrimerPago < hoyISO();

  function abrirNueva() {
    if (mostrarForm && !editandoId) {
      setMostrarForm(false);
      return;
    }
    setForm(FORM_VACIO);
    setEditandoId(null);
    setMarcarVencidas(true);
    setMostrarForm(true);
  }

  function abrirEdicion(d: DeudaConCuotas) {
    setForm({
      nombre: d.nombre,
      valor: Math.round(Number(d.valor_inicial)).toLocaleString("es-CO"),
      tasa: String(d.tasa_interes).replace(".", ","),
      tipoTasa: d.tipo_tasa ?? "MV",
      plazo: String(d.plazo_meses),
      seguro: d.seguro_mensual ? Math.round(Number(d.seguro_mensual)).toLocaleString("es-CO") : "",
      fechaPrimerPago: d.primerPago,
      entidad: d.entidad_pago ?? "",
      cuenta: d.numero_cuenta ?? "",
      alias: d.alias_pago ?? "",
    });
    setEditandoId(d.id);
    setMostrarForm(true);
  }

  async function guardar() {
    const valor = aNumero(form.valor);
    const tasa = aNumero(form.tasa);
    const plazo = Math.round(aNumero(form.plazo));
    if (!form.nombre.trim() || !(valor > 0) || !(tasa >= 0) || !(plazo > 0)) {
      Alert.alert("Faltan datos", "Completa nombre, valor, tasa y plazo con números válidos.");
      return;
    }
    if (!fechaOk) {
      Alert.alert("Fecha no válida", "Escribe la fecha del primer pago así: AAAA-MM-DD (ej. 2026-11-05).");
      return;
    }
    const datos: DatosDeuda = {
      nombre: form.nombre.trim(),
      valorInicial: valor,
      tasa,
      tipoTasa: form.tipoTasa,
      plazoMeses: plazo,
      seguroMensual: aNumero(form.seguro) || 0,
      fechaPrimerPago: form.fechaPrimerPago,
      entidadPago: form.entidad.trim() || undefined,
      numeroCuenta: form.cuenta.trim() || undefined,
      aliasPago: form.alias.trim() || undefined,
    };
    setGuardando(true);
    try {
      if (editandoId) await editarDeuda(editandoId, datos);
      else await crearDeuda(datos, fechaEnPasado && marcarVencidas);
      setMostrarForm(false);
      setEditandoId(null);
      setForm(FORM_VACIO);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  function confirmarEliminar(d: DeudaConCuotas) {
    Alert.alert("Eliminar deuda", `¿Eliminar "${d.nombre}" con todas sus cuotas y abonos? No se puede deshacer.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () => eliminarDeuda(d.id).catch((e) => Alert.alert("Error", e.message)),
      },
    ]);
  }

  function tocarCuota(c: CuotaRow) {
    if (c.estado === "pagada") {
      Alert.alert(`Cuota #${c.numero_cuota} pagada`, `Pagó: ${c.pagada_por ?? "—"}${c.fecha_pago ? ` · ${formatoFecha(c.fecha_pago)}` : ""}\n\nPara corregirla, borra el pago en la lista "Pagos registrados".`);
    } else {
      Alert.alert(`Cuota #${c.numero_cuota}`, `Falta ${pesos(Number(c.cuota_total) - Number(c.valor_pagado ?? 0))}. Queda pagada cuando registres el pago (botón "Registrar pago", un gasto de crédito o un arriendo).`);
    }
  }

  function confirmarBorrarPago(p: PagoDeudaRow) {
    const extra = p.gasto_id ? " También se borra el gasto asociado." : p.arriendo_id ? " El arriendo sigue registrado como entrada." : "";
    Alert.alert("Borrar pago", `¿Borrar el pago de ${pesos(Number(p.valor))} (${p.pagado_por ?? ""}, ${formatoFecha(p.fecha)})?${extra}`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: () => eliminarPago(p).catch((e) => Alert.alert("Error", e.message)) },
    ]);
  }

  function confirmarBorrarAbono(a: AbonoRow) {
    Alert.alert("Borrar abono", `¿Borrar el abono de ${pesos(Number(a.valor))} del ${formatoFecha(a.fecha)}? Las cuotas se recalculan.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: () => eliminarAbono(a).catch((e) => Alert.alert("Error", e.message)) },
    ]);
  }

  // ---------- Formulario ----------
  function renderFormulario() {
    return (
      <ScrollView style={styles.form} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={[typography.h3, { marginBottom: spacing.sm }]}>{editandoId ? "Editar crédito" : "Nuevo crédito"}</Text>

          <Text style={styles.label}>Nombre</Text>
          <TextInput style={styles.input} placeholder="Ej. Crédito apartamento" placeholderTextColor={colors.textMuted} value={form.nombre} onChangeText={cambiar("nombre")} />

          <Text style={styles.label}>Valor del crédito</Text>
          <TextInput style={styles.input} placeholder="Ej. 100.000.000" placeholderTextColor={colors.textMuted} value={form.valor} onChangeText={cambiar("valor")} keyboardType="numeric" />

          <Text style={styles.label}>Tasa de interés</Text>
          <View style={styles.fila}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Ej. 24,5"
              placeholderTextColor={colors.textMuted}
              value={form.tasa}
              onChangeText={cambiar("tasa")}
              keyboardType="decimal-pad"
            />
            <Text style={styles.sufijo}>%</Text>
          </View>
          <View style={styles.chips}>
            {TIPOS_TASA.map((t) => (
              <TouchableOpacity key={t.valor} onPress={() => setForm((f) => ({ ...f, tipoTasa: t.valor }))} style={[styles.chip, form.tipoTasa === t.valor && styles.chipActivo]}>
                <Text style={[styles.chipTexto, form.tipoTasa === t.valor && styles.chipTextoActivo]}>{t.etiqueta}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.ayuda}>{TIPOS_TASA.find((t) => t.valor === form.tipoTasa)?.ayuda}</Text>

          <Text style={styles.label}>Plazo total (número de cuotas)</Text>
          <TextInput style={styles.input} placeholder="Ej. 60" placeholderTextColor={colors.textMuted} value={form.plazo} onChangeText={cambiar("plazo")} keyboardType="numeric" />

          <Text style={styles.label}>Seguros y otros cobros fijos por mes (opcional)</Text>
          <TextInput style={styles.input} placeholder="Ej. 85.000" placeholderTextColor={colors.textMuted} value={form.seguro} onChangeText={cambiar("seguro")} keyboardType="numeric" />

          <Text style={styles.label}>Fecha de la primera cuota</Text>
          <TextInput
            style={[styles.input, !fechaOk && form.fechaPrimerPago.length > 0 && styles.inputError]}
            placeholder="AAAA-MM-DD (ej. 2026-11-05)"
            placeholderTextColor={colors.textMuted}
            value={form.fechaPrimerPago}
            onChangeText={cambiar("fechaPrimerPago")}
          />
          <Text style={styles.ayuda}>Las siguientes cuotas vencen el mismo día cada mes.</Text>

          {!editandoId && fechaEnPasado && (
            <View style={styles.switchFila}>
              <Text style={[typography.body, { flex: 1 }]}>El crédito ya venía corriendo: marcar como pagadas las cuotas con fecha anterior a hoy</Text>
              <Switch value={marcarVencidas} onValueChange={setMarcarVencidas} trackColor={{ true: colors.primary }} />
            </View>
          )}

          {previa && (
            <View style={styles.previa}>
              <Text style={styles.previaTitulo}>Cuota mensual calculada: {pesos(previa.cuotaConSeguro)}</Text>
              <Text style={styles.previaTexto}>
                Capital + interés {pesos(previa.cuotaSinSeguro)}
                {previa.cuotaConSeguro !== previa.cuotaSinSeguro ? ` + seguros ${pesos(previa.cuotaConSeguro - previa.cuotaSinSeguro)}` : ""}
              </Text>
              <Text style={styles.previaTexto}>
                Tasa mensual equivalente: {(previa.iMensual * 100).toLocaleString("es-CO", { maximumFractionDigits: 4 })}% · Intereses totales {pesos(previa.totalIntereses)}
              </Text>
              <Text style={styles.ayuda}>Compárala con la cuota de tu extracto. Si no coincide, revisa el tipo de tasa o el valor de seguros.</Text>
            </View>
          )}

          {editandoId && <Text style={styles.ayuda}>Al guardar, se recalculan las cuotas pendientes. Las cuotas ya pagadas no cambian.</Text>}

          <Text style={[styles.label, { marginTop: spacing.sm }]}>Dónde se paga (opcional)</Text>
          <TextInput style={styles.input} placeholder="Entidad (ej. Bancolombia)" placeholderTextColor={colors.textMuted} value={form.entidad} onChangeText={cambiar("entidad")} />
          <TextInput style={styles.input} placeholder="Número de crédito / referencia" placeholderTextColor={colors.textMuted} value={form.cuenta} onChangeText={cambiar("cuenta")} />
          <TextInput style={styles.input} placeholder="Medio de pago (ej. PSE, débito automático)" placeholderTextColor={colors.textMuted} value={form.alias} onChangeText={cambiar("alias")} />

          <PrimaryButton title={editandoId ? "Guardar cambios y recalcular" : "Crear crédito y generar cuotas"} onPress={guardar} loading={guardando} />
          <PrimaryButton
            title="Cancelar"
            variant="outline"
            onPress={() => {
              setMostrarForm(false);
              setEditandoId(null);
            }}
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      </ScrollView>
    );
  }

  // ---------- Deuda ----------
  function renderDeuda(d: DeudaConCuotas) {
    const abierta = deudaAbierta === d.id;
    const terminada = !d.proximaCuota && d.saldoActual <= 0;
    const ultima = d.cuotas[d.cuotas.length - 1];
    return (
      <Card>
        <TouchableOpacity onPress={() => setDeudaAbierta(abierta ? null : d.id)}>
          <View style={styles.rowBetween}>
            <View style={styles.rowStart}>
              <View style={styles.iconoCircle}>
                <Ionicons name={terminada ? "checkmark-done" : "card"} size={17} color={colors.primary} />
              </View>
              <Text style={[typography.h3, { flexShrink: 1 }]}>{d.nombre}</Text>
            </View>
            <Text style={styles.pctText}>{Math.round(d.porcentajePagado * 100)}%</Text>
          </View>
          <View style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
            <ProgressBar progreso={d.porcentajePagado} />
          </View>
          <Text style={typography.caption}>
            Saldo {pesos(d.saldoActual)} de {pesos(Number(d.valor_inicial))} · {d.cuotasPagadas} de {d.cuotas.length} cuotas pagadas
          </Text>
          {!terminada && ultima && (
            <Text style={typography.caption}>
              Intereses por pagar {pesos(d.interesesPendientes)} · termina {formatoFecha(ultima.fecha_vencimiento)}
            </Text>
          )}
          {d.proximaCuota && (
            <View style={styles.avisoBox}>
              <Ionicons name="alert-circle" size={14} color={colors.warning} />
              <Text style={styles.avisoTexto}>
                Próxima: {pesos(Number(d.proximaCuota.cuota_total))} vence {formatoFecha(d.proximaCuota.fecha_vencimiento)}
                {d.entidad_pago ? ` · ${d.entidad_pago}` : ""}
                {d.numero_cuenta ? ` (${d.numero_cuenta})` : ""}
                {d.alias_pago ? ` · ${d.alias_pago}` : ""}
              </Text>
            </View>
          )}
          {terminada && <Text style={[styles.avisoTexto, { color: colors.success, marginTop: spacing.sm }]}>¡Crédito pagado!</Text>}
          <Text style={styles.hint}>{abierta ? "Ocultar detalle ▲" : "Ver tabla, pagos y abonos ▼"}</Text>
        </TouchableOpacity>

        {abierta && (
          <View>
            <View style={styles.acciones}>
              {d.proximaCuota && (
                <Accion icono="checkmark-circle" texto="Registrar pago" onPress={() => { setAbonoEn(null); setPagoEn(pagoEn === d.id ? null : d.id); }} />
              )}
              {!terminada && <Accion icono="cash" texto="Abono extra" onPress={() => { setPagoEn(null); setAbonoEn(abonoEn === d.id ? null : d.id); }} />}
              <Accion icono="create" texto="Editar" onPress={() => abrirEdicion(d)} />
              <Accion icono="trash" texto="Eliminar" color={colors.danger} onPress={() => confirmarEliminar(d)} />
            </View>

            {pagoEn === d.id && <FormPago deuda={d} personas={personas} yo={yo} onCerrar={() => setPagoEn(null)} registrar={registrarPago} />}
            {abonoEn === d.id && <FormAbono deuda={d} onCerrar={() => setAbonoEn(null)} registrar={registrarAbono} />}

            <Text style={[styles.label, { marginTop: spacing.md }]}>Tabla de amortización</Text>
            <Text style={styles.ayuda}>Una cuota queda pagada cuando se registra su pago. Toca una cuota para ver el detalle.</Text>
            <ScrollView style={{ maxHeight: 340, marginTop: spacing.xs }} nestedScrollEnabled>
              {d.cuotas.map((c) => {
                const pagada = c.estado === "pagada";
                return (
                  <TouchableOpacity key={c.id} style={styles.cuotaRow} onPress={() => tocarCuota(c)}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cuotaTexto, pagada && styles.cuotaPagada]}>
                        #{c.numero_cuota} · {formatoFecha(c.fecha_vencimiento)} · <Text style={{ fontWeight: "700" }}>{pesos(Number(c.cuota_total))}</Text>
                      </Text>
                      <Text style={styles.cuotaDetalle}>
                        Capital {pesos(Number(c.capital))} · Interés {pesos(Number(c.interes))}
                        {Number(c.seguro) ? ` · Seguros ${pesos(Number(c.seguro))}` : ""} · Saldo {pesos(Number(c.saldo))}
                      </Text>
                      {!pagada && Number(c.valor_pagado ?? 0) > 0 && (
                        <Text style={styles.parcial}>Abonado {pesos(Number(c.valor_pagado))} · falta {pesos(Number(c.cuota_total) - Number(c.valor_pagado))}</Text>
                      )}
                    </View>
                    <View style={[styles.pill, pagada ? styles.pillSuccess : styles.pillWarning]}>
                      <Text style={[styles.pillText, pagada ? styles.pillTextSuccess : styles.pillTextWarning]}>
                        {pagada ? `✓ ${c.pagada_por ?? "Pagada"}` : Number(c.valor_pagado ?? 0) > 0 ? "Parcial" : "Pendiente"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {d.pagos.length > 0 && (
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.label}>Pagos registrados</Text>
                {d.pagos.filter((p) => p.origen !== "registro_inicial").slice(0, 12).map((p) => (
                  <TouchableOpacity key={p.id} style={styles.cuotaRow} onPress={() => confirmarBorrarPago(p)}>
                    <Ionicons name={p.origen === "arriendo" ? "business" : "person"} size={14} color={colors.primary} />
                    <Text style={[styles.cuotaTexto, { flex: 1 }]}>
                      {formatoFecha(p.fecha)} · <Text style={{ fontWeight: "700" }}>{pesos(Number(p.valor))}</Text> · {p.pagado_por}
                    </Text>
                    <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
                {d.pagos.some((p) => p.origen === "registro_inicial") && (
                  <Text style={styles.ayuda}>
                    {d.pagos.filter((p) => p.origen === "registro_inicial").length} cuota(s) quedaron pagadas en el registro inicial del crédito.
                  </Text>
                )}
              </View>
            )}

            {d.abonos.length > 0 && (
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.label}>Abonos extra</Text>
                {d.abonos.map((a) => (
                  <TouchableOpacity key={a.id} style={styles.cuotaRow} onPress={() => confirmarBorrarAbono(a)}>
                    <Text style={[styles.cuotaTexto, { flex: 1 }]}>
                      {formatoFecha(a.fecha)} · <Text style={{ fontWeight: "700" }}>{pesos(Number(a.valor))}</Text> ·{" "}
                      {a.modalidad === "plazo" ? "redujo el plazo" : "redujo la cuota"}
                      {a.registrado_por ? ` · ${a.registrado_por}` : ""}
                    </Text>
                    <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Deudas y créditos"
        subtitle={`${deudas.length} registrada(s)`}
        actionLabel="Nueva"
        onAction={abrirNueva}
        actionActive={mostrarForm && !editandoId}
      />

      {mostrarForm ? (
        renderFormulario()
      ) : cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando deudas: {error}</Text>
      ) : (
        <FlatList
          data={deudas}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay deudas registradas.</Text>}
          renderItem={({ item: d }) => renderDeuda(d)}
        />
      )}
    </View>
  );
}

function Accion({ icono, texto, onPress, color = colors.primary }: { icono: any; texto: string; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.accion}>
      <Ionicons name={icono} size={16} color={color} />
      <Text style={[styles.accionTexto, { color }]}>{texto}</Text>
    </TouchableOpacity>
  );
}

// ---------- Registrar pago de cuota ----------
function FormPago({
  deuda,
  personas,
  yo,
  onCerrar,
  registrar,
}: {
  deuda: DeudaConCuotas;
  personas: string[];
  yo: string;
  onCerrar: () => void;
  registrar: (id: string, valor: number, fecha: string, persona: string) => Promise<void>;
}) {
  const [valor, setValor] = useState(deuda.restanteProxima.toLocaleString("es-CO"));
  const [fecha, setFecha] = useState(hoyISO());
  const [persona, setPersona] = useState(yo || personas[0] || "");
  const [guardando, setGuardando] = useState(false);
  const c = deuda.proximaCuota;

  async function guardar() {
    const v = aNumero(valor);
    if (!(v > 0)) return Alert.alert("Valor no válido", "Escribe el valor pagado.");
    if (!esFechaValida(fecha)) return Alert.alert("Fecha no válida", "Escribe la fecha así: AAAA-MM-DD.");
    if (!persona) return Alert.alert("Falta quién pagó", "Elige quién hizo el pago.");
    setGuardando(true);
    try {
      await registrar(deuda.id, v, fecha, persona);
      onCerrar();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el pago.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.abonoBox}>
      <Text style={typography.h3}>Registrar pago</Text>
      {c && (
        <Text style={styles.ayuda}>
          Cuota #{c.numero_cuota} vence {formatoFecha(c.fecha_vencimiento)} · falta {pesos(deuda.restanteProxima)}. Si pagas más, el excedente pasa a la siguiente cuota.
        </Text>
      )}
      <Text style={styles.label}>¿Quién pagó?</Text>
      <View style={styles.chips}>
        {(personas.length ? personas : [yo]).filter(Boolean).map((p) => (
          <TouchableOpacity key={p} onPress={() => setPersona(p)} style={[styles.chip, persona === p && styles.chipActivo]}>
            <Text style={[styles.chipTexto, persona === p && styles.chipTextoActivo]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.ayuda, { marginTop: 4 }]}>Si la pagó un arriendo, regístralo en Propiedades y elige este crédito como destino.</Text>
      <Text style={styles.label}>Valor pagado</Text>
      <TextInput style={styles.input} value={valor} onChangeText={setValor} keyboardType="numeric" placeholder="Valor" placeholderTextColor={colors.textMuted} />
      <Text style={styles.label}>Fecha del pago</Text>
      <TextInput style={styles.input} value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" placeholderTextColor={colors.textMuted} />
      <Text style={styles.ayuda}>Queda también como gasto (rubro Créditos) a nombre de quien pagó.</Text>
      <PrimaryButton title="Guardar pago" onPress={guardar} loading={guardando} />
      <PrimaryButton title="Cancelar" variant="outline" onPress={onCerrar} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

// ---------- Abono extra con vista previa ----------
function FormAbono({
  deuda,
  onCerrar,
  registrar,
}: {
  deuda: DeudaConCuotas;
  onCerrar: () => void;
  registrar: (id: string, valor: number, fecha: string, modalidad: "plazo" | "cuota", nota?: string) => Promise<void>;
}) {
  const [valor, setValor] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [modalidad, setModalidad] = useState<"plazo" | "cuota">("plazo");
  const [guardando, setGuardando] = useState(false);

  const pendientes = deuda.cuotas.filter((c) => c.estado === "pendiente");
  const proxima = pendientes[0];

  const simulacion = useMemo(() => {
    const v = aNumero(valor);
    if (!(v > 0) || !proxima || v > deuda.saldoActual) return null;
    const base = {
      saldo: deuda.saldoActual - v,
      iMensual: deuda.iMensual,
      seguroMensual: Number(deuda.seguro_mensual ?? 0),
      fechaPrimerPago: deuda.primerPago,
      diaPago: deuda.dia_pago,
      numeroInicial: proxima.numero_cuota,
    };
    try {
      const porPlazo = generarCuotas({ ...base, cuotaObjetivo: Number(proxima.capital) + Number(proxima.interes) });
      const porCuota = generarCuotas({ ...base, cuotasRestantes: pendientes.length });
      const intActual = pendientes.reduce((s, c) => s + Number(c.interes), 0);
      return {
        plazo: {
          cuotas: porPlazo.length,
          fin: porPlazo[porPlazo.length - 1]?.fecha_vencimiento,
          ahorro: intActual - porPlazo.reduce((s, c) => s + c.interes, 0),
        },
        cuota: {
          nueva: porCuota[0]?.cuota_total ?? 0,
          ahorro: intActual - porCuota.reduce((s, c) => s + c.interes, 0),
        },
      };
    } catch {
      return null;
    }
  }, [valor, deuda, proxima, pendientes]);

  async function guardar() {
    const v = aNumero(valor);
    if (!(v > 0)) {
      Alert.alert("Valor no válido", "Escribe el valor del abono.");
      return;
    }
    if (!esFechaValida(fecha)) {
      Alert.alert("Fecha no válida", "Escribe la fecha así: AAAA-MM-DD.");
      return;
    }
    setGuardando(true);
    try {
      await registrar(deuda.id, v, fecha, modalidad);
      onCerrar();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el abono.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.abonoBox}>
      <Text style={typography.h3}>Abono extra a capital</Text>
      <Text style={styles.ayuda}>Saldo actual: {pesos(deuda.saldoActual)}</Text>
      <TextInput style={styles.input} placeholder="Valor del abono (ej. 5.000.000)" placeholderTextColor={colors.textMuted} value={valor} onChangeText={setValor} keyboardType="numeric" />
      <TextInput style={styles.input} placeholder="Fecha AAAA-MM-DD" placeholderTextColor={colors.textMuted} value={fecha} onChangeText={setFecha} />

      <TouchableOpacity style={[styles.opcion, modalidad === "plazo" && styles.opcionActiva]} onPress={() => setModalidad("plazo")}>
        <Ionicons name={modalidad === "plazo" ? "radio-button-on" : "radio-button-off"} size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.opcionTitulo}>Reducir el plazo (misma cuota, terminas antes)</Text>
          {simulacion && (
            <Text style={styles.opcionDetalle}>
              Quedan {simulacion.plazo.cuotas} cuotas (antes {pendientes.length})
              {simulacion.plazo.fin ? ` · terminas ${formatoFecha(simulacion.plazo.fin)}` : ""} · ahorras {pesos(simulacion.plazo.ahorro)} en intereses
            </Text>
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.opcion, modalidad === "cuota" && styles.opcionActiva]} onPress={() => setModalidad("cuota")}>
        <Ionicons name={modalidad === "cuota" ? "radio-button-on" : "radio-button-off"} size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.opcionTitulo}>Reducir la cuota (mismo plazo, pagas menos al mes)</Text>
          {simulacion && (
            <Text style={styles.opcionDetalle}>
              Nueva cuota {pesos(simulacion.cuota.nueva)} (antes {pesos(Number(proxima?.cuota_total ?? 0))}) · ahorras {pesos(simulacion.cuota.ahorro)} en intereses
            </Text>
          )}
        </View>
      </TouchableOpacity>

      <PrimaryButton title="Registrar abono" onPress={guardar} loading={guardando} style={{ marginTop: spacing.sm }} />
      <PrimaryButton title="Cancelar" variant="outline" onPress={onCerrar} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  form: { flex: 1 },
  label: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 4 },
  ayuda: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  inputError: { borderWidth: 1, borderColor: colors.danger },
  fila: { flexDirection: "row", alignItems: "center", gap: 8 },
  sufijo: { fontSize: 15, color: colors.textSecondary, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.background },
  chipActivo: { backgroundColor: colors.primary },
  chipTexto: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  chipTextoActivo: { color: colors.white },
  switchFila: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.sm },
  previa: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm },
  previaTitulo: { fontSize: 15, fontWeight: "800", color: colors.primary, marginBottom: 2 },
  previaTexto: { fontSize: 12, color: colors.textPrimary, marginBottom: 2 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowStart: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  iconoCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  pctText: { ...typography.h3, color: colors.primary },
  avisoBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: spacing.sm, backgroundColor: "#FCEFD9", padding: spacing.sm, borderRadius: radius.sm },
  avisoTexto: { fontSize: 12, color: colors.warning, fontWeight: "600", flex: 1 },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
  acciones: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.md },
  accion: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.background },
  accionTexto: { fontSize: 13, fontWeight: "600" },
  cuotaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  cuotaTexto: { fontSize: 13, color: colors.textPrimary },
  cuotaPagada: { color: colors.textSecondary },
  cuotaDetalle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pillWarning: { backgroundColor: "#FCEFD9" },
  pillSuccess: { backgroundColor: colors.primaryLight },
  pillText: { fontSize: 10, fontWeight: "700" },
  pillTextWarning: { color: colors.warning },
  pillTextSuccess: { color: colors.success },
  parcial: { fontSize: 11, color: colors.warning, fontWeight: "600", marginTop: 2 },
  abonoBox: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  opcion: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.xs },
  opcionActiva: { backgroundColor: colors.primaryLight },
  opcionTitulo: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  opcionDetalle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
});
