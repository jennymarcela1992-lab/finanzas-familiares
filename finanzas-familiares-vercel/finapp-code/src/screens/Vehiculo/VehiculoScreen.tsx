import React, { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, Modal, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useVehiculos, VehiculoConResumen, NOMBRES_DIAS, diasDelMes, rentabilidad, DiaVehiculo } from "../../hooks/useVehiculos";
import { useGastos } from "../../hooks/useGastos";
import { usePersonas } from "../../hooks/usePersonas";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import FechaInput from "../../components/FechaInput";
import { colors, spacing, typography, radius } from "../../theme/theme";
import { aNumero } from "../../utils/numeros";
import { formatoFecha, pesos, hoyISO, sumarMeses } from "../../utils/amortizacion";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const corto = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

const COLOR_DIA: Record<string, { bg: string; fg: string }> = {
  pagado: { bg: "#E3F3EC", fg: "#1F7A55" },
  parcial: { bg: "#FCEFD9", fg: "#A9600F" },
  de_mas: { bg: "#E3EAF3", fg: "#0A2E5C" },
  no_pagado: { bg: "#FBE3E2", fg: "#B23B37" },
  sin_registro: { bg: "#FFFFFF", fg: "#B23B37" },
  libre: { bg: "#F1F3F2", fg: "#7A8784" },
  futuro: { bg: "#FFFFFF", fg: "#B9C2C0" },
};

const FORM_VACIO = { nombre: "", placa: "", arrendatario: "", cuota: "", descanso: 0, generaIngresos: true, valorComercial: "" };

export default function VehiculoScreen() {
  const { vehiculos, cargando, error, crearVehiculo, editarVehiculo, eliminarVehiculo, registrarDia, registrarVarios, borrarDia, agregarPicoPlaca, borrarPicoPlaca, recargar } = useVehiculos();
  const { agregarGasto } = useGastos();
  const [mes, setMes] = useState(hoyISO().slice(0, 7));
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  // día seleccionado
  const [dia, setDia] = useState<{ v: VehiculoConResumen; d: DiaVehiculo } | null>(null);
  const [opcion, setOpcion] = useState<"cuota" | "otro" | "no">("cuota");
  const [montoDia, setMontoDia] = useState("");
  const [notaDia, setNotaDia] = useState("");

  // pico y placa / gasto
  const [ppEn, setPpEn] = useState<string | null>(null);
  const [ppDesde, setPpDesde] = useState(hoyISO());
  const [ppDia, setPpDia] = useState(1);
  const [gastoEn, setGastoEn] = useState<string | null>(null);
  const [gItem, setGItem] = useState("");
  const [gValor, setGValor] = useState("");
  const [gFecha, setGFecha] = useState(hoyISO());
  const [gPaga, setGPaga] = useState("");
  const { personas, yo } = usePersonas();

  const esMesActual = mes === hoyISO().slice(0, 7);

  function abrirNuevo() {
    if (mostrarForm && !editandoId) return setMostrarForm(false);
    setForm(FORM_VACIO);
    setEditandoId(null);
    setMostrarForm(true);
  }
  function abrirEdicion(v: VehiculoConResumen) {
    setForm({
      nombre: v.nombre,
      placa: v.placa ?? "",
      arrendatario: v.arrendatario ?? "",
      cuota: v.cuota_diaria ? Math.round(Number(v.cuota_diaria)).toLocaleString("es-CO") : "",
      descanso: Number(v.dia_descanso ?? 0),
      generaIngresos: v.genera_ingresos,
      valorComercial: v.valor_comercial ? Math.round(Number(v.valor_comercial)).toLocaleString("es-CO") : "",
    });
    setEditandoId(v.id);
    setMostrarForm(true);
  }

  async function guardarVehiculo() {
    const cuota = aNumero(form.cuota);
    if (!form.nombre.trim()) return Alert.alert("Falta el nombre", "Escribe el nombre del vehículo.");
    if (form.generaIngresos && !(cuota > 0)) return Alert.alert("Falta la cuota", "Escribe la cuota diaria de la renta.");
    const datos = {
      nombre: form.nombre.trim(),
      placa: form.placa.trim() || undefined,
      arrendatario: form.arrendatario.trim() || undefined,
      cuotaDiaria: cuota || 0,
      diaDescanso: form.descanso,
      generaIngresos: form.generaIngresos,
      valorComercial: aNumero(form.valorComercial) || null,
    };
    setGuardando(true);
    try {
      if (editandoId) await editarVehiculo(editandoId, datos);
      else await crearVehiculo(datos);
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  function abrirDia(v: VehiculoConResumen, d: DiaVehiculo) {
    if (d.estado === "futuro") return;
    setDia({ v, d });
    const cuota = Number(v.cuota_diaria);
    if (d.pago?.estado === "no_pagado") setOpcion("no");
    else if (d.pago && Number(d.pago.monto ?? cuota) !== cuota) setOpcion("otro");
    else setOpcion(d.tipo === "cobro" ? "cuota" : "otro");
    setMontoDia(d.pago?.monto ? Math.round(Number(d.pago.monto)).toLocaleString("es-CO") : "");
    setNotaDia(d.pago?.nota ?? "");
  }

  async function guardarDia() {
    if (!dia) return;
    const cuota = Number(dia.v.cuota_diaria);
    let monto: number | null = null;
    if (opcion === "cuota") monto = cuota;
    if (opcion === "otro") {
      monto = aNumero(montoDia);
      if (!(monto > 0)) return Alert.alert("Falta el valor", "Escribe cuánto pagó ese día.");
    }
    setGuardando(true);
    try {
      await registrarDia(dia.v.id, dia.d.fecha, opcion === "no" ? "no_pagado" : "pagado", monto, notaDia.trim() || undefined);
      setDia(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  function marcarPendientes(v: VehiculoConResumen, dias: DiaVehiculo[]) {
    const pendientes = dias.filter((d) => d.estado === "sin_registro");
    if (!pendientes.length) return Alert.alert("Nada pendiente", "Todos los días de cobro de este mes ya tienen registro.");
    Alert.alert(
      "Marcar pagados",
      `¿Marcar como pagados con la cuota normal (${pesos(Number(v.cuota_diaria))}) los ${pendientes.length} día(s) sin registro de ${MESES[Number(mes.slice(5, 7)) - 1]}? Los días que pagó distinto los puedes corregir luego tocándolos.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Marcar", onPress: () => registrarVarios(v.id, pendientes.map((d) => d.fecha), Number(v.cuota_diaria)).catch((e) => Alert.alert("Error", e.message)) },
      ]
    );
  }

  async function guardarGasto(v: VehiculoConResumen) {
    const valor = aNumero(gValor);
    if (!gItem.trim() || !(valor > 0)) return Alert.alert("Faltan datos", "Escribe el concepto y el valor del gasto.");
    setGuardando(true);
    try {
      await agregarGasto({ fecha: gFecha, item: gItem.trim(), valor, rubro: "Vehículo", esCompartido: true, vehiculoId: v.id, moneda: "COP", valorCop: valor, pagadoPor: gPaga || yo });
      await recargar();
      setGItem("");
      setGValor("");
      setGastoEn(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar el gasto.");
    } finally {
      setGuardando(false);
    }
  }

  function panelGasto(v: VehiculoConResumen) {
    if (gastoEn !== v.id) return null;
    return (
      <View style={styles.panel}>
        <Text style={typography.h3}>Gasto del vehículo</Text>
        <TextInput style={styles.input} placeholder="Concepto (ej. cambio de aceite, SOAT)" placeholderTextColor={colors.textMuted} value={gItem} onChangeText={setGItem} />
        <TextInput style={styles.input} placeholder="Valor" placeholderTextColor={colors.textMuted} value={gValor} onChangeText={setGValor} keyboardType="numeric" />
        <FechaInput value={gFecha} onChange={setGFecha} max={hoyISO()} />
        <Text style={styles.label}>¿Quién pagó?</Text>
        <View style={styles.chips}>
          {personas.map((n) => (
            <TouchableOpacity key={n} onPress={() => setGPaga(n)} style={[styles.chip, (gPaga || yo) === n && styles.chipActivo]}>
              <Text style={[styles.chipTxt, (gPaga || yo) === n && styles.chipTxtActivo]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.ayuda}>Queda también en Gastos (rubro Vehículo).</Text>
        <PrimaryButton title="Guardar gasto" onPress={() => guardarGasto(v)} loading={guardando} />
      </View>
    );
  }

  function confirmarEliminar(v: VehiculoConResumen) {
    Alert.alert("Eliminar vehículo", `¿Eliminar ${v.nombre} y sus pagos diarios? Los gastos y créditos no se borran, solo se desvinculan.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => eliminarVehiculo(v.id).catch((e) => Alert.alert("Error", e.message)) },
    ]);
  }

  /** Vehículo de uso propio: solo valor (patrimonio), gastos y su parte de créditos. */
  function renderUsoPropio(v: VehiculoConResumen) {
    const rMes = rentabilidad(v, `${mes}-01`, `${mes}-31`);
    const r12 = rentabilidad(v, sumarMeses(hoyISO(), -12), hoyISO());
    return (
      <Card key={v.id}>
        <View style={styles.rowStart}>
          <View style={styles.iconoCircle}>
            <Ionicons name="car-sport" size={17} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={typography.h3}>
              {v.nombre}
              {v.placa ? ` · ${v.placa}` : ""}
            </Text>
            <Text style={typography.caption}>Uso propio · suma al patrimonio{v.valor_comercial ? ` · vale ${pesos(Number(v.valor_comercial))}` : ""}</Text>
          </View>
          <TouchableOpacity onPress={() => abrirEdicion(v)} style={{ padding: 4 }}>
            <Ionicons name="create-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => confirmarEliminar(v)} style={{ padding: 4 }}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>
        {v.creditos.map((c) => (
          <Text key={c.deuda_id} style={styles.listaTxt}>
            Crédito {c.nombre}: le corresponde el {Math.round(c.porcentaje * 100) / 100}%
          </Text>
        ))}
        <View style={styles.resumen}>
          <Mini t={`Gastos ${MESES[Number(mes.slice(5, 7)) - 1]}`} v={pesos(rMes.gastos)} />
          <Mini t="Cuotas (su parte)" v={pesos(rMes.cuotas)} />
          <Mini t="Costo 12 meses" v={pesos(r12.gastos + r12.cuotas)} color={colors.primary} />
        </View>
        <View style={styles.acciones}>
          <Accion icono="construct" texto="Gasto del vehículo" onPress={() => setGastoEn(gastoEn === v.id ? null : v.id)} />
        </View>
        {panelGasto(v)}
        {v.gastos.slice(0, 5).map((g) => (
          <Text key={g.id} style={styles.listaTxt}>
            {formatoFecha(g.fecha)} · {g.item} · {pesos(g.valor)}
          </Text>
        ))}
      </Card>
    );
  }

  function renderVehiculo(v: VehiculoConResumen) {
    if (!v.genera_ingresos) return renderUsoPropio(v);
    const dias = diasDelMes(v, mes);
    const esperado = dias.reduce((s, d) => s + d.esperado, 0);
    const recibido = dias.reduce((s, d) => s + d.recibido, 0);
    const diferencia = recibido - esperado;
    const sinPago = dias.filter((d) => d.fecha < hoyISO() && (d.estado === "sin_registro" || d.estado === "no_pagado")).length;
    const inicioMes = `${mes}-01`;
    const finMes = dias[dias.length - 1].fecha;
    const rMes = rentabilidad(v, inicioMes, finMes);
    const primera = [...v.pagos.map((p) => p.fecha), ...v.gastos.map((g) => g.fecha)].sort()[0] ?? inicioMes;
    const rTotal = rentabilidad(v, primera, hoyISO());
    const hoyDia = dias.find((d) => d.fecha === hoyISO());
    const offset = dias[0].diaSemana;

    return (
      <Card key={v.id}>
        <View style={styles.rowStart}>
          <View style={styles.iconoCircle}>
            <Ionicons name="car" size={17} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={typography.h3}>
              {v.nombre}
              {v.placa ? ` · ${v.placa}` : ""}
            </Text>
            <Text style={typography.caption}>
              {v.arrendatario ? `${v.arrendatario} · ` : ""}
              {pesos(Number(v.cuota_diaria))}/día · descanso {NOMBRES_DIAS[v.dia_descanso].toLowerCase()}
              {v.picoPlacaHoy !== null ? ` · pico y placa ${NOMBRES_DIAS[v.picoPlacaHoy].toLowerCase()}` : ""}
            </Text>
          </View>
          <TouchableOpacity onPress={() => abrirEdicion(v)} style={{ padding: 4 }}>
            <Ionicons name="create-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => confirmarEliminar(v)} style={{ padding: 4 }}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>

        <View style={styles.resumen}>
          <Mini t="Esperado" v={pesos(esperado)} />
          <Mini t="Recibido" v={pesos(recibido)} />
          <Mini t={diferencia >= 0 ? "A favor" : "Debe"} v={pesos(Math.abs(diferencia))} color={diferencia >= 0 ? colors.success : colors.danger} />
          <Mini t="Días sin pago" v={String(sinPago)} color={sinPago ? colors.danger : undefined} />
        </View>

        {/* Calendario */}
        <View style={styles.semana}>
          {CORTOS.map((c) => (
            <Text key={c} style={styles.semanaTxt}>
              {c}
            </Text>
          ))}
        </View>
        <View style={styles.calendario}>
          {Array.from({ length: offset }).map((_, i) => (
            <View key={`v${i}`} style={styles.celda} />
          ))}
          {dias.map((d) => {
            const c = COLOR_DIA[d.estado];
            const etiqueta =
              d.recibido > 0 ? corto(d.recibido) : d.tipo === "pico_placa" ? "P&P" : d.tipo === "descanso" ? "Desc." : d.estado === "no_pagado" ? "No" : d.estado === "sin_registro" ? "—" : "";
            return (
              <TouchableOpacity key={d.fecha} style={styles.celda} onPress={() => abrirDia(v, d)} disabled={d.estado === "futuro"}>
                <View style={[styles.celdaIn, { backgroundColor: c.bg }, d.fecha === hoyISO() && styles.hoy, d.estado === "sin_registro" && styles.sinReg]}>
                  <Text style={styles.celdaNum}>{Number(d.fecha.slice(8))}</Text>
                  <Text style={[styles.celdaTxt, { color: c.fg }]} numberOfLines={1}>
                    {etiqueta}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.leyenda}>
          {[
            ["pagado", "Pagó"],
            ["parcial", "Pagó menos"],
            ["de_mas", "Pagó de más / día libre"],
            ["no_pagado", "No pagó"],
            ["libre", "P&P / descanso"],
          ].map(([k, t]) => (
            <View key={k} style={styles.leyendaItem}>
              <View style={[styles.cuadro, { backgroundColor: COLOR_DIA[k].bg }]} />
              <Text style={styles.leyendaTxt}>{t}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.ayuda}>Toca un día para registrar lo que pagó. Los días de pico y placa y de descanso no se cobran.</Text>

        <View style={styles.acciones}>
          {esMesActual && hoyDia && hoyDia.tipo === "cobro" && !hoyDia.pago && (
            <Accion icono="checkmark-circle" texto={`Hoy pagó ${pesos(Number(v.cuota_diaria))}`} onPress={() => registrarDia(v.id, hoyISO(), "pagado", Number(v.cuota_diaria)).catch((e) => Alert.alert("Error", e.message))} />
          )}
          <Accion icono="checkmark-done" texto="Marcar pendientes como pagados" onPress={() => marcarPendientes(v, dias)} />
          <Accion icono="calendar" texto="Pico y placa" onPress={() => setPpEn(ppEn === v.id ? null : v.id)} />
          <Accion icono="construct" texto="Gasto del carro" onPress={() => setGastoEn(gastoEn === v.id ? null : v.id)} />
        </View>

        {ppEn === v.id && (
          <View style={styles.panel}>
            <Text style={typography.h3}>Pico y placa</Text>
            <Text style={styles.ayuda}>Cambia cada seis meses. Registra desde qué fecha aplica el nuevo día; los días anteriores conservan el anterior.</Text>
            {v.picoPlaca.map((p) => (
              <View key={p.id} style={styles.ppFila}>
                <Text style={[styles.listaTxt, { flex: 1 }]}>
                  Desde {formatoFecha(p.desde)}: <Text style={{ fontWeight: "700" }}>{NOMBRES_DIAS[p.dia_semana]}</Text>
                </Text>
                <TouchableOpacity onPress={() => borrarPicoPlaca(p.id).catch((e) => Alert.alert("Error", e.message))}>
                  <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
            <Text style={[styles.label, { marginTop: spacing.sm }]}>Nuevo día de pico y placa</Text>
            <View style={styles.chips}>
              {NOMBRES_DIAS.map((n, i) => (
                <TouchableOpacity key={n} onPress={() => setPpDia(i)} style={[styles.chip, ppDia === i && styles.chipActivo]}>
                  <Text style={[styles.chipTxt, ppDia === i && styles.chipTxtActivo]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Aplica desde</Text>
            <FechaInput value={ppDesde} onChange={setPpDesde} />
            <PrimaryButton
              title="Guardar pico y placa"
              onPress={() =>
                agregarPicoPlaca(v.id, ppDesde, ppDia)
                  .then(() => setPpEn(null))
                  .catch((e) => Alert.alert("Error", e.message))
              }
            />
          </View>
        )}

        {panelGasto(v)}

        <View style={styles.panel}>
          <Text style={typography.h3}>Rentabilidad</Text>
          <View style={styles.tabla}>
            <View style={styles.tablaFila}>
              <Text style={[styles.tablaCelda, { flex: 1.4 }]} />
              <Text style={[styles.tablaCelda, styles.tablaEnc]}>{MESES[Number(mes.slice(5, 7)) - 1]}</Text>
              <Text style={[styles.tablaCelda, styles.tablaEnc]}>Desde {formatoFecha(primera).slice(-8)}</Text>
            </View>
            <FilaR t="Ingresos (renta)" a={rMes.ingresos} b={rTotal.ingresos} />
            <FilaR t="Gastos del carro" a={-rMes.gastos} b={-rTotal.gastos} />
            {(rMes.cuotas > 0 || rTotal.cuotas > 0) && <FilaR t="Cuotas del crédito (su %)" a={-rMes.cuotas} b={-rTotal.cuotas} />}
            <FilaR t="Ganancia neta" a={rMes.neto} b={rTotal.neto} fuerte />
            <View style={styles.tablaFila}>
              <Text style={[styles.tablaCelda, { flex: 1.4 }]}>Margen</Text>
              <Text style={styles.tablaCelda}>{rMes.ingresos ? `${Math.round((rMes.neto / rMes.ingresos) * 100)}%` : "—"}</Text>
              <Text style={styles.tablaCelda}>{rTotal.ingresos ? `${Math.round((rTotal.neto / rTotal.ingresos) * 100)}%` : "—"}</Text>
            </View>
          </View>
          {v.gastos.slice(0, 5).map((g) => (
            <Text key={g.id} style={styles.listaTxt}>
              {formatoFecha(g.fecha)} · {g.item} · {pesos(g.valor)}
            </Text>
          ))}
          <Text style={styles.ayuda}>Los créditos del carro se asocian desde Deudas; los gastos también desde Gastos ("¿Es de una propiedad o del carro?").</Text>
        </View>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Vehículos" subtitle="Rentados y de uso propio" actionLabel="Nuevo" onAction={abrirNuevo} actionActive={mostrarForm && !editandoId} />

      {mostrarForm ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}>
          <Card>
            <Text style={[typography.h3, { marginBottom: spacing.sm }]}>{editandoId ? "Editar vehículo" : "Nuevo vehículo"}</Text>
            <TextInput style={styles.input} placeholder="Nombre del vehículo" placeholderTextColor={colors.textMuted} value={form.nombre} onChangeText={(t) => setForm({ ...form, nombre: t })} />
            <TextInput style={styles.input} placeholder="Placa" placeholderTextColor={colors.textMuted} value={form.placa} onChangeText={(t) => setForm({ ...form, placa: t })} />
            <Text style={styles.label}>Valor comercial (suma al patrimonio)</Text>
            <TextInput style={styles.input} placeholder="Ej. 60.000.000" placeholderTextColor={colors.textMuted} value={form.valorComercial} onChangeText={(t) => setForm({ ...form, valorComercial: t })} keyboardType="numeric" />
            <View style={styles.switchFila}>
              <Text style={[typography.body, { flex: 1 }]}>Se renta (genera ingresos diarios). Apágalo si es de uso propio: solo suma a patrimonio y gastos.</Text>
              <Switch value={form.generaIngresos} onValueChange={(b) => setForm({ ...form, generaIngresos: b })} trackColor={{ true: colors.primary }} />
            </View>
            {form.generaIngresos && (
              <>
                <TextInput style={styles.input} placeholder="Conductor" placeholderTextColor={colors.textMuted} value={form.arrendatario} onChangeText={(t) => setForm({ ...form, arrendatario: t })} />
                <TextInput style={styles.input} placeholder="Cuota diaria" placeholderTextColor={colors.textMuted} value={form.cuota} onChangeText={(t) => setForm({ ...form, cuota: t })} keyboardType="numeric" />
                <Text style={styles.label}>Día de descanso (no se cobra)</Text>
                <View style={styles.chips}>
                  {NOMBRES_DIAS.map((n, i) => (
                    <TouchableOpacity key={n} onPress={() => setForm({ ...form, descanso: i })} style={[styles.chip, form.descanso === i && styles.chipActivo]}>
                      <Text style={[styles.chipTxt, form.descanso === i && styles.chipTxtActivo]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.ayuda}>El día de pico y placa se configura en el vehículo, con la fecha desde la que aplica.</Text>
              </>
            )}
            <PrimaryButton title={editandoId ? "Guardar cambios" : "Crear vehículo"} onPress={guardarVehiculo} loading={guardando} />
            <PrimaryButton title="Cancelar" variant="outline" onPress={() => setMostrarForm(false)} style={{ marginTop: spacing.sm }} />
          </Card>
        </ScrollView>
      ) : cargando && !vehiculos.length ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando vehículos: {error}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md, width: "100%", maxWidth: 760, alignSelf: "center" }}>
          <View style={styles.selector}>
            <TouchableOpacity onPress={() => setMes(sumarMeses(`${mes}-01`, -1).slice(0, 7))} style={styles.flecha}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </TouchableOpacity>
            <Text style={typography.h2}>
              {MESES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}
            </Text>
            <TouchableOpacity onPress={() => setMes(sumarMeses(`${mes}-01`, 1).slice(0, 7))} style={[styles.flecha, esMesActual && { opacity: 0.3 }]} disabled={esMesActual}>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
          {vehiculos.length === 0 && <Text style={styles.empty}>Todavía no hay vehículos registrados.</Text>}
          {vehiculos.map(renderVehiculo)}
        </ScrollView>
      )}

      <Modal visible={!!dia} transparent animationType="fade">
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            {dia && (
              <>
                <Text style={typography.h2}>
                  {NOMBRES_DIAS[dia.d.diaSemana]} {formatoFecha(dia.d.fecha)}
                </Text>
                {dia.d.tipo !== "cobro" && (
                  <Text style={[styles.ayuda, { color: colors.warning }]}>
                    {dia.d.tipo === "pico_placa" ? "Pico y placa" : "Día de descanso"}: este día no se cobra. Si igual pagó algo, regístralo como "Otro valor".
                  </Text>
                )}
                <View style={[styles.chips, { marginTop: spacing.sm }]}>
                  {dia.d.tipo === "cobro" && (
                    <TouchableOpacity onPress={() => setOpcion("cuota")} style={[styles.chip, opcion === "cuota" && styles.chipActivo]}>
                      <Text style={[styles.chipTxt, opcion === "cuota" && styles.chipTxtActivo]}>Pagó la cuota ({pesos(Number(dia.v.cuota_diaria))})</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => setOpcion("otro")} style={[styles.chip, opcion === "otro" && styles.chipActivo]}>
                    <Text style={[styles.chipTxt, opcion === "otro" && styles.chipTxtActivo]}>Pagó otro valor (más o menos)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setOpcion("no")} style={[styles.chip, opcion === "no" && styles.chipActivo]}>
                    <Text style={[styles.chipTxt, opcion === "no" && styles.chipTxtActivo]}>No pagó</Text>
                  </TouchableOpacity>
                </View>
                {opcion === "otro" && (
                  <TextInput style={styles.input} placeholder="¿Cuánto pagó?" placeholderTextColor={colors.textMuted} value={montoDia} onChangeText={setMontoDia} keyboardType="numeric" autoFocus />
                )}
                <TextInput style={styles.input} placeholder="Motivo / nota (opcional)" placeholderTextColor={colors.textMuted} value={notaDia} onChangeText={setNotaDia} />
                <PrimaryButton title="Guardar" onPress={guardarDia} loading={guardando} />
                {dia.d.pago && (
                  <TouchableOpacity
                    style={{ marginTop: spacing.md, alignItems: "center" }}
                    onPress={() =>
                      borrarDia(dia.v.id, dia.d.fecha)
                        .then(() => setDia(null))
                        .catch((e) => Alert.alert("Error", e.message))
                    }
                  >
                    <Text style={{ color: colors.danger, fontWeight: "600" }}>Borrar registro de este día</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setDia(null)} style={{ marginTop: spacing.md }}>
                  <Text style={{ textAlign: "center", color: colors.textSecondary }}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Mini({ t, v, color }: { t: string; v: string; color?: string }) {
  return (
    <View style={styles.mini}>
      <Text style={styles.miniT}>{t}</Text>
      <Text style={[styles.miniV, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {v}
      </Text>
    </View>
  );
}

function Accion({ icono, texto, onPress }: { icono: any; texto: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.accion} onPress={onPress}>
      <Ionicons name={icono} size={15} color={colors.primary} />
      <Text style={styles.accionTxt}>{texto}</Text>
    </TouchableOpacity>
  );
}

function FilaR({ t, a, b, fuerte }: { t: string; a: number; b: number; fuerte?: boolean }) {
  const f = (n: number) => `${n < 0 ? "−" : ""}${pesos(Math.abs(n))}`;
  return (
    <View style={styles.tablaFila}>
      <Text style={[styles.tablaCelda, { flex: 1.4 }, fuerte && styles.fuerte]}>{t}</Text>
      <Text style={[styles.tablaCelda, styles.der, fuerte && styles.fuerte]}>{f(a)}</Text>
      <Text style={[styles.tablaCelda, styles.der, fuerte && styles.fuerte]}>{f(b)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  selector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  flecha: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  label: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 4 },
  ayuda: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.sm },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  chipActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  chipTxtActivo: { color: colors.white },
  rowStart: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconoCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  resumen: { flexDirection: "row", gap: 6, marginTop: spacing.md, marginBottom: spacing.sm },
  mini: { flex: 1, backgroundColor: colors.background, borderRadius: radius.sm, padding: 6 },
  miniT: { fontSize: 10, color: colors.textMuted },
  miniV: { fontSize: 13, fontWeight: "800", color: colors.textPrimary },
  semana: { flexDirection: "row" },
  semanaTxt: { width: `${100 / 7}%`, textAlign: "center", fontSize: 10, color: colors.textMuted, fontWeight: "700", paddingVertical: 4 },
  switchFila: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.sm },
  calendario: { flexDirection: "row", flexWrap: "wrap" },
  celda: { width: `${100 / 7}%`, padding: 2 },
  celdaIn: { borderRadius: 6, paddingVertical: 4, alignItems: "center", borderWidth: 1, borderColor: "transparent", minHeight: 40 },
  hoy: { borderColor: colors.primary, borderWidth: 2 },
  sinReg: { borderColor: "#F2C4C2", borderStyle: "dashed" },
  celdaNum: { fontSize: 11, fontWeight: "700", color: colors.textPrimary },
  celdaTxt: { fontSize: 10, fontWeight: "700" },
  leyenda: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  leyendaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  cuadro: { width: 10, height: 10, borderRadius: 2, borderWidth: 1, borderColor: colors.border },
  leyendaTxt: { fontSize: 10, color: colors.textSecondary },
  acciones: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  accion: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.background },
  accionTxt: { fontSize: 12, fontWeight: "600", color: colors.primary },
  panel: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  ppFila: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 },
  listaTxt: { fontSize: 12, color: colors.textSecondary, paddingVertical: 2 },
  tabla: { marginTop: spacing.sm, marginBottom: spacing.sm },
  tablaFila: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 5 },
  tablaCelda: { flex: 1, fontSize: 12, color: colors.textSecondary },
  tablaEnc: { fontWeight: "700", color: colors.textPrimary, textAlign: "right" },
  der: { textAlign: "right" },
  fuerte: { fontWeight: "800", color: colors.textPrimary },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.lg },
  modalCaja: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
});
