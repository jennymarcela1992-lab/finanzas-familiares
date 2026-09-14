import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";

export interface GastoRow {
  id: string;
  fecha: string;
  item: string;
  valor: number;
  moneda: string;
  usuario_pago_nombre: string | null;
  persona_asociada: string | null;
  es_compartido: boolean;
  rubro: string | null;
  metodo_pago: string | null;
  nota: string | null;
  es_recurrente: boolean;
  comprobante_url: string | null;
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
}

async function subirComprobante(uriLocal: string): Promise<string | null> {
  const respuesta = await fetch(uriLocal);
  const blob = await respuesta.blob();
  const extension = uriLocal.split(".").pop()?.split("?")[0] || "jpg";
  const nombreArchivo = `${Date.now()}.${extension}`;

  const { error: errSubida } = await supabase.storage.from("comprobantes").upload(nombreArchivo, blob, {
    contentType: blob.type || "image/jpeg",
  });
  if (errSubida) throw errSubida;

  const { data } = supabase.storage.from("comprobantes").getPublicUrl(nombreArchivo);
  return data.publicUrl;
}

export function useGastos() {
  const [gastos, setGastos] = useState<GastoRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarGastos = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase
      .from("gastos")
      .select("*")
      .order("fecha", { ascending: false });
    if (err) {
      setError(err.message);
    } else {
      setGastos(data as GastoRow[]);
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

    let comprobanteUrl: string | null = null;
    if (nuevo.comprobanteUri) {
      comprobanteUrl = await subirComprobante(nuevo.comprobanteUri);
    }

    const { error: err } = await supabase.from("gastos").insert({
      fecha: nuevo.fecha,
      item: nuevo.item,
      valor: nuevo.valor,
      moneda: "COP",
      usuario_pago_id: usuario?.id,
      usuario_pago_nombre: usuario?.user_metadata?.nombre ?? usuario?.email,
      rubro: nuevo.rubro,
      es_compartido: nuevo.esCompartido,
      metodo_pago: nuevo.metodoPago ?? null,
      persona_asociada: nuevo.personaAsociada ?? null,
      nota: nuevo.nota ?? null,
      es_recurrente: nuevo.esRecurrente ?? false,
      comprobante_url: comprobanteUrl,
    });
    if (err) throw err;
    await cargarGastos();
  }

  async function borrarGasto(id: string) {
    const { error: err } = await supabase.from("gastos").delete().eq("id", id);
    if (err) throw err;
    await cargarGastos();
  }

  return { gastos, cargando, error, agregarGasto, borrarGasto, recargar: cargarGastos };
}
