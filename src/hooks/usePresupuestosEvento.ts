import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";

export interface ItemPresupuestoRow {
  id: string;
  nombre: string;
  valor_planeado: number;
  valor_real: number | null;
}

export interface PresupuestoConItems {
  id: string;
  nombre: string;
  fecha: string;
  items: ItemPresupuestoRow[];
  totalPlaneado: number;
  totalReal: number;
  diferencia: number;
}

export function usePresupuestosEvento() {
  const [presupuestos, setPresupuestos] = useState<PresupuestoConItems[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: presData, error: errP } = await supabase
      .from("presupuestos_evento")
      .select("*")
      .order("fecha", { ascending: false });
    if (errP) {
      setError(errP.message);
      setCargando(false);
      return;
    }
    const { data: itemsData, error: errI } = await supabase.from("items_presupuesto").select("*");
    if (errI) {
      setError(errI.message);
      setCargando(false);
      return;
    }

    const combinados: PresupuestoConItems[] = (presData ?? []).map((p: any) => {
      const itemsDeEste = (itemsData ?? []).filter((i: any) => i.presupuesto_id === p.id);
      const totalPlaneado = itemsDeEste.reduce((s: number, i: any) => s + Number(i.valor_planeado), 0);
      const totalReal = itemsDeEste.reduce((s: number, i: any) => s + Number(i.valor_real ?? 0), 0);
      return { ...p, items: itemsDeEste, totalPlaneado, totalReal, diferencia: totalPlaneado - totalReal };
    });

    setPresupuestos(combinados);
    setError(null);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crearPresupuesto(nombre: string, fecha: string) {
    const { data, error: err } = await supabase.from("presupuestos_evento").insert({ nombre, fecha }).select().single();
    if (err) throw err;
    await cargar();
    return data.id as string;
  }

  async function agregarItem(presupuestoId: string, nombreItem: string, valorPlaneado: number) {
    const { error: err } = await supabase.from("items_presupuesto").insert({ presupuesto_id: presupuestoId, nombre: nombreItem, valor_planeado: valorPlaneado });
    if (err) throw err;
    await cargar();
  }

  async function registrarValorReal(itemId: string, valorReal: number) {
    const { error: err } = await supabase.from("items_presupuesto").update({ valor_real: valorReal }).eq("id", itemId);
    if (err) throw err;
    await cargar();
  }

  return { presupuestos, cargando, error, crearPresupuesto, agregarItem, registrarValorReal, recargar: cargar };
}
