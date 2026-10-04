import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";

export interface MovimientoRow {
  id: string;
  tipo: "ingreso" | "egreso";
  concepto: string | null;
  monto: number;
  fecha: string;
}

export interface InversionConIndicadores {
  id: string;
  nombre: string;
  tipo: string | null;
  inversion_inicial: number;
  horizonte_meses: number | null;
  movimientos: MovimientoRow[];
  totalIngresos: number;
  totalEgresos: number;
  utilidadNeta: number;
  roi: number; // %
  margenNeto: number; // %
  flujoCaja: number;
}

export interface NuevaInversion {
  nombre: string;
  tipo?: string;
  inversionInicial: number;
  horizonteMeses?: number;
}

export function useInversiones() {
  const [inversiones, setInversiones] = useState<InversionConIndicadores[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: invData, error: errI } = await supabase.from("inversiones").select("*").order("creado_en", { ascending: false });
    if (errI) {
      setError(errI.message);
      setCargando(false);
      return;
    }
    const { data: movData, error: errM } = await supabase.from("movimientos_inversion").select("*").order("fecha", { ascending: false });
    if (errM) {
      setError(errM.message);
      setCargando(false);
      return;
    }

    const combinadas: InversionConIndicadores[] = (invData ?? []).map((inv: any) => {
      const movs = (movData ?? []).filter((m: any) => m.inversion_id === inv.id);
      const totalIngresos = movs.filter((m: any) => m.tipo === "ingreso").reduce((s: number, m: any) => s + Number(m.monto), 0);
      const totalEgresos = movs.filter((m: any) => m.tipo === "egreso").reduce((s: number, m: any) => s + Number(m.monto), 0);
      const utilidadNeta = totalIngresos - totalEgresos;
      return {
        ...inv,
        movimientos: movs,
        totalIngresos,
        totalEgresos,
        utilidadNeta,
        roi: inv.inversion_inicial > 0 ? (utilidadNeta / Number(inv.inversion_inicial)) * 100 : 0,
        margenNeto: totalIngresos > 0 ? (utilidadNeta / totalIngresos) * 100 : 0,
        flujoCaja: utilidadNeta,
      };
    });

    setInversiones(combinadas);
    setError(null);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crearInversion(nueva: NuevaInversion) {
    const { error: err } = await supabase.from("inversiones").insert({
      nombre: nueva.nombre,
      tipo: nueva.tipo ?? null,
      inversion_inicial: nueva.inversionInicial,
      horizonte_meses: nueva.horizonteMeses ?? null,
    });
    if (err) throw err;
    await cargar();
  }

  async function agregarMovimiento(inversionId: string, tipo: "ingreso" | "egreso", monto: number, concepto?: string) {
    const { error: err } = await supabase.from("movimientos_inversion").insert({ inversion_id: inversionId, tipo, monto, concepto: concepto ?? null });
    if (err) throw err;
    await cargar();
  }

  return { inversiones, cargando, error, crearInversion, agregarMovimiento, recargar: cargar };
}
