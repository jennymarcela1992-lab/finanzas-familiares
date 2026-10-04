import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert, Modal, ScrollView, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePropiedades, PropiedadConDetalle, DestinoArriendo, ArriendoRow } from "../../hooks/usePropiedades";
import { usePersonas } from "../../hooks/usePersonas";
import { useDeudas } from "../../hooks/useDeudas";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import FechaInput from "../../components/FechaInput";
import { colors, spacing, typography, radius } from "../../theme/theme";
import { aNumero } from "../../utils/numeros";
import { formatoFecha, pesos, hoyISO, sumarMeses } from "../../utils/amortizacion";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

const FORM_VACIO = {
  nombre: "",
  direccion: "",
  arrendatario: "",
  valorInicial: "",
  fechaInicio: "",
  diaPago: "5",
  valorComercial: "",
  aplicaIpc: true,
};

export default function PropiedadesScreen() {
  const { propiedades, ipc, cargando, error, crearPropiedad, editarPropiedad, registrarArriendoRecibido, eliminarArriendo, guardarIpc } = usePropiedades();
  const { deudas, recargar: recargarDeudas } = useDeudas();
  const { personas } = usePersonas();

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [verIpc, setVerIpc] = useState(false);

  // modal de arriendo
  const [prop, setProp] = useState<PropiedadConDetalle | null>(null);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [mes, setMes] = useState(hoyISO().slice(0, 7));
  const [destino, setDestino] = useState<string>("hogar"); // "hogar" | "p:<persona>" | "c:<deudaId>"
  const [valorCredito, setValorCredito] = useState("");

  const cambiar = (k: keyof typeof FORM_VACIO) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  function abrirNueva() {
    if (mostrarForm && !editandoId) return setMostrarForm(false);
    setForm(FORM_VACIO);
    setEditandoId(null);
    setMostrarForm(true);
  }

  function abrirEdicion(p: PropiedadConDetalle) {
    setForm({
      nombre: p.nombre,
      direccion: p.direccion ?? "",
      arrendatario: p.arrendatario ?? "",
      valorInicial: Math.round(Number(p.valor_arriendo_inicial ?? p.valor_arriendo)).toLocaleString("es-CO"),
      fechaInicio: p.fecha_inicio_contrato ?? "",
      diaPago: String(p.dia_pago_arriendo ?? 5),
      valorComercial: p.valor_comercial ? Math.round(Number(p.valor_comercial)).toLocaleString("es-CO") : "",
      aplicaIpc: p.aplica_ipc !== false,
    });
    setEditandoId(p.id);
    setMostrarForm(true);
  }

  async function guardar() {
    const valor = aNumero(form.valorInicial);
    const dia = Math.round(aNumero(form.diaPago));
    if (!form.nombre.trim() || !(valor > 0)) return Alert.alert("Faltan datos", "Escribe el nombre y el valor del arriendo.");
    if (!(dia >= 1 && dia <= 31)) return Alert.alert("Día no válido", "El día de pago debe estar entre 1 y 31.");
    const datos = {
      nombre: form.nombre.trim(),
      direccion: form.direccion.trim() || undefined,
      arrendatario: form.arrendatario.trim() || undefined,
      valorArriendoInicial: valor,
      fechaInicioContrato: form.fechaInicio || null,
      diaPagoArriendo: dia,
      valorComercial: aNumero(form.valorComercial) || null,
      aplicaIpc: form.aplicaIpc,
    };
    setGuardando(true);
    try {
      if (editandoId) await editarPropiedad(editandoId, datos);
      else await crearPropiedad(datos);
      setMostrarForm(false);
      setEditandoId(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar la propiedad.");
    } finally {
      setGuardando(false);
    }
  }

  // ---------- Arriendo recibido ----------
  const creditosConCuota = (p: PropiedadConDetalle | null) => {
    const ligados = new Set((p?.creditos ?? []).map((c) => c.id));
    return deudas.filter((d) => d.proximaCuota).sort((a, b) => Number(ligados.has(b.id)) - Number(ligados.has(a.id)));
  };

  function abrirArriendo(p: PropiedadConDetalle) {
    setProp(p);
    const falta = Math.max(0, p.arriendo.valor - p.recibidoMes);
    setMonto(Math.round(falta || p.arriendo.valor).toLocaleString("es-CO"));
    setFecha(hoyISO());
    setMes(hoyISO().slice(0, 7));
    const ligado = deudas.find((d) => p.creditos.some((c) => c.id === d.id) && d.proximaCuota);
    if (ligado) {
      setDestino(`c:${ligado.id}`);
      setValorCredito(Math.min(falta || p.arriendo.valor, ligado.restanteProxima).toLocaleString("es-CO"));
    } else {
      setDestino("hogar");
      setValorCredito("");
    }
  }

  function elegirDestino(d: string) {
    setDestino(d);
    if (d.startsWith("c:")) {
      const deuda = deudas.find((x) => x.id === d.slice(2));
      if (deuda) setValorCredito(Math.min(aNumero(monto) || 0, deuda.restanteProxima).toLocaleString("es-CO"));
    }
  }

  async function guardarArriendo() {
    if (!prop) return;
    const m = aNumero(monto);
    if (!(m > 0)) return Alert.alert("Falta el valor", "Escribe cuánto se recibió.");
    let dest: DestinoArriendo = { tipo: "hogar" };
    if (destino.startsWith("p:")) dest = { tipo: "persona", persona: destino.slice(2) };
    if (destino.startsWith("c:")) {
      const v = aNumero(valorCredito);
      if (!(v > 0)) return Alert.alert("Falta el valor", "Escribe cuánto del arriendo va al crédito.");
      if (v > m) return Alert.alert("Valor no válido", "Lo que va al crédito no puede ser mayor que el arriendo recibido.");
      dest = { tipo: "credito", deudaId: destino.slice(2), valor: v };
    }
    setGuardando(true);
    try {
      await registrarArriendoRecibido(prop.id, m, { fecha, mes, destino: dest });
      if (dest.tipo === "credito") await recargarDeudas();
      setProp(null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo registrar el arriendo.");
    } finally {
      setGuardando(false);
    }
  }

  function confirmarBorrarArriendo(a: ArriendoRow) {
    Alert.alert("Borrar arriendo", `¿Borrar el arriendo de ${pesos(Number(a.monto))} (${nombreMes(a.mes)})? Si pagó un crédito, ese pago también se borra.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: () => eliminarArriendo(a).then(recargarDeudas).catch((e) => Alert.alert("Error", e.message)) },
    ]);
  }

  // ---------- IPC ----------
  const aniosIpc = Array.from(new Set([...Object.keys(ipc).map(Number), ...propiedades.flatMap((p) => p.arriendo.ipcFaltante), Number(hoyISO().slice(0, 4)) - 1])).sort((a, b) => b - a);
  const faltantes = Array.from(new Set(propiedades.flatMap((p) => p.arriendo.ipcFaltante)));

  function renderEstado(p: PropiedadConDetalle) {
    const cfg = {
      recibido: { t: `Recibido ${pesos(p.recibidoMes)}`, c: colors.success, bg: "#E3F3EC", i: "checkmark-circle" },
      parcial: { t: `Parcial: falta ${pesos(p.arriendo.valor - p.recibidoMes)}`, c: colors.warning, bg: "#FCEFD9", i: "time" },
      por_vencer: { t: p.diasParaPago === 0 ? "Vence hoy" : `Vence en ${p.diasParaPago} día(s)`, c: colors.warning, bg: "#FCEFD9", i: "alarm" },
      vencido: { t: `Vencido hace ${Math.abs(p.diasParaPago)} día(s)`, c: colors.danger, bg: "#FBE3E2", i: "alert-circle" },
      pendiente: { t: `Vence el ${formatoFecha(p.fechaPagoMes)}`, c: colors.textSecondary, bg: colors.background, i: "calendar" },
    }[p.estadoMes];
    return (
      <View style={[styles.estado, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.i as any} size={14} color={cfg.c} />
        <Text style={[styles.estadoTexto, { color: cfg.c }]}>
          Arriendo de {MESES[Number(p.fechaPagoMes.slice(5, 7)) - 1]}: {cfg.t}
        </Text>
      </View>
    );
  }

  function renderPropiedad(p: PropiedadConDetalle) {
    const abiertaP = abierta === p.id;
    const r = p.rendimiento12m;
    return (
      <Card>
        <TouchableOpacity onPress={() => setAbierta(abiertaP ? null : p.id)} activeOpacity={0.85}>
          <View style={styles.rowStart}>
            <View style={styles.iconoCircle}>
              <Ionicons name="business" size={17} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.h3}>{p.nombre}</Text>
              {p.arrendatario && <Text style={typography.caption}>Arrendatario: {p.arrendatario}</Text>}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.valor}>{pesos(p.arriendo.valor)}</Text>
              <Text style={typography.caption}>al mes · día {p.dia_pago_arriendo}</Text>
            </View>
          </View>

          {renderEstado(p)}

          {p.arriendo.ultimoAjuste && (
            <Text style={styles.ipcTexto}>
              Subió {p.arriendo.ultimoAjuste.ipc.toLocaleString("es-CO")}% (IPC {p.arriendo.ultimoAjuste.anioIpc}) el {formatoFecha(p.arriendo.ultimoAjuste.fecha)}
              {p.arriendo.proximoAjuste ? ` · próximo ajuste ${formatoFecha(p.arriendo.proximoAjuste)}` : ""}
            </Text>
          )}
          {!p.arriendo.ultimoAjuste && p.arriendo.proximoAjuste && (
            <Text style={styles.ipcTexto}>Primer ajuste por IPC el {formatoFecha(p.arriendo.proximoAjuste)}</Text>
          )}
          {!p.fecha_inicio_contrato && <Text style={styles.ipcTexto}>Sin fecha de contrato: el arriendo no sube con el IPC. Edítala para activarlo.</Text>}
          {p.arriendo.ipcFaltante.length > 0 && (
            <Text style={[styles.ipcTexto, { color: colors.danger }]}>Falta el IPC de {p.arriendo.ipcFaltante.join(", ")}; regístralo abajo para calcular bien el arriendo.</Text>
          )}

          {p.creditos.map((c) => (
            <View key={c.id} style={styles.creditoFila}>
              <Ionicons name="card" size={13} color={colors.primary} />
              <Text style={styles.creditoTexto}>
                {c.nombre}
                {c.proximaCuotaValor !== null ? `: cuota #${c.proximaCuotaNumero} ${pesos(c.proximaCuotaValor)} vence ${formatoFecha(c.proximaCuotaFecha!)}` : ": sin cuotas pendientes"}
                {c.entidad_pago ? ` · ${c.entidad_pago}` : ""}
              </Text>
            </View>
          ))}

          <View style={styles.rendFila}>
            <Mini t="Arriendos 12m" v={pesos(r.arriendos)} />
            <Mini t="Gastos" v={`−${pesos(r.gastos)}`} />
            <Mini t="Cuotas" v={`−${pesos(r.cuotas)}`} />
            <Mini t="Rendimiento" v={`${r.neto < 0 ? "−" : ""}${pesos(Math.abs(r.neto))}`} fuerte />
          </View>
          {p.rentabilidadAnual !== null && (
            <Text style={styles.ipcTexto}>
              Rentabilidad últimos 12 meses: {(p.rentabilidadAnual * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })}% sobre un valor de {pesos(Number(p.valor_comercial))}
            </Text>
          )}
          <Text style={styles.hint}>{abiertaP ? "Ocultar detalle ▲" : "Ver detalle ▼"}</Text>
        </TouchableOpacity>

        <View style={styles.acciones}>
          <TouchableOpacity style={styles.accion} onPress={() => abrirArriendo(p)}>
            <Ionicons name="cash" size={15} color={colors.primary} />
            <Text style={styles.accionTexto}>Registrar arriendo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.accion} onPress={() => abrirEdicion(p)}>
            <Ionicons name="create" size={15} color={colors.primary} />
            <Text style={styles.accionTexto}>Editar</Text>
          </TouchableOpacity>
        </View>

        {abiertaP && (
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.label}>Rendimiento de este año ({p.rendimientoAnio.desde.slice(0, 4)})</Text>
            <Fila t="Arriendos recibidos" v={p.rendimientoAnio.arriendos} />
            <Fila t="Gastos de la propiedad" v={-p.rendimientoAnio.gastos} />
            <Fila t="Pagos a créditos de la propiedad" v={-p.rendimientoAnio.cuotas} />
            <Fila t="Rendimiento neto" v={p.rendimientoAnio.neto} fuerte />
            <Text style={styles.ayuda}>Los gastos se asocian a la propiedad desde Gastos ("¿Es de una propiedad o del carro?"). Los créditos, desde Deudas.</Text>

            {p.gastosRecientes.length > 0 && (
              <>
                <Text style={[styles.label, { marginTop: spacing.sm }]}>Últimos gastos</Text>
                {p.gastosRecientes.map((g) => (
                  <Text key={g.id} style={styles.listaTexto}>
                    {formatoFecha(g.fecha)} · {g.item} · {pesos(g.valor)}
                  </Text>
                ))}
              </>
            )}

            <Text style={[styles.label, { marginTop: spacing.sm }]}>Arriendos recibidos</Text>
            {p.arriendos.length === 0 && <Text style={styles.listaTexto}>Todavía no hay arriendos registrados.</Text>}
            {p.arriendos.slice(0, 12).map((a) => (
              <TouchableOpacity key={a.id} style={styles.arriendoFila} onPress={() => confirmarBorrarArriendo(a)}>
                <Text style={[styles.listaTexto, { flex: 1 }]}>
                  {nombreMes(a.mes)} · {pesos(Number(a.monto))} · recibido {formatoFecha(a.fecha)}
                  {a.destino_persona ? ` · para ${a.destino_persona}` : ""}
                </Text>
                <Ionicons name="close-circle-outline" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Card>
    );
  }

  const deudaElegida = destino.startsWith("c:") ? deudas.find((d) => d.id === destino.slice(2)) : null;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Propiedades" subtitle="Arriendos y rendimiento" actionLabel="Nueva" onAction={abrirNueva} actionActive={mostrarForm && !editandoId} />

      {mostrarForm ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={[typography.h3, { marginBottom: spacing.sm }]}>{editandoId ? "Editar propiedad" : "Nueva propiedad"}</Text>
            <TextInput style={styles.input} placeholder="Nombre (ej. Apto Torre 4)" placeholderTextColor={colors.textMuted} value={form.nombre} onChangeText={cambiar("nombre")} />
            <TextInput style={styles.input} placeholder="Dirección" placeholderTextColor={colors.textMuted} value={form.direccion} onChangeText={cambiar("direccion")} />
            <TextInput style={styles.input} placeholder="Arrendatario" placeholderTextColor={colors.textMuted} value={form.arrendatario} onChangeText={cambiar("arrendatario")} />

            <Text style={styles.label}>Fecha de inicio del contrato</Text>
            {form.fechaInicio ? (
              <FechaInput value={form.fechaInicio} onChange={cambiar("fechaInicio")} max={hoyISO()} />
            ) : (
              <TouchableOpacity style={styles.input} onPress={() => cambiar("fechaInicio")(sumarMeses(hoyISO(), -12))}>
                <Text style={{ color: colors.primary, fontWeight: "600" }}>+ Agregar fecha de inicio</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.label}>{form.fechaInicio ? "Valor del arriendo al iniciar el contrato" : "Valor del arriendo mensual"}</Text>
            <TextInput style={styles.input} placeholder="Ej. 1.500.000" placeholderTextColor={colors.textMuted} value={form.valorInicial} onChangeText={cambiar("valorInicial")} keyboardType="numeric" />

            <View style={styles.switchFila}>
              <Text style={[typography.body, { flex: 1 }]}>Subir cada año con el IPC (en el aniversario del contrato)</Text>
              <Switch value={form.aplicaIpc} onValueChange={cambiar("aplicaIpc")} trackColor={{ true: colors.primary }} />
            </View>

            <Text style={styles.label}>Día del mes en que se paga el arriendo</Text>
            <TextInput style={styles.input} placeholder="Ej. 5" placeholderTextColor={colors.textMuted} value={form.diaPago} onChangeText={cambiar("diaPago")} keyboardType="numeric" />

            <Text style={styles.label}>Valor comercial de la propiedad (opcional, para la rentabilidad %)</Text>
            <TextInput style={styles.input} placeholder="Ej. 350.000.000" placeholderTextColor={colors.textMuted} value={form.valorComercial} onChangeText={cambiar("valorComercial")} keyboardType="numeric" />

            <Text style={styles.ayuda}>Para asociar un crédito a esta propiedad, edítalo en Deudas y elige la propiedad.</Text>
            <PrimaryButton title={editandoId ? "Guardar cambios" : "Crear propiedad"} onPress={guardar} loading={guardando} />
            <PrimaryButton title="Cancelar" variant="outline" onPress={() => setMostrarForm(false)} style={{ marginTop: spacing.sm }} />
          </Card>
        </ScrollView>
      ) : cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando propiedades: {error}</Text>
      ) : (
        <FlatList
          data={propiedades}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no hay propiedades registradas.</Text>}
          renderItem={({ item }) => renderPropiedad(item)}
          ListFooterComponent={
            <Card>
              <TouchableOpacity onPress={() => setVerIpc(!verIpc)} style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.h3}>IPC anual (para subir los arriendos)</Text>
                  <Text style={typography.caption}>
                    {faltantes.length ? `Falta registrar: ${faltantes.join(", ")}` : "Variación anual del IPC que publica el DANE en enero."}
                  </Text>
                </View>
                <Ionicons name={verIpc ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
              </TouchableOpacity>
              {verIpc && aniosIpc.map((anio) => <FilaIpc key={anio} anio={anio} valor={ipc[anio]} guardar={guardarIpc} />)}
            </Card>
          }
        />
      )}

      <Modal visible={!!prop} transparent animationType="slide">
        <View style={styles.modalFondo}>
          <ScrollView style={styles.modalCaja} contentContainerStyle={{ paddingBottom: spacing.md }} keyboardShouldPersistTaps="handled">
            <Text style={typography.h2}>Arriendo recibido</Text>
            <Text style={typography.caption}>
              {prop?.nombre} · vigente {pesos(prop?.arriendo.valor ?? 0)}
              {prop && prop.recibidoMes > 0 ? ` · ya recibido este mes ${pesos(prop.recibidoMes)}` : ""}
            </Text>

            <Text style={[styles.label, { marginTop: spacing.md }]}>¿De qué mes es?</Text>
            <View style={styles.chipsRow}>
              {[sumarMeses(hoyISO(), -1).slice(0, 7), hoyISO().slice(0, 7), sumarMeses(hoyISO(), 1).slice(0, 7)].map((m) => (
                <TouchableOpacity key={m} style={[styles.chip, mes === m && styles.chipActivo]} onPress={() => setMes(m)}>
                  <Text style={[styles.chipText, mes === m && styles.chipTextActivo]}>{nombreMes(m)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Valor recibido</Text>
            <TextInput style={styles.input} value={monto} onChangeText={setMonto} keyboardType="numeric" placeholder="Valor recibido" placeholderTextColor={colors.textMuted} />
            <Text style={styles.label}>Fecha en que se recibió</Text>
            <FechaInput value={fecha} onChange={setFecha} max={hoyISO()} />

            <Text style={styles.label}>¿A dónde va este dinero?</Text>
            <View style={styles.chipsRow}>
              <TouchableOpacity style={[styles.chip, destino === "hogar" && styles.chipActivo]} onPress={() => elegirDestino("hogar")}>
                <Text style={[styles.chipText, destino === "hogar" && styles.chipTextActivo]}>Queda en el hogar</Text>
              </TouchableOpacity>
              {personas.map((n) => (
                <TouchableOpacity key={n} style={[styles.chip, destino === `p:${n}` && styles.chipActivo]} onPress={() => elegirDestino(`p:${n}`)}>
                  <Text style={[styles.chipText, destino === `p:${n}` && styles.chipTextActivo]}>Para {n}</Text>
                </TouchableOpacity>
              ))}
              {creditosConCuota(prop).map((d) => (
                <TouchableOpacity key={d.id} style={[styles.chip, destino === `c:${d.id}` && styles.chipActivo]} onPress={() => elegirDestino(`c:${d.id}`)}>
                  <Text style={[styles.chipText, destino === `c:${d.id}` && styles.chipTextActivo]}>Pagar {d.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {deudaElegida?.proximaCuota && (
              <View style={styles.destinoBox}>
                <Text style={styles.destinoInfo}>
                  Cuota #{deudaElegida.proximaCuota.numero_cuota} vence {formatoFecha(deudaElegida.proximaCuota.fecha_vencimiento)} · falta {pesos(deudaElegida.restanteProxima)}
                  {deudaElegida.entidad_pago ? ` · se paga en ${deudaElegida.entidad_pago}` : ""}
                  {deudaElegida.numero_cuenta ? ` (${deudaElegida.numero_cuenta})` : ""}
                </Text>
                <Text style={styles.label}>Valor que va al crédito</Text>
                <TextInput style={styles.input} value={valorCredito} onChangeText={setValorCredito} keyboardType="numeric" placeholder="Valor para la cuota" placeholderTextColor={colors.textMuted} />
                {aNumero(monto) > aNumero(valorCredito) && aNumero(valorCredito) > 0 && (
                  <Text style={styles.destinoInfo}>Quedan disponibles {pesos(aNumero(monto) - aNumero(valorCredito))}</Text>
                )}
              </View>
            )}
            {destino.startsWith("p:") && <Text style={styles.ayuda}>Queda registrado que este arriendo se le entregó a {destino.slice(2)}.</Text>}

            <PrimaryButton title="Guardar" onPress={guardarArriendo} loading={guardando} />
            <TouchableOpacity onPress={() => setProp(null)} style={{ marginTop: spacing.md }}>
              <Text style={{ textAlign: "center", color: colors.textSecondary }}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Mini({ t, v, fuerte }: { t: string; v: string; fuerte?: boolean }) {
  return (
    <View style={styles.mini}>
      <Text style={styles.miniT}>{t}</Text>
      <Text style={[styles.miniV, fuerte && { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
        {v}
      </Text>
    </View>
  );
}

function Fila({ t, v, fuerte }: { t: string; v: number; fuerte?: boolean }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={[styles.listaTexto, fuerte && { fontWeight: "800", color: colors.textPrimary }]}>{t}</Text>
      <Text style={[styles.listaTexto, { fontWeight: fuerte ? "800" : "600", color: colors.textPrimary }]}>
        {v < 0 ? "−" : ""}
        {pesos(Math.abs(v))}
      </Text>
    </View>
  );
}

function FilaIpc({ anio, valor, guardar }: { anio: number; valor?: number; guardar: (a: number, v: number) => Promise<void> }) {
  const [texto, setTexto] = useState(valor !== undefined ? String(valor).replace(".", ",") : "");
  const [ok, setOk] = useState(false);
  return (
    <View style={styles.ipcFila}>
      <Text style={[styles.listaTexto, { width: 60, fontWeight: "700", color: colors.textPrimary }]}>{anio}</Text>
      <TextInput
        style={[styles.input, { flex: 1, marginBottom: 0 }, valor === undefined && { borderWidth: 1, borderColor: colors.danger }]}
        value={texto}
        onChangeText={(t) => {
          setTexto(t);
          setOk(false);
        }}
        keyboardType="decimal-pad"
        placeholder="% (ej. 5,20)"
        placeholderTextColor={colors.textMuted}
      />
      <TouchableOpacity
        style={styles.ipcBoton}
        onPress={async () => {
          const v = aNumero(texto);
          if (!(v >= -50 && v <= 100)) return Alert.alert("Valor no válido", "Escribe el IPC en porcentaje, ej. 5,20");
          try {
            await guardar(anio, v);
            setOk(true);
          } catch (e: any) {
            Alert.alert("Error", e.message);
          }
        }}
      >
        <Ionicons name={ok ? "checkmark-done" : "checkmark"} size={16} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  label: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 4 },
  ayuda: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6 },
  chipActivo: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  chipTextActivo: { color: colors.white },
  switchFila: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.sm },
  rowStart: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  iconoCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  valor: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  estado: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.sm },
  estadoTexto: { fontSize: 12, fontWeight: "700", flex: 1 },
  ipcTexto: { fontSize: 11, color: colors.textSecondary, marginTop: 6 },
  creditoFila: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 6 },
  creditoTexto: { fontSize: 12, color: colors.primary, flex: 1 },
  rendFila: { flexDirection: "row", gap: 6, marginTop: spacing.sm },
  mini: { flex: 1, backgroundColor: colors.background, borderRadius: radius.sm, padding: 6 },
  miniT: { fontSize: 10, color: colors.textMuted },
  miniV: { fontSize: 12, fontWeight: "800", color: colors.textPrimary },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
  acciones: { flexDirection: "row", gap: 8, marginTop: spacing.sm, flexWrap: "wrap" },
  accion: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.background },
  accionTexto: { fontSize: 13, fontWeight: "600", color: colors.primary },
  listaTexto: { fontSize: 12, color: colors.textSecondary, paddingVertical: 2 },
  arriendoFila: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 4 },
  destinoBox: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md },
  destinoInfo: { fontSize: 12, color: colors.primary, marginBottom: spacing.sm },
  ipcFila: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm },
  ipcBoton: { backgroundColor: colors.primary, padding: 9, borderRadius: radius.sm },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
  modalFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.lg },
  modalCaja: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, maxHeight: "90%", flexGrow: 0 },
});
