import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";

export interface AporteRow {
  id: string;
  meta_id: string;
  usuario_nombre: string | null;
  monto: number;
  fecha: string;
  nota: string | null;
}

export interface MetaAhorro {
  id: string;
  nombre: string;
  moneda: string;
  monto_objetivo: number;
  aportes: AporteRow[];
  totalAportado: number;
  progreso: number; // 0 a 1
}

export function useAhorros() {
  const [metas, setMetas] = useState<MetaAhorro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: metasData, error: errMetas } = await supabase
      .from("metas_ahorro")
      .select("*")
      .order("creado_en", { ascending: false });

    if (errMetas) {
      setError(errMetas.message);
      setCargando(false);
      return;
    }

    const { data: aportesData, error: errAportes } = await supabase
      .from("aportes_ahorro")
      .select("*")
      .order("fecha", { ascending: false });

    if (errAportes) {
      setError(errAportes.message);
      setCargando(false);
      return;
    }

    const combinadas: MetaAhorro[] = (metasData ?? []).map((m: any) => {
      const aportesDeMeta = (aportesData ?? []).filter((a: any) => a.meta_id === m.id);
      const totalAportado = aportesDeMeta.reduce((sum: number, a: any) => sum + Number(a.monto), 0);
      return {
        ...m,
        aportes: aportesDeMeta,
        totalAportado,
        progreso: m.monto_objetivo > 0 ? Math.min(totalAportado / m.monto_objetivo, 1) : 0,
      };
    });

    setMetas(combinadas);
    setError(null);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crearMeta(nombre: string, montoObjetivo: number, moneda = "COP") {
    const { error: err } = await supabase.from("metas_ahorro").insert({ nombre, monto_objetivo: montoObjetivo, moneda });
    if (err) throw err;
    await cargar();
  }

  async function agregarAporte(metaId: string, monto: number, nota?: string) {
    const { data: sesion } = await supabase.auth.getUser();
    const usuario = sesion.user;
    const { error: err } = await supabase.from("aportes_ahorro").insert({
      meta_id: metaId,
      monto,
      nota: nota || null,
      usuario_id: usuario?.id,
      usuario_nombre: usuario?.user_metadata?.nombre ?? usuario?.email,
    });
    if (err) throw err;
    await cargar();
  }

  return { metas, cargando, error, crearMeta, agregarAporte, recargar: cargar };
}
