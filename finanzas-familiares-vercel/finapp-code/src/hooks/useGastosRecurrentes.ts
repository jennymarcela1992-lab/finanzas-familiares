import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";
import { asegurarAutomaticos, reiniciarAutomaticos } from "../utils/automaticos";

export interface GastoRecurrente {
  id: string;
  item: string;
  valor: number;
  rubro: string | null;
  usuario_pago_nombre: string | null;
  es_compartido: boolean;
  dia: number;
  desde: string;
  hasta: string | null;
  propiedad_id: string | null;
  vehiculo_id: string | null;
  nota: string | null;
  activo: boolean;
  ultima_generada: string | null;
}

export interface NuevoRecurrente {
  item: string;
  valor: number;
  rubro: string;
  pagadoPor: string;
  esCompartido: boolean;
  dia: number;
  desde: string;
  hasta: string | null;
  propiedadId?: string | null;
  vehiculoId?: string | null;
  nota?: string;
}

/** Gastos automáticos: se anotan solos cada mes, a nombre de quien los paga, hasta la fecha indicada. */
export function useGastosRecurrentes() {
  const [recurrentes, setRecurrentes] = useState<GastoRecurrente[]>([]);
  const cargar = useCallback(async () => {
    const { data } = await supabase.from("gastos_recurrentes").select("*").order("creado_en", { ascending: false });
    setRecurrentes((data ?? []) as GastoRecurrente[]);
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Crea el gasto automático y anota de una vez los meses que ya pasaron desde `desde`. */
  async function crearRecurrente(n: NuevoRecurrente) {
    const { error } = await supabase.from("gastos_recurrentes").insert({
      item: n.item,
      valor: Math.round(n.valor),
      rubro: n.rubro,
      usuario_pago_nombre: n.pagadoPor,
      es_compartido: n.esCompartido,
      dia: n.dia,
      desde: n.desde,
      hasta: n.hasta,
      propiedad_id: n.propiedadId ?? null,
      vehiculo_id: n.vehiculoId ?? null,
      nota: n.nota ?? null,
      activo: true,
    });
    if (error) throw error;
    reiniciarAutomaticos();
    await asegurarAutomaticos();
    await cargar();
  }

  async function actualizarRecurrente(id: string, cambios: Partial<Pick<GastoRecurrente, "valor" | "hasta" | "activo" | "usuario_pago_nombre" | "dia">>) {
    const { error } = await supabase.from("gastos_recurrentes").update(cambios).eq("id", id);
    if (error) throw error;
    reiniciarAutomaticos();
    await asegurarAutomaticos();
    await cargar();
  }

  /** Borra el gasto automático. Los gastos ya anotados se conservan. */
  async function eliminarRecurrente(id: string) {
    const { error } = await supabase.from("gastos_recurrentes").delete().eq("id", id);
    if (error) throw error;
    await cargar();
  }

  return { recurrentes, crearRecurrente, actualizarRecurrente, eliminarRecurrente, recargar: cargar };
}
