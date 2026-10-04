import { useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import { supabase } from "../config/supabase";
import { registrarPagoDeuda, reaplicarPagos } from "../utils/pagosDeuda";

export interface GastoRow {
  id: string;
  fecha: string;
  item: string;
  valor: number;
  moneda: string;
  valor_cop: number | null;
  usuario_pago_nombre: string | null;
  persona_asociada: string | null;
  es_compartido: boolean;
  rubro: string | null;
  metodo_pago: string | null;
  nota: string | null;
  es_recurrente: boolean;
  comprobante_url: string | null; // ruta interna de la foto en el bucket privado
  comprobante_ver?: string | null; // enlace temporal para mostrarla
  deuda_id?: string | null; // si es pago de un crédito
  borrado: boolean;
  borrado_por: string | null;
  restaurado_por: string | null;
  restaurado_en: string | null;
}

export interface NuevoGasto {
  fecha: string;
  item: string;
  valor: number;
  rubro: string;
  esCompartido: boolean;
  metodoPago?: string;
  personaAsociada?: string;
  nota?: string;
  esRecurrente?: boolean;
  comprobanteUri?: string; // uri local de la foto elegida, antes de subirla
  moneda?: string; // COP por defecto
  valorCop?: number; // ya convertido a pesos, calculado con la tasa de cambio
  deudaId?: string; // si el gasto es el pago de un crédito
}

const BUCKET = "comprobantes";

const EXTENSIONES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

// En el navegador reduce la foto (max 1600 px, JPG) para que suba rapido y ocupe poco.
async function reducirEnWeb(blob: Blob): Promise<Blob> {
  if (Platform.OS !== "web" || typeof document === "undefined") return blob;
  try {
    const url = URL.createObjectURL(blob);
    const img: HTMLImageElement = await new Promise((ok, falla) => {
      const i = new (window as any).Image();
      i.onload = () => ok(i);
      i.onerror = falla;
      i.src = url;
    });
    const MAX = 1600;
    const escala = Math.min(1, MAX / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const reducido: Blob | null = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.75));
    return reducido && reducido.size < blob.size ? reducido : blob;
  } catch {
    return blob; // si el navegador no puede leerla (p. ej. HEIC), se sube tal cual
  }
}

// Sube la foto al bucket privado y devuelve la ruta interna (no un enlace publico).
async function subirComprobante(uriLocal: string, usuarioId: string): Promise<string> {
  const respuesta = await fetch(uriLocal);
  const original = await respuesta.blob();
  const blob = await reducirEnWeb(original);
  const tipo = blob.type || "image/jpeg";
  const extension = EXTENSIONES[tipo] ?? "jpg";
  const ruta = `${usuarioId}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(ruta, blob, { contentType: tipo });
  if (error) throw new Error(`No se pudo subir la foto: ${error.message}`);
  return ruta;
}

// Acepta la ruta interna o un enlace publico viejo y devuelve la ruta dentro del bucket.
function rutaDeComprobante(valor: string): string {
  const marca = `/${BUCKET}/`;
  if (valor.startsWith("http")) {
    const i = valor.indexOf(marca);
    return i >= 0 ? decodeURIComponent(valor.slice(i + marca.length).split("?")[0]) : valor;
  }
  return valor;
}

// Genera enlaces temporales (1 hora) para ver las fotos privadas.
async function agregarEnlacesDeFotos(filas: GastoRow[]): Promise<GastoRow[]> {
  const rutas = filas.filter((g) => g.comprobante_url).map((g) => rutaDeComprobante(g.comprobante_url!));
  if (rutas.length === 0) return filas;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(rutas, 60 * 60);
  const enlaces = new Map<string, string>();
  (data ?? []).forEach((d) => {
    if (d.path && d.signedUrl) enlaces.set(d.path, d.signedUrl);
  });
  return filas.map((g) =>
    g.comprobante_url ? { ...g, comprobante_ver: enlaces.get(rutaDeComprobante(g.comprobante_url)) ?? null } : g
  );
}

export function useGastos() {
  const [gastos, setGastos] = useState<GastoRow[]>([]);
  const [papelera, setPapelera] = useState<GastoRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarGastos = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase.from("gastos").select("*").order("fecha", { ascending: false });
    if (err) {
      setError(err.message);
    } else {
      const todos = await agregarEnlacesDeFotos(data as GastoRow[]);
      setGastos(todos.filter((g) => !g.borrado));
      setPapelera(todos.filter((g) => g.borrado));
      setError(null);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargarGastos();
  }, [cargarGastos]);

  async function agregarGasto(nuevo: NuevoGasto) {
    const { data: sesion } = await supabase.auth.getUser();
    const usuario = sesion.user;

    if (!usuario) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");

    let comprobanteUrl: string | null = null;
    if (nuevo.comprobanteUri) {
      comprobanteUrl = await subirComprobante(nuevo.comprobanteUri, usuario.id);
    }

    const pagadoPor = usuario?.user_metadata?.nombre ?? usuario?.email ?? "Alguien";
    const { data: creado, error: err } = await supabase.from("gastos").insert({
      fecha: nuevo.fecha,
      item: nuevo.item,
      valor: nuevo.valor,
      moneda: nuevo.moneda ?? "COP",
      valor_cop: nuevo.valorCop ?? nuevo.valor,
      usuario_pago_id: usuario?.id,
      usuario_pago_nombre: usuario?.user_metadata?.nombre ?? usuario?.email,
      rubro: nuevo.rubro,
      es_compartido: nuevo.esCompartido,
      metodo_pago: nuevo.metodoPago ?? null,
      persona_asociada: nuevo.personaAsociada ?? null,
      nota: nuevo.nota ?? null,
      es_recurrente: nuevo.esRecurrente ?? false,
      comprobante_url: comprobanteUrl,
      ...(nuevo.deudaId ? { deuda_id: nuevo.deudaId } : {}),
    }).select().single();
    if (err) {
      if (comprobanteUrl) await supabase.storage.from(BUCKET).remove([comprobanteUrl]);
      throw err;
    }
    if (nuevo.deudaId) {
      try {
        await registrarPagoDeuda({
          deudaId: nuevo.deudaId,
          valor: nuevo.valorCop ?? nuevo.valor,
          fecha: nuevo.fecha,
          origen: "persona",
          pagadoPor,
          gastoId: creado.id,
        });
      } catch (e) {
        await supabase.from("gastos").delete().eq("id", creado.id);
        throw e;
      }
    }
    await cargarGastos();
  }

  /**
   * Edita un gasto. Si es pago de un crédito, también actualiza el valor y la fecha del pago
   * y vuelve a calcular qué cuotas quedan pagadas.
   */
  async function editarGasto(
    id: string,
    cambios: NuevoGasto & { quitarFoto?: boolean }
  ) {
    const actual = [...gastos, ...papelera].find((g) => g.id === id);
    if (!actual) throw new Error("No se encontró el gasto.");
    const { data: sesion } = await supabase.auth.getUser();
    const usuario = sesion.user;

    let comprobanteUrl = actual.comprobante_url;
    if (cambios.comprobanteUri && usuario) {
      comprobanteUrl = await subirComprobante(cambios.comprobanteUri, usuario.id);
    } else if (cambios.quitarFoto) {
      comprobanteUrl = null;
    }

    const valorCop = cambios.valorCop ?? cambios.valor;
    const { error: err } = await supabase
      .from("gastos")
      .update({
        fecha: cambios.fecha,
        item: cambios.item,
        valor: cambios.valor,
        moneda: cambios.moneda ?? "COP",
        valor_cop: valorCop,
        rubro: cambios.rubro,
        es_compartido: cambios.esCompartido,
        nota: cambios.nota ?? null,
        comprobante_url: comprobanteUrl,
      })
      .eq("id", id);
    if (err) throw err;

    // la foto anterior ya no se usa
    if (actual.comprobante_url && actual.comprobante_url !== comprobanteUrl) {
      await supabase.storage.from(BUCKET).remove([rutaDeComprobante(actual.comprobante_url)]);
    }

    if (actual.deuda_id) {
      const { error: errPago } = await supabase.from("pagos_deuda").update({ valor: Math.round(valorCop), fecha: cambios.fecha }).eq("gasto_id", id);
      if (errPago) throw new Error(`Se guardó el gasto, pero no se pudo actualizar el pago del crédito: ${errPago.message}`);
      await reaplicarPagos(actual.deuda_id);
    }
    await cargarGastos();
  }

  async function moverAPapelera(id: string) {
    const { data: sesion } = await supabase.auth.getUser();
    const nombre = sesion.user?.user_metadata?.nombre ?? sesion.user?.email ?? "Alguien";
    const { error: err } = await supabase
      .from("gastos")
      .update({ borrado: true, fecha_borrado: new Date().toISOString(), borrado_por: nombre })
      .eq("id", id);
    if (err) throw err;
    const g = gastos.find((x) => x.id === id);
    if (g?.deuda_id) await reaplicarPagos(g.deuda_id); // la cuota deja de contar como pagada
    await cargarGastos();
  }

  async function restaurarGasto(id: string) {
    const { data: sesion } = await supabase.auth.getUser();
    const nombre = sesion.user?.user_metadata?.nombre ?? sesion.user?.email ?? "Alguien";
    const { error: err } = await supabase
      .from("gastos")
      .update({ borrado: false, restaurado_por: nombre, restaurado_en: new Date().toISOString() })
      .eq("id", id);
    if (err) throw err;
    const g = papelera.find((x) => x.id === id);
    if (g?.deuda_id) await reaplicarPagos(g.deuda_id);
    await cargarGastos();
  }

  async function borrarGasto(id: string) {
    const fila = [...gastos, ...papelera].find((g) => g.id === id);
    const { error: err } = await supabase.from("gastos").delete().eq("id", id);
    if (err) throw err;
    if (fila?.deuda_id) await reaplicarPagos(fila.deuda_id); // el pago se borró junto con el gasto
    if (fila?.comprobante_url) {
      await supabase.storage.from(BUCKET).remove([rutaDeComprobante(fila.comprobante_url)]);
    }
    await cargarGastos();
  }

  function generarCSV(lista: GastoRow[]): string {
    const encabezado = "Fecha,Item,Valor,Rubro,Pagado por,Compartido,Nota\n";
    const filas = lista
      .map((g) =>
        [g.fecha, `"${g.item.replace(/"/g, '""')}"`, g.valor, g.rubro ?? "", g.usuario_pago_nombre ?? "", g.es_compartido ? "Sí" : "No", `"${(g.nota ?? "").replace(/"/g, '""')}"`].join(",")
      )
      .join("\n");
    return encabezado + filas;
  }

  return {
    gastos,
    papelera,
    cargando,
    error,
    agregarGasto,
    editarGasto,
    moverAPapelera,
    restaurarGasto,
    borrarGasto,
    generarCSV,
    recargar: cargarGastos,
  };
}
