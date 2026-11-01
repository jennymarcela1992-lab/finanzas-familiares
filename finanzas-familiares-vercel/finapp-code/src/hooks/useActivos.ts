import { useEffect, useState, useCallback } from "react";
import { supabase } from "../config/supabase";

export interface Activo {
  id: string;
  nombre: string;
  tipo: "propiedad" | "vehiculo";
}

/** Propiedades y vehículos del hogar (para asociarles gastos y créditos). */
export function useActivos() {
  const [activos, setActivos] = useState<Activo[]>([]);
  const cargar = useCallback(async () => {
    const [rP, rV] = await Promise.all([
      supabase.from("propiedades").select("id, nombre").order("nombre"),
      supabase.from("vehiculos").select("id, nombre").order("nombre"),
    ]);
    setActivos([
      ...(rP.data ?? []).map((p: any) => ({ id: p.id, nombre: p.nombre, tipo: "propiedad" as const })),
      ...(rV.data ?? []).map((v: any) => ({ id: v.id, nombre: v.nombre, tipo: "vehiculo" as const })),
    ]);
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);
  return { activos, recargar: cargar };
}
