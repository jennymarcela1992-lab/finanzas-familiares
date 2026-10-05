import React, { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert, ScrollView, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDeudas, DeudaConCuotas, CuotaRow, AbonoRow, DatosDeuda } from "../../hooks/useDeudas";
import { usePersonas } from "../../hooks/usePersonas";
import { useActivos } from "../../hooks/useActivos";
import { PagoDeudaRow } from "../../utils/pagosDeuda";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import ProgressBar from "../../components/ProgressBar";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";
import { aNumero } from "../../utils/numeros";
import FechaInput from "../../components/FechaInput";
import TablaAmortizacion from "../../components/TablaAmortizacion";
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
  Frecuencia,
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
  vinculos: {} as Record<string, string>, // id de propiedad/vehículo -> % del crédito que le corresponde
  frecuencia: "mensual" as Frecuencia,
  automatico: "" as string, // persona desde cuya cuenta se debita la cuota ("" = no)
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
    registrarDesembolso,
    eliminarDesembolso,
    marcarPagadasHasta,
    deshacerYaPagadas,
    definirAbonoMensual,
    eliminarPeriodoAbono,
    desmarcarCuota,
  } = useDeudas();

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [marcarVencidas, setMarcarVencidas] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [deudaAbierta, setDeudaAbierta] = useState<string | null>(null);
  const [abonoEn, setAbonoEn] = useState<string | null>(null);
  const [pagoEn, setPagoEn] = useState<string | null>(null);
  const [aumentoEn, setAumentoEn] = useState<string | null>(null);
  const [cambioAbonoEn, setCambioAbonoEn] = useState<string | null>(null);
  const [vista, setVista] = useState<"tabla" | "lista" | "pagos">("tabla");
  const [yaPagadasEn, setYaPagadasEn] = useState<string | null>(null);
  const abrirPanel = (panel: "pago" | "abono" | "aumento" | "yaPagadas", id: string) => {
    setPagoEn(panel === "pago" && pagoEn !== id ? id : null);
    setAbonoEn(panel === "abono" && abonoEn !== id ? id : null);
    setAumentoEn(panel === "aumento" && aumentoEn !== id ? id : null);
    setYaPagadasEn(panel === "yaPagadas" && yaPagadasEn !== id ? id : null);
  };
  const { personas, yo } = usePersonas();
  const { activos } = useActivos();

  const cambiar = (campo: keyof typeof FORM_VACIO) => (v: string) => setForm((f) => ({ ...f, [campo]: v }));

  // ---------- Vista previa del formulario ----------
  const previa = useMemo(() => {
    const valor = aNumero(form.valor);
    const tasa = aNumero(form.tasa);
    const plazo = Math.round(aNumero(form.plazo));
    const seguro = aNumero(form.seguro) || 0;
    if (!(valor > 0) || !(tasa >= 0) || !(plazo > 0)) return null;
    return vistaPrevia(valor, tasa, form.tipoTasa, plazo, seguro, form.frecuencia);
  }, [form.valor, form.tasa, form.plazo, form.seguro, form.tipoTasa, form.frecuencia]);

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
      vinculos: Object.fromEntries(d.vinculos.map((v) => [v.activo_id, String(v.porcentaje).replace(".", ",")])),
      frecuencia: (d.frecuencia ?? "mensual") as Frecuencia,
      automatico: d.pago_automatico_por ?? "",
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
    const sumaPct = Object.values(form.vinculos).reduce((t, v) => t + (aNumero(v) || 0), 0);
    if (sumaPct > 100.01) {
      Alert.alert("Porcentajes", `Los porcentajes del crédito suman ${sumaPct}%. No pueden pasar de 100%.`);
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
      vinculos: Object.entries(form.vinculos)
        .map(([id, pct]) => ({ a: activos.find((x) => x.id === id), pct: aNumero(pct) }))
        .filter((x) => x.a && x.pct > 0)
        .map((x) => ({ tipo: x.a!.tipo, activoId: x.a!.id, porcentaje: x.pct })),
      frecuencia: form.frecuencia,
      pagoAutomaticoPor: form.automatico || null,
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
      const deuda = deudas.find((x) => x.id === c.deuda_id);
      Alert.alert(
        `Cuota #${c.numero_cuota} pagada`,
        `Pagó: ${c.pagada_por ?? "—"}${c.fecha_pago ? ` · ${formatoFecha(c.fecha_pago)}` : ""}\n\n¿Quieres desmarcarla? Se borra el pago que la cubrió (y su gasto, si tiene). También puedes verlos en la pestaña "Pagos".`,
        [
          { text: "Dejarla pagada", style: "cancel" },
          { text: "Desmarcar", style: "destructive", onPress: () => deuda && desmarcarCuota(deuda.id, c).catch((e) => Alert.alert("Error", e.message)) },
        ]
      );
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

          <Text style={styles.label}>¿Cada cuánto se paga la cuota?</Text>
          <View style={styles.chips}>
            {(["mensual", "quincenal"] as const).map((fr) => (
              <TouchableOpacity key={fr} onPress={() => setForm((f) => ({ ...f, frecuencia: fr }))} style={[styles.chip, form.frecuencia === fr && styles.chipActivo]}>
                <Text style={[styles.chipTexto, form.frecuencia === fr && styles.chipTextoActivo]}>{fr === "mensual" ? "Mensual" : "Quincenal"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {form.frecuencia === "quincenal" && (
            <Text style={styles.ayuda}>Dos cuotas al mes (ej. 15 y 30). La tasa se convierte a su equivalente quincenal.</Text>
          )}

          <Text style={styles.label}>Plazo total (número de cuotas{form.frecuencia === "quincenal" ? ", quincenas" : ""})</Text>
          <TextInput style={styles.input} placeholder="Ej. 60" placeholderTextColor={colors.textMuted} value={form.plazo} onChangeText={cambiar("plazo")} keyboardType="numeric" />

          <Text style={styles.label}>Seguros y otros cobros fijos por mes (opcional)</Text>
          <TextInput style={styles.input} placeholder="Ej. 85.000" placeholderTextColor={colors.textMuted} value={form.seguro} onChangeText={cambiar("seguro")} keyboardType="numeric" />

          <Text style={styles.label}>Fecha de la primera cuota</Text>
          <FechaInput value={form.fechaPrimerPago} onChange={cambiar("fechaPrimerPago")} />
          <Text style={styles.ayuda}>Las siguientes cuotas vencen el mismo día cada mes.</Text>

          {!editandoId && fechaEnPasado && (
            <View style={styles.switchFila}>
              <Text style={[typography.body, { flex: 1 }]}>El crédito ya venía corriendo: marcar como pagadas las cuotas con fecha anterior a hoy</Text>
              <Switch value={marcarVencidas} onValueChange={setMarcarVencidas} trackColor={{ true: colors.primary }} />
            </View>
          )}

          {previa && (
            <View style={styles.previa}>
              <Text style={styles.previaTitulo}>Cuota {form.frecuencia} calculada: {pesos(previa.cuotaConSeguro)}</Text>
              <Text style={styles.previaTexto}>
                Capital + interés {pesos(previa.cuotaSinSeguro)}
                {previa.cuotaConSeguro !== previa.cuotaSinSeguro ? ` + seguros ${pesos(previa.cuotaConSeguro - previa.cuotaSinSeguro)}` : ""}
              </Text>
              <Text style={styles.previaTexto}>
                Tasa {form.frecuencia === "quincenal" ? "quincenal" : "mensual"} equivalente: {(previa.iMensual * 100).toLocaleString("es-CO", { maximumFractionDigits: 4 })}% · Intereses totales {pesos(previa.totalIntereses)}
              </Text>
              <Text style={styles.ayuda}>Compárala con la cuota de tu extracto. Si no coincide, revisa el tipo de tasa o el valor de seguros.</Text>
            </View>
          )}

          {editandoId && <Text style={styles.ayuda}>Al guardar, se recalculan las cuotas pendientes. Las cuotas ya pagadas no cambian.</Text>}

          {activos.length > 0 && (
            <>
              <Text style={[styles.label, { marginTop: spacing.sm }]}>¿A qué propiedades o vehículos corresponde este crédito? (puedes elegir varios)</Text>
              <View style={styles.chips}>
                {activos.map((a) => {
                  const sel = form.vinculos[a.id] !== undefined;
                  return (
                    <TouchableOpacity
                      key={a.id}
                      onPress={() =>
                        setForm((f) => {
                          const v = { ...f.vinculos };
                          if (sel) delete v[a.id];
                          else {
                            const usado = Object.values(v).reduce((t, x) => t + (aNumero(x) || 0), 0);
                            v[a.id] = String(Math.max(0, 100 - usado));
                          }
                          return { ...f, vinculos: v };
                        })
                      }
                      style={[styles.chip, sel && styles.chipActivo]}
                    >
                      <Text style={[styles.chipTexto, sel && styles.chipTextoActivo]}>
                        {a.nombre} ({a.tipo === "propiedad" ? "propiedad" : "vehículo"})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {Object.keys(form.vinculos).map((id) => (
                <View key={id} style={[styles.rowStart, { marginBottom: 6 }]}>
                  <Text style={[styles.ayuda, { flex: 1, marginBottom: 0 }]}>{activos.find((a) => a.id === id)?.nombre ?? "—"}</Text>
                  <TextInput
                    style={[styles.input, { width: 80, marginBottom: 0, textAlign: "right" }]}
                    value={form.vinculos[id]}
                    onChangeText={(t) => setForm((f) => ({ ...f, vinculos: { ...f.vinculos, [id]: t } }))}
                    keyboardType="decimal-pad"
                    placeholder="%"
                  />
                  <Text style={styles.ayuda}>%</Text>
                </View>
              ))}
              {Object.keys(form.vinculos).length > 0 &&
                (() => {
                  const suma = Object.values(form.vinculos).reduce((t, v) => t + (aNumero(v) || 0), 0);
                  return (
                    <Text style={[styles.ayuda, suma > 100.01 && { color: colors.danger }]}>
                      {suma > 100.01 ? `Suman ${suma}%: no puede pasar de 100%.` : suma < 99.99 ? `${Math.round((100 - suma) * 100) / 100}% del crédito no se asigna a ninguna (gasto del hogar).` : "100% asignado."}
                    </Text>
                  );
                })()}
              <Text style={styles.ayuda}>A cada propiedad o vehículo se le resta su porcentaje de las cuotas (rendimiento o costo), y el arriendo puede pagarlas directamente.</Text>
            </>
          )}

          <Text style={[styles.label, { marginTop: spacing.sm }]}>¿Es pago automático (débito)?</Text>
          <View style={styles.chips}>
            <TouchableOpacity onPress={() => setForm((f) => ({ ...f, automatico: "" }))} style={[styles.chip, !form.automatico && styles.chipActivo]}>
              <Text style={[styles.chipTexto, !form.automatico && styles.chipTextoActivo]}>No</Text>
            </TouchableOpacity>
            {personas.map((n) => (
              <TouchableOpacity key={n} onPress={() => setForm((f) => ({ ...f, automatico: n }))} style={[styles.chip, form.automatico === n && styles.chipActivo]}>
                <Text style={[styles.chipTexto, form.automatico === n && styles.chipTextoActivo]}>Desde {n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="O escribe el titular (ej. Jenny Marcela Morales Riveros)"
            placeholderTextColor={colors.textMuted}
            value={personas.includes(form.automatico) ? "" : form.automatico}
            onChangeText={(t) => setForm((f) => ({ ...f, automatico: t }))}
          />
          {!!form.automatico && (
            <Text style={styles.ayuda}>Cada cuota queda pagada sola el día que vence, como gasto a nombre de {form.automatico}. No hay que registrarla.</Text>
          )}

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
              <View style={{ flexShrink: 1 }}>
                <Text style={typography.h3}>{d.nombre}</Text>
                {d.vinculos.length > 0 && (
                  <Text style={typography.caption}>
                    {d.vinculos.map((v) => `${activos.find((a) => a.id === v.activo_id)?.nombre ?? (v.tipo === "propiedad" ? "Propiedad" : "Vehículo")} ${Math.round(v.porcentaje * 100) / 100}%`).join(" · ")}
                  </Text>
                )}
                <View style={styles.badges}>
                  {d.frecuencia === "quincenal" && <Text style={styles.badge}>Quincenal</Text>}
                  {!!d.pago_automatico_por && (
                    <Text style={[styles.badge, styles.badgeAuto]}>Débito automático desde {d.pago_automatico_por}</Text>
                  )}
                </View>
              </View>
            </View>
            <Text style={styles.pctText}>{Math.round(d.porcentajePagado * 100)}%</Text>
          </View>
          <View style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
            <ProgressBar progreso={d.porcentajePagado} />
          </View>
          <Text style={typography.caption}>
            Saldo {pesos(d.saldoActual)} de {pesos(d.montoTotal)} · {d.cuotasPagadas} de {d.cuotas.length} cuotas pagadas
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
                <Accion icono="checkmark-circle" texto="Registrar pago" onPress={() => abrirPanel("pago", d.id)} />
              )}
              {!terminada && <Accion icono="cash" texto="Abono extra" onPress={() => abrirPanel("abono", d.id)} />}
              {!terminada && <Accion icono="add-circle" texto="Aumentar préstamo" onPress={() => abrirPanel("aumento", d.id)} />}
              {d.proximaCuota && d.proximaCuota.fecha_vencimiento < hoyISO() && (
                <Accion icono="checkmark-done" texto="Cuotas ya pagadas" onPress={() => abrirPanel("yaPagadas", d.id)} />
              )}
              <Accion icono="create" texto="Editar" onPress={() => abrirEdicion(d)} />
              <Accion icono="trash" texto="Eliminar" color={colors.danger} onPress={() => confirmarEliminar(d)} />
            </View>

            {pagoEn === d.id && <FormPago deuda={d} personas={personas} yo={yo} onCerrar={() => setPagoEn(null)} registrar={registrarPago} />}
            {abonoEn === d.id && <FormAbono deuda={d} onCerrar={() => setAbonoEn(null)} registrar={registrarAbono} definirMensual={definirAbonoMensual} registrarPago={registrarPago} personas={personas} yo={yo} />}
            {yaPagadasEn === d.id && (
              <FormYaPagadas
                deuda={d}
                onCerrar={() => setYaPagadasEn(null)}
                marcar={marcarPagadasHasta}
                deshacer={deshacerYaPagadas}
              />
            )}
            {aumentoEn === d.id && <FormAumento deuda={d} onCerrar={() => setAumentoEn(null)} registrar={registrarDesembolso} />}
            {d.abonosPeriodos.length > 0 && (
              <View style={styles.fijoBox}>
                <Ionicons name="repeat" size={15} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fijoTexto}>
                    {d.abonoVigente > 0 ? `Abono fijo de ${pesos(d.abonoVigente)} en cada cuota` : "Sin abono fijo vigente"}
                  </Text>
                  {d.abonosPeriodos.map((p, idx) => (
                    <TouchableOpacity
                      key={p.id ?? idx}
                      onPress={() =>
                        p.id &&
                        Alert.alert("Borrar cambio", `¿Borrar el cambio a ${pesos(p.valor)} desde ${formatoFecha(p.desde)}? Las cuotas pendientes se recalculan.`, [
                          { text: "Cancelar", style: "cancel" },
                          { text: "Borrar", style: "destructive", onPress: () => eliminarPeriodoAbono(d.id, p.id!).catch((e) => Alert.alert("Error", e.message)) },
                        ])
                      }
                    >
                      <Text style={styles.fijoHist}>
                        Desde {p.desde.startsWith("0000") ? "el inicio" : formatoFecha(p.desde)}: {p.valor > 0 ? pesos(p.valor) : "sin abono"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ gap: 8, alignItems: "flex-end" }}>
                  <TouchableOpacity onPress={() => setCambioAbonoEn(cambioAbonoEn === d.id ? null : d.id)}>
                    <Text style={styles.fijoCambiar}>Cambiar valor</Text>
                  </TouchableOpacity>
                  {d.abonoVigente > 0 && (
                    <TouchableOpacity
                      onPress={() =>
                        Alert.alert("Quitar abono fijo", "¿Dejar de sumar el abono fijo desde la próxima cuota? Las cuotas ya pagadas no cambian.", [
                          { text: "Cancelar", style: "cancel" },
                          {
                            text: "Quitar",
                            style: "destructive",
                            onPress: () => definirAbonoMensual(d.id, 0, d.proximaCuota?.fecha_vencimiento ?? hoyISO()).catch((e) => Alert.alert("Error", e.message)),
                          },
                        ])
                      }
                    >
                      <Text style={styles.fijoQuitar}>Quitar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
            {cambioAbonoEn === d.id && <FormCambioAbono deuda={d} onCerrar={() => setCambioAbonoEn(null)} guardar={definirAbonoMensual} />}

            <View style={styles.vistaFila}>
              <Text style={[styles.label, { marginTop: spacing.md, flex: 1 }]}>Tabla de amortización</Text>
              <View style={styles.vistaChips}>
                {(["tabla", "lista", "pagos"] as const).map((v) => (
                  <TouchableOpacity key={v} onPress={() => setVista(v)} style={[styles.vistaChip, vista === v && styles.chipActivo]}>
                    <Ionicons name={v === "tabla" ? "grid-outline" : v === "lista" ? "list-outline" : "receipt-outline"} size={13} color={vista === v ? colors.white : colors.textSecondary} />
                    <Text style={[styles.chipTexto, { fontSize: 12 }, vista === v && styles.chipTextoActivo]}>{v === "tabla" ? "Tabla" : v === "lista" ? "Lista" : `Pagos (${d.pagos.length})`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <Text style={styles.ayuda}>Una cuota queda pagada cuando se registra su pago. Toca una cuota para ver el detalle.</Text>
            {vista === "pagos" ? (
              <View>
                {d.pagos.length === 0 && <Text style={styles.ayuda}>Todavía no hay pagos registrados en este crédito.</Text>}
                {d.pagos.map((p) => (
                  <TouchableOpacity key={p.id} style={styles.cuotaRow} onPress={() => confirmarBorrarPago(p)}>
                    <Ionicons
                      name={p.origen === "arriendo" ? "business" : p.origen === "registro_inicial" ? "checkmark-done" : p.origen === "prestamo" ? "people" : "person"}
                      size={14}
                      color={colors.primary}
                    />
                    <Text style={[styles.cuotaTexto, { flex: 1 }]}>
                      {formatoFecha(p.fecha)} · <Text style={{ fontWeight: "700" }}>{pesos(Number(p.valor))}</Text> · {p.pagado_por}
                      {p.origen === "registro_inicial" ? " (ya pagada antes de la app)" : ""}
                    </Text>
                    <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
                <Text style={styles.ayuda}>Toca un pago para borrarlo; la cuota vuelve a quedar pendiente si ya no está cubierta.</Text>
              </View>
            ) : vista === "tabla" ? (
              <TablaAmortizacion deuda={d} onTocarCuota={tocarCuota} />
            ) : (
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
                        {Number(c.seguro) ? ` · Seguros ${pesos(Number(c.seguro))}` : ""}
                        {Number(c.abono_extra) ? ` · Abono fijo ${pesos(Number(c.abono_extra))}` : ""} · Saldo {pesos(Number(c.saldo))}
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
            )}

            {d.desembolsos.length > 0 && (
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.label}>Aumentos del préstamo</Text>
                {d.desembolsos.map((x) => (
                  <TouchableOpacity
                    key={x.id}
                    style={styles.cuotaRow}
                    onPress={() =>
                      Alert.alert("Borrar aumento", `¿Borrar el aumento de ${pesos(Number(x.valor))} del ${formatoFecha(x.fecha)}? Las cuotas se recalculan.`, [
                        { text: "Cancelar", style: "cancel" },
                        { text: "Borrar", style: "destructive", onPress: () => eliminarDesembolso(x).catch((e) => Alert.alert("Error", e.message)) },
                      ])
                    }
                  >
                    <Ionicons name="add-circle" size={14} color={colors.primary} />
                    <Text style={[styles.cuotaTexto, { flex: 1 }]}>
                      {formatoFecha(x.fecha)} · <Text style={{ fontWeight: "700" }}>+{pesos(Number(x.valor))}</Text> ·{" "}
                      {x.mantiene === "cuota" ? "mantuvo la cuota" : "mantuvo el plazo"}
                      {x.nota ? ` · ${x.nota}` : ""}
                    </Text>
                    <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
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
      <FechaInput value={fecha} onChange={setFecha} max={hoyISO()} />
      <Text style={styles.ayuda}>Queda también como gasto (rubro Créditos) a nombre de quien pagó.</Text>
      <PrimaryButton title="Guardar pago" onPress={guardar} loading={guardando} />
      <PrimaryButton title="Cancelar" variant="outline" onPress={onCerrar} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

// ---------- Abono extra con vista previa ----------
/** Cuota base vigente (capital + interés), sin seguros ni abonos fijos. */
function cuotaBase(pendientes: CuotaRow[]) {
  return pendientes.length ? Number(pendientes[0].capital) + Number(pendientes[0].interes) : 0;
}

function simular(deuda: DeudaConCuotas, saldo: number, extra: { cuotaObjetivo?: number; cuotasRestantes?: number; abonoMensual?: number; abonoDesde?: string | null }) {
  // si se simula un abono fijo nuevo, se agrega como un periodo más desde su fecha
  const periodos = extra.abonoMensual !== undefined ? [...deuda.abonosPeriodos, { desde: extra.abonoDesde ?? hoyISO(), valor: extra.abonoMensual }] : deuda.abonosPeriodos;
  const pendientes = deuda.cuotas.filter((c) => c.estado === "pendiente");
  const proxima = pendientes[0];
  if (!proxima) return null;
  try {
    const filas = generarCuotas({
      saldo,
      iMensual: deuda.iMensual,
      seguroMensual: Number(deuda.seguro_mensual ?? 0),
      fechaPrimerPago: deuda.primerPago,
      diaPago: deuda.dia_pago,
      numeroInicial: proxima.numero_cuota,
      abonoPeriodos: periodos,
      frecuencia: deuda.frecuencia ?? "mensual",
      cuotaObjetivo: extra.cuotaObjetivo,
      cuotasRestantes: extra.cuotasRestantes,
    });
    const intActual = pendientes.reduce((s, c) => s + Number(c.interes), 0);
    const intNuevo = filas.reduce((s, c) => s + c.interes, 0);
    return {
      cuotas: filas.length,
      fin: filas[filas.length - 1]?.fecha_vencimiento,
      cuotaNueva: filas[0] ? filas[0].capital + filas[0].interes + filas[0].seguro : 0,
      difIntereses: intActual - intNuevo, // positivo = ahorro; negativo = intereses adicionales
    };
  } catch (e: any) {
    return { error: e.message as string };
  }
}

// ---------- Abono extra (solo este mes o cada mes) con vista previa ----------
function FormAbono({
  deuda,
  onCerrar,
  registrar,
  definirMensual,
  registrarPago,
  personas,
  yo,
}: {
  deuda: DeudaConCuotas;
  onCerrar: () => void;
  registrar: (id: string, valor: number, fecha: string, modalidad: "plazo" | "cuota", nota?: string) => Promise<void>;
  definirMensual: (id: string, valor: number, desde: string | null) => Promise<void>;
  registrarPago: (id: string, valor: number, fecha: string, persona: string) => Promise<void>;
  personas: string[];
  yo: string;
}) {
  const pendientes = deuda.cuotas.filter((c) => c.estado === "pendiente");
  const proxima = pendientes[0];
  const [frecuencia, setFrecuencia] = useState<"una" | "mensual">("una");
  const [valor, setValor] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [desde, setDesde] = useState(proxima?.fecha_vencimiento ?? hoyISO());
  const [modalidad, setModalidad] = useState<"plazo" | "cuota">("plazo");
  const [destino, setDestino] = useState<"capital" | "cuotas">("capital");
  const [persona, setPersona] = useState(yo || personas[0] || "");
  const [guardando, setGuardando] = useState(false);
  const base = cuotaBase(pendientes);
  const cuotaActual = proxima ? Number(proxima.capital) + Number(proxima.interes) + Number(proxima.seguro ?? 0) : 0;
  const totalPendiente = pendientes.reduce((s, c) => s + Number(c.cuota_total) - Number(c.valor_pagado ?? 0), 0);

  // Adelanto: cómo se reparte el valor entre las próximas cuotas
  const reparto = useMemo(() => {
    let resto = aNumero(valor) || 0;
    const filas: { numero: number; fecha: string; aplicado: number; completa: boolean }[] = [];
    for (const c of pendientes) {
      if (resto <= 0) break;
      const falta = Number(c.cuota_total) - Number(c.valor_pagado ?? 0);
      const aplicado = Math.min(resto, falta);
      filas.push({ numero: c.numero_cuota, fecha: c.fecha_vencimiento, aplicado, completa: aplicado >= falta - 1 });
      resto -= aplicado;
    }
    return filas;
  }, [valor, pendientes]);

  const sim = useMemo(() => {
    const v = aNumero(valor);
    if (!(v > 0) || !proxima) return null;
    if (frecuencia === "mensual") {
      return { mensual: simular(deuda, deuda.saldoActual, { cuotaObjetivo: base, abonoMensual: v, abonoDesde: desde }) };
    }
    if (v > deuda.saldoActual) return null;
    return {
      plazo: simular(deuda, deuda.saldoActual - v, { cuotaObjetivo: base }),
      cuota: simular(deuda, deuda.saldoActual - v, { cuotasRestantes: Math.max(1, Number(deuda.plazo_meses) - deuda.cuotasPagadas) }),
    };
  }, [valor, frecuencia, desde, deuda]);

  async function guardar() {
    const v = aNumero(valor);
    if (!(v > 0)) return Alert.alert("Valor no válido", "Escribe el valor del abono.");
    const adelanto = frecuencia === "una" && destino === "cuotas";
    if (adelanto && v > totalPendiente) return Alert.alert("Valor no válido", `Supera lo que falta por pagar de todas las cuotas (${pesos(totalPendiente)}).`);
    if (adelanto && !persona) return Alert.alert("Falta quién pagó", "Elige quién hizo el abono.");
    setGuardando(true);
    try {
      if (frecuencia === "mensual") await definirMensual(deuda.id, v, desde);
      else if (adelanto) await registrarPago(deuda.id, v, fecha, persona);
      else await registrar(deuda.id, v, fecha, modalidad);
      onCerrar();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el abono.");
    } finally {
      setGuardando(false);
    }
  }

  const textoSim = (r: any) =>
    !r ? null : r.error ? r.error : `Quedan ${r.cuotas} cuotas (antes ${pendientes.length})${r.fin ? ` · terminas ${formatoFecha(r.fin)}` : ""} · ahorras ${pesos(r.difIntereses)} en intereses`;

  return (
    <View style={styles.abonoBox}>
      <Text style={typography.h3}>Abono extra</Text>
      <Text style={styles.ayuda}>Saldo actual: {pesos(deuda.saldoActual)}</Text>

      <Text style={styles.label}>¿Es solo para este mes o para cada mes?</Text>
      <View style={styles.chips}>
        {[
          { v: "una", t: "Solo este mes" },
          { v: "mensual", t: "Cada mes (fijo)" },
        ].map((o) => (
          <TouchableOpacity key={o.v} onPress={() => setFrecuencia(o.v as any)} style={[styles.chip, frecuencia === o.v && styles.chipActivo]}>
            <Text style={[styles.chipTexto, frecuencia === o.v && styles.chipTextoActivo]}>{o.t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.label, { marginTop: spacing.sm }]}>{frecuencia === "mensual" ? "Valor que abonas cada mes" : "Valor del abono"}</Text>
      <TextInput style={styles.input} placeholder={frecuencia === "mensual" ? "Ej. 300.000" : "Ej. 5.000.000"} placeholderTextColor={colors.textMuted} value={valor} onChangeText={setValor} keyboardType="numeric" />

      {frecuencia === "una" ? (
        <>
          <Text style={styles.label}>Fecha del abono</Text>
          <FechaInput value={fecha} onChange={setFecha} max={hoyISO()} />

          <Text style={styles.label}>¿A dónde va el abono?</Text>
          <View style={styles.chips}>
            {[
              { v: "capital", t: "Directo a capital" },
              { v: "cuotas", t: "A la(s) siguiente(s) cuota(s)" },
            ].map((o) => (
              <TouchableOpacity key={o.v} onPress={() => setDestino(o.v as any)} style={[styles.chip, destino === o.v && styles.chipActivo]}>
                <Text style={[styles.chipTexto, destino === o.v && styles.chipTextoActivo]}>{o.t}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.ayuda, { marginTop: 4 }]}>
            {destino === "capital"
              ? "Baja el saldo de la deuda y se recalcula la tabla: ahorras intereses."
              : "Es un adelanto: paga por anticipado las próximas cuotas tal como están en la tabla. No cambia la tabla ni los intereses."}
          </Text>

          {destino === "cuotas" ? (
            <View>
              <Text style={styles.label}>¿Quién pagó?</Text>
              <View style={styles.chips}>
                {(personas.length ? personas : [yo]).filter(Boolean).map((p) => (
                  <TouchableOpacity key={p} onPress={() => setPersona(p)} style={[styles.chip, persona === p && styles.chipActivo]}>
                    <Text style={[styles.chipTexto, persona === p && styles.chipTextoActivo]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {reparto.length > 0 && (
                <View style={[styles.opcion, styles.opcionActiva, { marginTop: spacing.sm }]}>
                  <Ionicons name="calendar" size={18} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.opcionTitulo}>Así se aplica el adelanto</Text>
                    {reparto.map((r) => (
                      <Text key={r.numero} style={styles.opcionDetalle}>
                        Cuota #{r.numero} ({formatoFecha(r.fecha)}): {pesos(r.aplicado)} {r.completa ? "· queda pagada" : "· queda parcial"}
                      </Text>
                    ))}
                    {(aNumero(valor) || 0) > totalPendiente && <Text style={[styles.opcionDetalle, { color: colors.danger }]}>Supera lo que falta por pagar.</Text>}
                  </View>
                </View>
              )}
              <Text style={styles.ayuda}>Queda también como gasto (rubro Créditos) a nombre de quien pagó.</Text>
            </View>
          ) : (
          <>
          <TouchableOpacity style={[styles.opcion, modalidad === "plazo" && styles.opcionActiva]} onPress={() => setModalidad("plazo")}>
            <Ionicons name={modalidad === "plazo" ? "radio-button-on" : "radio-button-off"} size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.opcionTitulo}>Reducir el plazo (misma cuota, terminas antes)</Text>
              {sim?.plazo && <Text style={styles.opcionDetalle}>{textoSim(sim.plazo)}</Text>}
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.opcion, modalidad === "cuota" && styles.opcionActiva]} onPress={() => setModalidad("cuota")}>
            <Ionicons name={modalidad === "cuota" ? "radio-button-on" : "radio-button-off"} size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.opcionTitulo}>Reducir la cuota (mismo plazo, pagas menos al mes)</Text>
              {sim?.cuota && !("error" in sim.cuota && sim.cuota.error) && (
                <Text style={styles.opcionDetalle}>
                  Nueva cuota {pesos((sim.cuota as any).cuotaNueva)} (antes {pesos(cuotaActual)}) · ahorras {pesos((sim.cuota as any).difIntereses)} en intereses
                </Text>
              )}
            </View>
          </TouchableOpacity>
          </>
          )}
        </>
      ) : (
        <>
          <Text style={styles.label}>Desde la cuota que vence</Text>
          <FechaInput value={desde} onChange={setDesde} />
          <View style={[styles.opcion, styles.opcionActiva]}>
            <Ionicons name="repeat" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.opcionTitulo}>Va directo a capital: se suma a cada cuota y acorta el plazo</Text>
              <Text style={styles.opcionDetalle}>
                Cada mes pagarás {pesos(cuotaActual)} + {pesos(aNumero(valor) || 0)} de abono. {sim?.mensual ? textoSim(sim.mensual) : ""}
              </Text>
              {deuda.abonoVigente > 0 && (
                <Text style={styles.opcionDetalle}>Reemplaza el abono fijo actual de {pesos(deuda.abonoVigente)} desde esa fecha.</Text>
              )}
            </View>
          </View>
        </>
      )}

      <PrimaryButton title={frecuencia === "mensual" ? "Guardar abono mensual" : destino === "cuotas" ? "Registrar adelanto" : "Registrar abono a capital"} onPress={guardar} loading={guardando} style={{ marginTop: spacing.sm }} />
      <PrimaryButton title="Cancelar" variant="outline" onPress={onCerrar} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

// ---------- Cambiar el valor del abono fijo ----------
function FormCambioAbono({ deuda, onCerrar, guardar }: { deuda: DeudaConCuotas; onCerrar: () => void; guardar: (id: string, valor: number, desde: string | null) => Promise<void> }) {
  const [valor, setValor] = useState(deuda.abonoVigente ? Math.round(deuda.abonoVigente).toLocaleString("es-CO") : "");
  const [desde, setDesde] = useState(deuda.proximaCuota?.fecha_vencimiento ?? hoyISO());
  const [guardando, setGuardando] = useState(false);
  const pendientes = deuda.cuotas.filter((c) => c.estado === "pendiente");
  const v = aNumero(valor);
  const sim = v >= 0 && pendientes.length ? simular(deuda, deuda.saldoActual, { cuotaObjetivo: cuotaBase(pendientes), abonoMensual: v || 0, abonoDesde: desde }) : null;
  return (
    <View style={styles.abonoBox}>
      <Text style={typography.h3}>Cambiar el abono fijo</Text>
      <Text style={styles.ayuda}>Las cuotas antes de la fecha conservan el valor anterior ({pesos(deuda.abonoVigente)}).</Text>
      <Text style={styles.label}>Nuevo valor por cuota</Text>
      <TextInput style={styles.input} value={valor} onChangeText={setValor} keyboardType="numeric" placeholder="Ej. 1.000.000" placeholderTextColor={colors.textMuted} />
      <Text style={styles.label}>Desde la cuota que vence</Text>
      <FechaInput value={desde} onChange={setDesde} />
      {sim && !(sim as any).error && (
        <Text style={styles.opcionDetalle}>
          Quedan {(sim as any).cuotas} cuotas (antes {pendientes.length}){(sim as any).fin ? ` · terminas ${formatoFecha((sim as any).fin)}` : ""}
          {(sim as any).difIntereses > 0 ? ` · ahorras ${pesos((sim as any).difIntereses)} en intereses` : ""}
        </Text>
      )}
      <PrimaryButton
        title="Guardar nuevo valor"
        loading={guardando}
        style={{ marginTop: spacing.sm }}
        onPress={async () => {
          if (!(v >= 0)) return Alert.alert("Valor no válido", "Escribe el nuevo abono (0 para quitarlo).");
          setGuardando(true);
          try {
            await guardar(deuda.id, v, desde);
            onCerrar();
          } catch (e: any) {
            Alert.alert("Error", e.message);
          } finally {
            setGuardando(false);
          }
        }}
      />
      <PrimaryButton title="Cancelar" variant="outline" onPress={onCerrar} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

// ---------- Cuotas que ya se pagaron antes de usar la app ----------
function ultimoDiaMesAnterior() {
  const [a, m] = hoyISO().split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, 0));
  return d.toISOString().slice(0, 10);
}

function FormYaPagadas({
  deuda,
  onCerrar,
  marcar,
  deshacer,
}: {
  deuda: DeudaConCuotas;
  onCerrar: () => void;
  marcar: (id: string, hasta: string) => Promise<number>;
  deshacer: (id: string) => Promise<void>;
}) {
  const [hasta, setHasta] = useState(ultimoDiaMesAnterior());
  const [guardando, setGuardando] = useState(false);
  const afectadas = deuda.cuotas.filter((c) => c.estado === "pendiente" && c.fecha_vencimiento <= hasta);
  const hayIniciales = deuda.pagos.some((p) => p.origen === "registro_inicial");

  async function guardar() {
    if (!afectadas.length) return Alert.alert("Nada que marcar", "No hay cuotas pendientes hasta esa fecha.");
    setGuardando(true);
    try {
      const n = await marcar(deuda.id, hasta);
      Alert.alert("Listo", `${n} cuota(s) quedaron como pagadas.`);
      onCerrar();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudieron marcar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={styles.abonoBox}>
      <Text style={typography.h3}>Cuotas ya pagadas</Text>
      <Text style={styles.ayuda}>
        Para cuotas que se pagaron antes de usar la app. Quedan como pagadas sin crear gastos ni sumar en el Resumen, así que no afectan nada más.
      </Text>
      <Text style={styles.label}>Marcar pagadas todas las cuotas que vencen hasta</Text>
      <FechaInput value={hasta} onChange={setHasta} max={hoyISO()} />
      <View style={[styles.opcion, styles.opcionActiva]}>
        <Ionicons name="checkmark-done" size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.opcionTitulo}>
            {afectadas.length ? `${afectadas.length} cuota(s): de la #${afectadas[0].numero_cuota} a la #${afectadas[afectadas.length - 1].numero_cuota}` : "No hay cuotas pendientes hasta esa fecha"}
          </Text>
          {afectadas.length > 0 && (
            <Text style={styles.opcionDetalle}>
              {formatoFecha(afectadas[0].fecha_vencimiento)} a {formatoFecha(afectadas[afectadas.length - 1].fecha_vencimiento)} · total {pesos(afectadas.reduce((s, c) => s + Number(c.cuota_total) - Number(c.valor_pagado ?? 0), 0))}
            </Text>
          )}
        </View>
      </View>
      <Text style={styles.ayuda}>
        Consejo: si el crédito tuvo aumentos o abonos en esos meses, regístralos primero (con su fecha) y luego marca las cuotas, así la tabla queda igual a la del prestamista.
      </Text>
      <PrimaryButton title="Marcar como pagadas" onPress={guardar} loading={guardando} />
      {hayIniciales && (
        <TouchableOpacity
          style={{ marginTop: spacing.md, alignItems: "center" }}
          onPress={() =>
            Alert.alert("Deshacer", "¿Volver a dejar pendientes las cuotas marcadas como ya pagadas antes de la app?", [
              { text: "Cancelar", style: "cancel" },
              { text: "Deshacer", style: "destructive", onPress: () => deshacer(deuda.id).catch((e) => Alert.alert("Error", e.message)) },
            ])
          }
        >
          <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "600" }}>Deshacer las cuotas marcadas como ya pagadas</Text>
        </TouchableOpacity>
      )}
      <PrimaryButton title="Cancelar" variant="outline" onPress={onCerrar} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

// ---------- Aumentar el préstamo ----------
function FormAumento({
  deuda,
  onCerrar,
  registrar,
}: {
  deuda: DeudaConCuotas;
  onCerrar: () => void;
  registrar: (id: string, valor: number, fecha: string, mantiene: "cuota" | "plazo", nota?: string) => Promise<void>;
}) {
  const pendientes = deuda.cuotas.filter((c) => c.estado === "pendiente");
  const proxima = pendientes[0];
  const [valor, setValor] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [mantiene, setMantiene] = useState<"cuota" | "plazo">("cuota");
  const [guardando, setGuardando] = useState(false);
  const base = cuotaBase(pendientes);
  const cuotaActual = proxima ? Number(proxima.capital) + Number(proxima.interes) + Number(proxima.seguro ?? 0) : 0;

  const sim = useMemo(() => {
    const v = aNumero(valor);
    if (!(v > 0) || !proxima) return null;
    return {
      cuota: simular(deuda, deuda.saldoActual + v, { cuotaObjetivo: base }),
      plazo: simular(deuda, deuda.saldoActual + v, { cuotasRestantes: Math.max(1, Number(deuda.plazo_meses) - deuda.cuotasPagadas) }),
    };
  }, [valor, deuda]);

  async function guardar() {
    const v = aNumero(valor);
    if (!(v > 0)) return Alert.alert("Valor no válido", "Escribe cuánto aumenta el préstamo.");
    const elegido: any = mantiene === "cuota" ? sim?.cuota : sim?.plazo;
    if (elegido?.error) return Alert.alert("No es posible", `${elegido.error} Elige "Mantener el plazo" o aumenta la cuota.`);
    setGuardando(true);
    try {
      await registrar(deuda.id, v, fecha, mantiene, nota.trim() || undefined);
      onCerrar();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el aumento.");
    } finally {
      setGuardando(false);
    }
  }

  const c: any = sim?.cuota;
  const p: any = sim?.plazo;
  return (
    <View style={styles.abonoBox}>
      <Text style={typography.h3}>Aumentar el préstamo</Text>
      <Text style={styles.ayuda}>Saldo actual: {pesos(deuda.saldoActual)}. Usa esto cuando te prestan más dinero sobre este mismo crédito.</Text>
      <Text style={styles.label}>Valor del aumento</Text>
      <TextInput style={styles.input} placeholder="Ej. 10.000.000" placeholderTextColor={colors.textMuted} value={valor} onChangeText={setValor} keyboardType="numeric" />
      <Text style={styles.label}>Fecha en que recibieron el dinero</Text>
      <FechaInput value={fecha} onChange={setFecha} />
      <TextInput style={styles.input} placeholder="Nota (opcional, ej. para el carro)" placeholderTextColor={colors.textMuted} value={nota} onChangeText={setNota} />

      <TouchableOpacity style={[styles.opcion, mantiene === "cuota" && styles.opcionActiva]} onPress={() => setMantiene("cuota")}>
        <Ionicons name={mantiene === "cuota" ? "radio-button-on" : "radio-button-off"} size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.opcionTitulo}>Mantener la cuota (aumenta el plazo)</Text>
          {c && (
            <Text style={styles.opcionDetalle}>
              {c.error
                ? c.error
                : `Sigues pagando ${pesos(cuotaActual)} · quedan ${c.cuotas} cuotas (antes ${pendientes.length})${c.fin ? ` · terminas ${formatoFecha(c.fin)}` : ""} · intereses adicionales ${pesos(-c.difIntereses)}`}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.opcion, mantiene === "plazo" && styles.opcionActiva]} onPress={() => setMantiene("plazo")}>
        <Ionicons name={mantiene === "plazo" ? "radio-button-on" : "radio-button-off"} size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.opcionTitulo}>Mantener el plazo (sube la cuota)</Text>
          {p && !p.error && (
            <Text style={styles.opcionDetalle}>
              Nueva cuota {pesos(p.cuotaNueva)} (antes {pesos(cuotaActual)}){p.fin ? ` · terminas ${formatoFecha(p.fin)}` : ""} · intereses adicionales {pesos(-p.difIntereses)}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      <PrimaryButton title="Registrar aumento y recalcular" onPress={guardar} loading={guardando} style={{ marginTop: spacing.sm }} />
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
  vistaFila: { flexDirection: "row", alignItems: "center", gap: 8 },
  vistaChips: { flexDirection: "row", gap: 6, marginTop: spacing.md },
  vistaChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.background },
  fijoBox: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md, backgroundColor: colors.primaryLight, borderRadius: radius.sm, padding: spacing.sm },
  fijoTexto: { flex: 1, fontSize: 12, color: colors.primary, fontWeight: "600" },
  fijoHist: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  fijoCambiar: { fontSize: 12, color: colors.primary, fontWeight: "700" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  badge: { fontSize: 10, fontWeight: "700", color: colors.primary, backgroundColor: colors.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  badgeAuto: { color: colors.success, backgroundColor: "#E3F3EC" },
  fijoQuitar: { fontSize: 12, color: colors.danger, fontWeight: "700" },
  abonoBox: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  opcion: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.xs },
  opcionActiva: { backgroundColor: colors.primaryLight },
  opcionTitulo: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  opcionDetalle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
});
