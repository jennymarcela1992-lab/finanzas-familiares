import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";

export interface AbonoRow {
  id: string;
  prestamo_id: string;
  monto: number;
  fecha: string;
  nota: string | null;
}

export interface PrestamoConAbonos {
  id: string;
  quien_presta: string;
  quien_recibe: string;
  monto: number;
  fecha: string;
  motivo: string | null;
  abonos: AbonoRow[];
  totalAbonado: number;
  saldoPendiente: number;
}

export interface NuevoPrestamo {
  quienPresta: string;
  quienRecibe: string;
  monto: number;
  motivo?: string;
}

export function usePrestamos() {
  const [prestamos, setPrestamos] = useState<PrestamoConAbonos[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: prestamosData, error: errP } = await supabase
      .from("prestamos_personales")
      .select("*")
      .order("fecha", { ascending: false });
    if (errP) {
      setError(errP.message);
      setCargando(false);
      return;
    }
    const { data: abonosData, error: errA } = await supabase.from("abonos_prestamo").select("*");
    if (errA) {
      setError(errA.message);
      setCargando(false);
      return;
    }

    const combinados: PrestamoConAbonos[] = (prestamosData ?? []).map((p: any) => {
      const abonosDeEste = (abonosData ?? []).filter((a: any) => a.prestamo_id === p.id);
      const totalAbonado = abonosDeEste.reduce((sum: number, a: any) => sum + Number(a.monto), 0);
      return {
        ...p,
        abonos: abonosDeEste,
        totalAbonado,
        saldoPendiente: Math.max(Number(p.monto) - totalAbonado, 0),
      };
    });

    setPrestamos(combinados);
    setError(null);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crearPrestamo(nuevo: NuevoPrestamo) {
    const { error: err } = await supabase.from("prestamos_personales").insert({
      quien_presta: nuevo.quienPresta,
      quien_recibe: nuevo.quienRecibe,
      monto: nuevo.monto,
      motivo: nuevo.motivo ?? null,
    });
    if (err) throw err;
    await cargar();
  }

  async function agregarAbono(prestamoId: string, monto: number, nota?: string) {
    const { error: err } = await supabase.from("abonos_prestamo").insert({ prestamo_id: prestamoId, monto, nota: nota ?? null });
    if (err) throw err;
    await cargar();
  }

  return { prestamos, cargando, error, crearPrestamo, agregarAbono, recargar: cargar };
}
