import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";

export interface RenglonResumen {
  etiqueta: string;
  valor: number;
}

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function useResumenGastos(mes: string = mesActual()) {
  const [porRubro, setPorRubro] = useState<RenglonResumen[]>([]);
  const [porPersona, setPorPersona] = useState<RenglonResumen[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const inicioMes = `${mes}-01`;
    const [anio, mesNum] = mes.split("-").map(Number);
    const finMes = new Date(anio, mesNum, 0).toISOString().slice(0, 10);

    const { data } = await supabase.from("gastos").select("rubro, valor, valor_cop, usuario_pago_nombre").gte("fecha", inicioMes).lte("fecha", finMes).eq("borrado", false);

    const rubros: Record<string, number> = {};
    const personas: Record<string, number> = {};
    (data ?? []).forEach((g: any) => {
      const rubro = g.rubro || "Otro";
      const persona = g.usuario_pago_nombre || "Sin registrar";
      const valorEnCop = Number(g.valor_cop ?? g.valor);
      rubros[rubro] = (rubros[rubro] || 0) + valorEnCop;
      personas[persona] = (personas[persona] || 0) + valorEnCop;
    });

    setPorRubro(Object.entries(rubros).map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor));
    setPorPersona(Object.entries(personas).map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor));
    setCargando(false);
  }, [mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { porRubro, porPersona, cargando, recargar: cargar };
}
