import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";

export function useTasasCambio() {
  const [tasas, setTasas] = useState<Record<string, number>>({ COP: 1 });
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase.from("tasas_cambio").select("*");
    const mapa: Record<string, number> = { COP: 1 };
    (data ?? []).forEach((t: any) => (mapa[t.moneda] = Number(t.tasa_a_cop)));
    setTasas(mapa);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function actualizarTasa(moneda: string, tasa: number) {
    const { error } = await supabase.from("tasas_cambio").upsert({ moneda, tasa_a_cop: tasa, actualizado_en: new Date().toISOString() });
    if (error) throw error;
    await cargar();
  }

  function convertirACOP(valor: number, moneda: string): number {
    return moneda === "COP" ? valor : valor * (tasas[moneda] ?? 1);
  }

  return { tasas, cargando, actualizarTasa, convertirACOP, recargar: cargar };
}
