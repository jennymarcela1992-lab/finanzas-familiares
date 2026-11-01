import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";

export interface DeduccionRow {
  id: string;
  nombre: string;
  monto: number;
}

export interface NominaConDeducciones {
  id: string;
  usuario_nombre: string | null;
  mes: string;
  sueldo_bruto: number;
  deducciones: DeduccionRow[];
  totalDeducciones: number;
  netoCalculado: number;
}

export interface NuevaDeduccion {
  nombre: string;
  monto: number;
}

export function useNomina() {
  const [nominas, setNominas] = useState<NominaConDeducciones[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: nominaData, error: errN } = await supabase
      .from("nomina_mensual")
      .select("*")
      .order("mes", { ascending: false });
    if (errN) {
      setError(errN.message);
      setCargando(false);
      return;
    }
    const { data: deduccionesData, error: errD } = await supabase.from("deducciones_nomina").select("*");
    if (errD) {
      setError(errD.message);
      setCargando(false);
      return;
    }

    const combinadas: NominaConDeducciones[] = (nominaData ?? []).map((n: any) => {
      const deduccionesDeEsta = (deduccionesData ?? []).filter((d: any) => d.nomina_id === n.id);
      const totalDeducciones = deduccionesDeEsta.reduce((sum: number, d: any) => sum + Number(d.monto), 0);
      return {
        ...n,
        deducciones: deduccionesDeEsta,
        totalDeducciones,
        netoCalculado: Number(n.sueldo_bruto) - totalDeducciones,
      };
    });

    setNominas(combinadas);
    setError(null);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crearNomina(mes: string, sueldoBruto: number, deducciones: NuevaDeduccion[]) {
    const { data: sesion } = await supabase.auth.getUser();
    const usuario = sesion.user;

    const { data: nominaCreada, error: errN } = await supabase
      .from("nomina_mensual")
      .insert({
        usuario_id: usuario?.id,
        usuario_nombre: usuario?.user_metadata?.nombre ?? usuario?.email,
        mes,
        sueldo_bruto: sueldoBruto,
      })
      .select()
      .single();
    if (errN) throw errN;

    if (deducciones.length > 0) {
      const filas = deducciones.map((d) => ({ nomina_id: nominaCreada.id, nombre: d.nombre, monto: d.monto }));
      const { error: errD } = await supabase.from("deducciones_nomina").insert(filas);
      if (errD) throw errD;
    }

    await cargar();
  }

  return { nominas, cargando, error, crearNomina, recargar: cargar };
}
