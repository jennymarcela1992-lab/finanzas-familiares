import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Switch, Alert, Platform, Image, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useGastos, GastoRow } from "../../hooks/useGastos";
import { useTasasCambio } from "../../hooks/useTasasCambio";
import { useDeudas } from "../../hooks/useDeudas";
import { useActivos, Activo } from "../../hooks/useActivos";
import { formatoFecha, pesos, hoyISO, sumarMeses } from "../../utils/amortizacion";
import { useGastosRecurrentes } from "../../hooks/useGastosRecurrentes";
import { usePersonas } from "../../hooks/usePersonas";
import FechaInput from "../../components/FechaInput";
import ScreenHeader from "../../components/ScreenHeader";
import Card from "../../components/Card";
import PrimaryButton from "../../components/PrimaryButton";
import { colors, spacing, typography, radius } from "../../theme/theme";
import { aNumero } from "../../utils/numeros";

const RUBROS = ["Mercado", "Servicios", "Salidas y Eventos", "Salud", "Gastos Fijos", "Créditos", "Vehículo", "Propiedades", "Otro"];
const ICONO_RUBRO: Record<string, keyof typeof Ionicons.glyphMap> = {
  Mercado: "cart",
  Servicios: "flash",
  "Salidas y Eventos": "sparkles",
  Salud: "medkit",
  "Gastos Fijos": "home",
  Créditos: "card",
  Vehículo: "car",
  Propiedades: "business",
  Otro: "ellipsis-horizontal",
};

export default function GastosScreen() {
  const { gastos, papelera, cargando, error, agregarGasto, editarGasto, moverAPapelera, restaurarGasto, borrarGasto, generarCSV, recargar } = useGastos();
  const { recurrentes, crearRecurrente, actualizarRecurrente, eliminarRecurrente } = useGastosRecurrentes();
  const { personas, yo } = usePersonas();
  const [esAutomatico, setEsAutomatico] = useState(false);
  const [pagaAuto, setPagaAuto] = useState("");
  const [hastaModo, setHastaModo] = useState<"sin" | "3" | "6" | "12" | "fecha">("sin");
  const [hastaFecha, setHastaFecha] = useState(sumarMeses(hoyISO(), 12));
  const [verAutomaticos, setVerAutomaticos] = useState(false);
  const { tasas, convertirACOP } = useTasasCambio();
  const { deudas, recargar: recargarDeudas } = useDeudas();
  const { activos } = useActivos();
  const [asociado, setAsociado] = useState<Activo | null>(null); // propiedad o carro al que pertenece el gasto
  const [esPagoCredito, setEsPagoCredito] = useState(false);
  const [deudaElegida, setDeudaElegida] = useState<string | null>(null);
  const deudasConCuotas = deudas.filter((d) => d.proximaCuota);
  const deudaSel = deudas.find((d) => d.id === deudaElegida);

  function elegirDeuda(id: string) {
    const d = deudas.find((x) => x.id === id);
    setDeudaElegida(id);
    if (d) {
      setItem(`Cuota ${d.nombre}`);
      setValor(d.restanteProxima.toLocaleString("es-CO"));
      setRubro("Créditos");
      setMoneda("COP");
    }
  }
  const [moneda, setMoneda] = useState("COP");
  const [verPapelera, setVerPapelera] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroRubro, setFiltroRubro] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [item, setItem] = useState("");
  const [valor, setValor] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [editando, setEditando] = useState<GastoRow | null>(null);
  const [fotoActual, setFotoActual] = useState<string | null>(null); // foto ya guardada (al editar)
  const [rubro, setRubro] = useState(RUBROS[0]);
  const [esCompartido, setEsCompartido] = useState(true);
  const [nota, setNota] = useState("");
  const [comprobanteUri, setComprobanteUri] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  function limpiarFormulario() {
    setItem("");
    setValor("");
    setNota("");
    setFecha(hoyISO());
    setRubro(RUBROS[0]);
    setEsCompartido(true);
    setComprobanteUri(null);
    setFotoActual(null);
    setMoneda("COP");
    setEsPagoCredito(false);
    setDeudaElegida(null);
    setEditando(null);
    setAsociado(null);
    setEsAutomatico(false);
    setPagaAuto("");
    setHastaModo("sin");
  }

  function abrirNuevo() {
    if (mostrarForm && !editando) {
      setMostrarForm(false);
      return;
    }
    limpiarFormulario();
    setMostrarForm(true);
  }

  function abrirEdicion(g: GastoRow) {
    limpiarFormulario();
    setEditando(g);
    setPagaAuto(g.usuario_pago_nombre ?? "");
    setItem(g.item);
    setValor(Number(g.valor).toLocaleString("es-CO"));
    setMoneda(g.moneda || "COP");
    setFecha(String(g.fecha).slice(0, 10));
    setRubro(g.rubro && RUBROS.includes(g.rubro) ? g.rubro : "Otro");
    setEsCompartido(!!g.es_compartido);
    setNota(g.nota ?? "");
    setFotoActual(g.comprobante_ver ?? null);
    setAsociado(activos.find((a) => a.id === g.propiedad_id || a.id === g.vehiculo_id) ?? null);
    setMostrarForm(true);
  }

  async function elegirFoto(origen: "camara" | "galeria") {
    const opciones = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 };
    try {
      if (origen === "camara") {
        const permiso = await ImagePicker.requestCameraPermissionsAsync();
        if (!permiso.granted) {
          Alert.alert("Permiso necesario", "Activa el acceso a la cámara para tomar la foto del comprobante.");
          return;
        }
      } else {
        const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permiso.granted) {
          Alert.alert("Permiso necesario", "Activa el acceso a fotos para adjuntar un comprobante.");
          return;
        }
      }
      const resultado =
        origen === "camara" ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
      if (!resultado.canceled && resultado.assets?.[0]) {
        setComprobanteUri(resultado.assets[0].uri);
      }
    } catch (e: any) {
      Alert.alert("No se pudo abrir", e?.message ?? "Intenta de nuevo.");
    }
  }

  async function manejarGuardar() {
    if (esPagoCredito && !deudaElegida) {
      Alert.alert("Falta el crédito", "Elige cuál crédito estás pagando.");
      return;
    }
    if (!item.trim() || !valor.trim()) {
      Alert.alert("Faltan datos", "Escribe al menos el nombre del gasto y el valor.");
      return;
    }
    setGuardando(true);
    try {
      const datos = {
        fecha,
        item: item.trim(),
        valor: aNumero(valor),
        rubro,
        esCompartido,
        nota: nota.trim() || undefined,
        comprobanteUri: comprobanteUri ?? undefined,
        deudaId: esPagoCredito && deudaElegida ? deudaElegida : undefined,
        moneda,
        valorCop: convertirACOP(aNumero(valor), moneda),
        propiedadId: asociado?.tipo === "propiedad" ? asociado.id : null,
        vehiculoId: asociado?.tipo === "vehiculo" ? asociado.id : null,
        pagadoPor: pagaAuto || yo,
      };
      if (!editando && esAutomatico) {
        const hasta =
          hastaModo === "sin" ? null : hastaModo === "fecha" ? hastaFecha : sumarMeses(fecha, Number(hastaModo) - 1);
        await crearRecurrente({
          item: datos.item,
          valor: datos.valorCop ?? datos.valor,
          rubro: datos.rubro,
          pagadoPor: pagaAuto || yo,
          esCompartido: datos.esCompartido,
          dia: Number(fecha.slice(8, 10)),
          desde: fecha,
          hasta,
          propiedadId: datos.propiedadId,
          vehiculoId: datos.vehiculoId,
          nota: datos.nota,
        });
        await recargar();
        setEsAutomatico(false);
      } else if (editando) {
        await editarGasto(editando.id, { ...datos, quitarFoto: !fotoActual && !comprobanteUri && !!editando.comprobante_url });
        if (editando.deuda_id) recargarDeudas();
      } else {
        await agregarGasto(datos);
        if (esPagoCredito) recargarDeudas();
      }
      limpiarFormulario();
      setMostrarForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar el gasto.");
    } finally {
      setGuardando(false);
    }
  }

  function confirmarBorrado(g: GastoRow) {
    Alert.alert("Eliminar gasto", `¿Mover "${g.item}" a la papelera?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => moverAPapelera(g.id) },
    ]);
  }

  function confirmarBorradoDefinitivo(g: GastoRow) {
    Alert.alert("Borrar para siempre", `"${g.item}" no se podrá recuperar. ¿Continuar?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar definitivo", style: "destructive", onPress: () => borrarGasto(g.id) },
    ]);
  }

  const totalMes = gastos.reduce((s, g) => s + Number(g.valor_cop ?? g.valor), 0);

  async function descargarReporte() {
    const csv = generarCSV(listaFiltrada);
    const nombreArchivo = `gastos_${new Date().toISOString().slice(0, 10)}.csv`;

    if (Platform.OS === "web") {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombreArchivo;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);
      return;
    }

    const ruta = FileSystem.documentDirectory + nombreArchivo;
    await FileSystem.writeAsStringAsync(ruta, csv, { encoding: FileSystem.EncodingType.UTF8 });
    const disponible = await Sharing.isAvailableAsync();
    if (disponible) {
      await Sharing.shareAsync(ruta, { mimeType: "text/csv", dialogTitle: "Reporte de gastos" });
    } else {
      Alert.alert("Reporte guardado", `Se guardó en: ${ruta}`);
    }
  }

  const listaFiltrada = (verPapelera ? papelera : gastos).filter((g) => {
    const coincideBusqueda = !busqueda.trim() || g.item.toLowerCase().includes(busqueda.toLowerCase()) || g.nota?.toLowerCase().includes(busqueda.toLowerCase());
    const coincideRubro = !filtroRubro || g.rubro === filtroRubro;
    return coincideBusqueda && coincideRubro;
  });

  return (
    <View style={styles.container}>
      <ScreenHeader title="Gastos" subtitle={`$${totalMes.toLocaleString("es-CO")} registrados`} actionLabel="Nuevo" onAction={abrirNuevo} actionActive={mostrarForm && !editando} />

      <View style={styles.filtrosRow}>
        <View style={styles.buscadorWrap}>
          <Ionicons name="search" size={15} color={colors.textMuted} />
          <TextInput style={styles.buscadorInput} placeholder="Buscar gasto o nota..." placeholderTextColor={colors.textMuted} value={busqueda} onChangeText={setBusqueda} />
        </View>
        <TouchableOpacity style={[styles.papeleraBoton, verAutomaticos && styles.papeleraBotonActivo]} onPress={() => setVerAutomaticos(!verAutomaticos)}>
          <Ionicons name="repeat" size={16} color={verAutomaticos ? colors.white : colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.papeleraBoton} onPress={descargarReporte}>
          <Ionicons name="download" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.papeleraBoton, verPapelera && styles.papeleraBotonActivo]} onPress={() => setVerPapelera(!verPapelera)}>
          <Ionicons name="trash" size={16} color={verPapelera ? colors.white : colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {verAutomaticos && (
        <Card style={styles.formCard}>
          <Text style={typography.h3}>Gastos automáticos ({recurrentes.length})</Text>
          <Text style={styles.pista}>Se anotan solos cada mes, en su día, a nombre de quien los paga. Para crear uno, activa "Es automático" al registrar un gasto.</Text>
          {recurrentes.length === 0 && <Text style={typography.caption}>Todavía no hay gastos automáticos.</Text>}
          {recurrentes.map((r) => {
            const terminado = !r.activo || (r.hasta !== null && r.hasta < hoyISO());
            return (
              <View key={r.id} style={styles.autoFila}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.h3, terminado && { color: colors.textMuted }]}>
                    {r.item} · {pesos(Number(r.valor))}
                  </Text>
                  <Text style={typography.caption}>
                    Día {r.dia} de cada mes · paga {r.usuario_pago_nombre ?? "—"} · {r.hasta ? `hasta ${formatoFecha(r.hasta)}` : "sin fecha de fin"}
                    {!r.activo ? " · detenido" : ""}
                    {r.ultima_generada ? ` · último ${formatoFecha(r.ultima_generada)}` : ""}
                  </Text>
                </View>
                <View style={{ gap: 6, alignItems: "flex-end" }}>
                  {!terminado && (
                    <TouchableOpacity
                      onPress={() =>
                        Alert.alert("Detener", `¿Dejar de anotar "${r.item}" desde hoy? Los gastos ya anotados se conservan.`, [
                          { text: "Cancelar", style: "cancel" },
                          { text: "Detener", style: "destructive", onPress: () => actualizarRecurrente(r.id, { activo: false }).catch((e) => Alert.alert("Error", e.message)) },
                        ])
                      }
                    >
                      <Text style={styles.autoAccion}>Detener</Text>
                    </TouchableOpacity>
                  )}
                  {!r.activo && (
                    <TouchableOpacity onPress={() => actualizarRecurrente(r.id, { activo: true }).then(recargar).catch((e) => Alert.alert("Error", e.message))}>
                      <Text style={styles.autoAccion}>Reactivar</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert("Eliminar automático", `¿Eliminar "${r.item}"? Los gastos ya anotados se conservan.`, [
                        { text: "Cancelar", style: "cancel" },
                        { text: "Eliminar", style: "destructive", onPress: () => eliminarRecurrente(r.id).catch((e) => Alert.alert("Error", e.message)) },
                      ])
                    }
                  >
                    <Text style={[styles.autoAccion, { color: colors.danger }]}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {!verPapelera && (
        <View style={styles.chipsRowFiltro}>
          <TouchableOpacity style={[styles.chip, !filtroRubro && styles.chipActivo]} onPress={() => setFiltroRubro(null)}>
            <Text style={[styles.chipText, !filtroRubro && styles.chipTextActivo]}>Todos</Text>
          </TouchableOpacity>
          {RUBROS.map((r) => (
            <TouchableOpacity key={r} style={[styles.chip, filtroRubro === r && styles.chipActivo]} onPress={() => setFiltroRubro(filtroRubro === r ? null : r)}>
              <Text style={[styles.chipText, filtroRubro === r && styles.chipTextActivo]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {mostrarForm && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <Card style={styles.formCard}>
          <Text style={[typography.h3, { marginBottom: spacing.sm }]}>{editando ? "Editar gasto" : "Nuevo gasto"}</Text>
          {editando?.deuda_id && (
            <View style={styles.creditoBox}>
              <Text style={styles.creditoInfo}>
                Este gasto es el pago de {deudas.find((d) => d.id === editando.deuda_id)?.nombre ?? "un crédito"}. Si cambias el valor o la fecha, el pago del crédito se actualiza.
              </Text>
            </View>
          )}
          {!editando && (
          <View style={styles.switchRow}>
            <Text style={typography.body}>¿Es pago de un crédito?</Text>
            <Switch
              value={esPagoCredito}
              onValueChange={(v) => {
                setEsPagoCredito(v);
                if (!v) setDeudaElegida(null);
              }}
              trackColor={{ true: colors.primary }}
            />
          </View>
          )}
          {!editando && esPagoCredito && (
            <View style={styles.creditoBox}>
              {deudasConCuotas.length === 0 ? (
                <Text style={typography.caption}>No hay créditos con cuotas pendientes. Créalos en Deudas y créditos.</Text>
              ) : (
                <>
                  <Text style={styles.label}>¿Cuál crédito?</Text>
                  <View style={styles.chipsRow}>
                    {deudasConCuotas.map((d) => (
                      <TouchableOpacity key={d.id} style={[styles.chip, deudaElegida === d.id && styles.chipActivo]} onPress={() => elegirDeuda(d.id)}>
                        <Text style={[styles.chipText, deudaElegida === d.id && styles.chipTextActivo]}>{d.nombre}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {deudaSel?.proximaCuota && (
                    <Text style={styles.creditoInfo}>
                      Cuota #{deudaSel.proximaCuota.numero_cuota} vence {formatoFecha(deudaSel.proximaCuota.fecha_vencimiento)} · falta {pesos(deudaSel.restanteProxima)}
                      {Number(deudaSel.proximaCuota.valor_pagado ?? 0) > 0 ? ` (ya abonado ${pesos(Number(deudaSel.proximaCuota.valor_pagado))})` : ""}
                      . Si pagas más, el excedente se abona a la siguiente cuota.
                    </Text>
                  )}
                </>
              )}
            </View>
          )}
          <TextInput style={styles.input} placeholder="¿Qué fue el gasto?" placeholderTextColor={colors.textMuted} value={item} onChangeText={setItem} />
          <TextInput style={styles.input} placeholder="Valor (ej. 45000)" placeholderTextColor={colors.textMuted} value={valor} onChangeText={setValor} keyboardType="numeric" />

          <View style={styles.chipsRow}>
            {Object.keys(tasas).map((m) => (
              <TouchableOpacity key={m} style={[styles.chip, moneda === m && styles.chipActivo]} onPress={() => setMoneda(m)}>
                <Text style={[styles.chipText, moneda === m && styles.chipTextActivo]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {moneda !== "COP" && valor && (
            <Text style={styles.conversionTexto}>≈ ${convertirACOP(aNumero(valor) || 0, moneda).toLocaleString("es-CO")} COP</Text>
          )}

          <Text style={styles.label}>{esAutomatico ? "¿Quién lo paga cada mes?" : "¿Quién pagó?"}</Text>
          <View style={styles.chipsRow}>
            {personas.map((n) => (
              <TouchableOpacity key={n} style={[styles.chip, (pagaAuto || yo) === n && styles.chipActivo]} onPress={() => setPagaAuto(n)}>
                <Text style={[styles.chipText, (pagaAuto || yo) === n && styles.chipTextActivo]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{esAutomatico ? "Primera fecha (se repite este día cada mes)" : "Fecha del gasto"}</Text>
          <FechaInput value={fecha} onChange={setFecha} max={esAutomatico ? undefined : hoyISO()} />

          {!editando && !esPagoCredito && (
            <View style={styles.switchRow}>
              <Text style={[typography.body, { flex: 1 }]}>Es automático (se anota solo cada mes)</Text>
              <Switch value={esAutomatico} onValueChange={setEsAutomatico} trackColor={{ true: colors.primary }} />
            </View>
          )}
          {!editando && esAutomatico && (
            <View style={styles.creditoBox}>
              <Text style={styles.label}>¿Por cuánto tiempo?</Text>
              <View style={styles.chipsRow}>
                {(
                  [
                    ["sin", "Sin fecha de fin"],
                    ["3", "3 meses"],
                    ["6", "6 meses"],
                    ["12", "12 meses"],
                    ["fecha", "Hasta una fecha"],
                  ] as const
                ).map(([k, t]) => (
                  <TouchableOpacity key={k} style={[styles.chip, hastaModo === k && styles.chipActivo]} onPress={() => setHastaModo(k)}>
                    <Text style={[styles.chipText, hastaModo === k && styles.chipTextActivo]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {hastaModo === "fecha" && <FechaInput value={hastaFecha} onChange={setHastaFecha} min={fecha} />}
              <Text style={styles.creditoInfo}>
                Se anotará el día {Number(fecha.slice(8, 10))} de cada mes a nombre de {pagaAuto || yo}
                {hastaModo === "sin" ? ", sin fecha de fin" : hastaModo === "fecha" ? ` hasta el ${formatoFecha(hastaFecha)}` : ` durante ${hastaModo} meses`}. Si la primera fecha ya pasó, se anotan también los meses atrasados.
              </Text>
            </View>
          )}

          <Text style={styles.label}>Rubro</Text>
          <View style={styles.chipsRow}>
            {RUBROS.map((r) => (
              <TouchableOpacity key={r} style={[styles.chip, rubro === r && styles.chipActivo]} onPress={() => setRubro(r)}>
                <Ionicons name={ICONO_RUBRO[r]} size={13} color={rubro === r ? colors.white : colors.primary} />
                <Text style={[styles.chipText, rubro === r && styles.chipTextActivo]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {activos.length > 0 && (
            <>
              <Text style={styles.label}>¿Es de una propiedad o del carro? (para su rendimiento)</Text>
              <View style={styles.chipsRow}>
                <TouchableOpacity style={[styles.chip, !asociado && styles.chipActivo]} onPress={() => setAsociado(null)}>
                  <Text style={[styles.chipText, !asociado && styles.chipTextActivo]}>No</Text>
                </TouchableOpacity>
                {activos.map((a) => (
                  <TouchableOpacity key={a.id} style={[styles.chip, asociado?.id === a.id && styles.chipActivo]} onPress={() => setAsociado(a)}>
                    <Ionicons name={a.tipo === "propiedad" ? "business" : "car"} size={13} color={asociado?.id === a.id ? colors.white : colors.primary} />
                    <Text style={[styles.chipText, asociado?.id === a.id && styles.chipTextActivo]}>{a.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <View style={styles.switchRow}>
            <Text style={typography.body}>¿Se divide entre los dos?</Text>
            <Switch value={esCompartido} onValueChange={setEsCompartido} trackColor={{ true: colors.primary }} />
          </View>

          <TextInput style={styles.input} placeholder="Nota (opcional)" placeholderTextColor={colors.textMuted} value={nota} onChangeText={setNota} />

          {!comprobanteUri && fotoActual ? (
            <View style={styles.previewFila}>
              <Image source={{ uri: fotoActual }} style={styles.previewImagen} />
              <TouchableOpacity onPress={() => setFotoActual(null)} style={styles.quitarFotoBoton}>
                <Ionicons name="trash" size={14} color={colors.danger} />
                <Text style={styles.quitarFotoTexto}>Quitar foto</Text>
              </TouchableOpacity>
            </View>
          ) : comprobanteUri ? (
            <View style={styles.previewFila}>
              <Image source={{ uri: comprobanteUri }} style={styles.previewImagen} />
              <TouchableOpacity onPress={() => setComprobanteUri(null)} style={styles.quitarFotoBoton}>
                <Ionicons name="trash" size={14} color={colors.danger} />
                <Text style={styles.quitarFotoTexto}>Quitar foto</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.fotoFila}>
              <TouchableOpacity onPress={() => elegirFoto("camara")} style={[styles.fotoBoton, { flex: 1 }]}>
                <Ionicons name="camera" size={16} color={colors.primary} />
                <Text style={styles.fotoBotonTexto}>Tomar foto</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => elegirFoto("galeria")} style={[styles.fotoBoton, { flex: 1 }]}>
                <Ionicons name="images" size={16} color={colors.primary} />
                <Text style={styles.fotoBotonTexto}>Elegir de galería</Text>
              </TouchableOpacity>
            </View>
          )}

          <PrimaryButton title={editando ? "Guardar cambios" : "Guardar gasto"} onPress={manejarGuardar} loading={guardando} style={{ marginTop: spacing.sm }} />
          <PrimaryButton
            title="Cancelar"
            variant="outline"
            onPress={() => {
              limpiarFormulario();
              setMostrarForm(false);
            }}
            style={{ marginTop: spacing.sm }}
          />
          {editando && (
            <TouchableOpacity
              style={styles.borrarEnlace}
              onPress={() => {
                const g = editando;
                Alert.alert("Eliminar gasto", `¿Mover "${g.item}" a la papelera?`, [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Eliminar",
                    style: "destructive",
                    onPress: async () => {
                      await moverAPapelera(g.id);
                      if (g.deuda_id) recargarDeudas();
                      limpiarFormulario();
                      setMostrarForm(false);
                    },
                  },
                ]);
              }}
            >
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
              <Text style={styles.borrarTexto}>Mover a la papelera</Text>
            </TouchableOpacity>
          )}
        </Card>
        </ScrollView>
      )}

      {mostrarForm ? null : cargando ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Error cargando gastos: {error}</Text>
      ) : (
        <FlatList
          data={listaFiltrada}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
          ListHeaderComponent={
            listaFiltrada.length > 0 ? (
              <Text style={styles.pista}>{verPapelera ? "Mantén presionado para borrar definitivamente." : "Toca un gasto para editarlo · mantén presionado para enviarlo a la papelera."}</Text>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>{verPapelera ? "La papelera está vacía." : "Todavía no hay gastos registrados."}</Text>}
          renderItem={({ item: g }) => (
            <TouchableOpacity
              onPress={() => (verPapelera ? undefined : abrirEdicion(g))}
              onLongPress={() => (verPapelera ? confirmarBorradoDefinitivo(g) : confirmarBorrado(g))}
              activeOpacity={0.8}
            >
              <Card style={styles.gastoCard}>
                <View style={styles.iconoRubro}>
                  <Ionicons name={ICONO_RUBRO[g.rubro ?? "Otro"] ?? "pricetag"} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={typography.h3}>{g.item}</Text>
                  <Text style={typography.caption}>
                    {g.rubro} · {g.fecha} {g.usuario_pago_nombre ? `· pagó ${g.usuario_pago_nombre}` : ""}
                  </Text>
                  {g.deuda_id && (
                    <Text style={styles.creditoBadge}>
                      Pago de crédito{deudas.find((d) => d.id === g.deuda_id) ? `: ${deudas.find((d) => d.id === g.deuda_id)!.nombre}` : ""}
                    </Text>
                  )}
                  {(g as any).recurrente_id && <Text style={styles.creditoBadge}>Automático</Text>}
                  {(g.propiedad_id || g.vehiculo_id) && (
                    <Text style={styles.creditoBadge}>
                      {g.propiedad_id ? "Propiedad" : "Carro"}: {activos.find((a) => a.id === (g.propiedad_id || g.vehiculo_id))?.nombre ?? ""}
                    </Text>
                  )}
                  {g.nota && <Text style={styles.nota}>{g.nota}</Text>}
                  {verPapelera && g.borrado_por && <Text style={styles.historialTexto}>Borrado por {g.borrado_por}</Text>}
                </View>
                {g.comprobante_ver ? (
                  <TouchableOpacity onPress={() => setFotoAmpliada(g.comprobante_ver ?? null)}>
                    <Image source={{ uri: g.comprobante_ver }} style={styles.miniatura} />
                  </TouchableOpacity>
                ) : g.comprobante_url ? (
                  <View style={[styles.miniatura, styles.miniaturaVacia]}>
                    <Ionicons name="image-outline" size={18} color={colors.textMuted} />
                  </View>
                ) : null}
                <Text style={styles.valor}>
                  ${Number(g.valor).toLocaleString("es-CO")} {g.moneda !== "COP" ? g.moneda : ""}
                </Text>
                {g.moneda !== "COP" && <Text style={styles.conversionMini}>${Number(g.valor_cop ?? g.valor).toLocaleString("es-CO")} COP</Text>}
                {verPapelera && (
                  <TouchableOpacity onPress={() => restaurarGasto(g.id)} style={styles.restaurarBoton}>
                    <Ionicons name="arrow-undo" size={16} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </Card>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!fotoAmpliada} transparent animationType="fade">
        <TouchableOpacity style={styles.visorFondo} activeOpacity={1} onPress={() => setFotoAmpliada(null)}>
          {fotoAmpliada && <Image source={{ uri: fotoAmpliada }} style={styles.visorImagen} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  formCard: { marginHorizontal: spacing.lg },
  input: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm, fontSize: 15, color: colors.textPrimary },
  fechaBoton: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm },
  fechaTexto: { fontSize: 14, color: colors.textPrimary, fontWeight: "600" },
  label: { ...typography.caption, marginBottom: spacing.sm },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6, marginBottom: 6 },
  chipActivo: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  chipTextActivo: { color: colors.white },
  autoFila: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  autoAccion: { fontSize: 12, fontWeight: "700", color: colors.primary },
  pista: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm },
  borrarEnlace: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.md },
  borrarTexto: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  creditoBox: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.sm },
  creditoInfo: { fontSize: 12, color: colors.primary },
  creditoBadge: { fontSize: 11, color: colors.primary, fontWeight: "700", marginTop: 2 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm, marginTop: 4 },
  gastoCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconoRubro: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  nota: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontStyle: "italic" },
  valor: { fontSize: 15, fontWeight: "800", color: colors.primary },
  fotoFila: { flexDirection: "row", gap: 8 },
  miniaturaVacia: { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  fotoBoton: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.sm },
  fotoBotonTexto: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  previewFila: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  previewImagen: { width: 56, height: 56, borderRadius: radius.sm },
  quitarFotoBoton: { flexDirection: "row", alignItems: "center", gap: 4 },
  quitarFotoTexto: { fontSize: 12, color: colors.danger, fontWeight: "600" },
  miniatura: { width: 40, height: 40, borderRadius: 8, marginRight: spacing.sm },
  visorFondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center" },
  visorImagen: { width: "90%", height: "80%" },
  filtrosRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  buscadorWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  buscadorInput: { flex: 1, fontSize: 13, color: colors.textPrimary },
  papeleraBoton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 9 },
  papeleraBotonActivo: { backgroundColor: colors.danger, borderColor: colors.danger },
  chipsRowFiltro: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  restaurarBoton: { marginLeft: spacing.sm, padding: 6 },
  historialTexto: { fontSize: 11, color: colors.danger, marginTop: 2, fontStyle: "italic" },
  conversionTexto: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm, marginTop: -4 },
  conversionMini: { fontSize: 10, color: colors.textMuted, textAlign: "right" },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  errorText: { color: colors.danger, padding: spacing.lg },
});
