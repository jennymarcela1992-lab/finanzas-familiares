import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";
import { personasDelHogar, aportesDelMes, nombreCanonico } from "../utils/aportes";

export interface AportePersonaMes {
  usuarioId: string | null;
  usuarioNombre: string;
  aporte: number;
  esBase: boolean; // true = usa el aporte base (no se ajustó este mes)
  pagado: number;
  saldo: number; // aporte - pagado
}

export interface ResumenMes {
  mes: string;
  personas: AportePersonaMes[];
  totalAportes: number;
  totalPagado: number;
  excedente: number; // totalAportes - totalPagado (positivo = sobró dinero del compromiso)
}

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function useCierreMensual(mes: string = mesActual()) {
  const [resumen, setResumen] = useState<ResumenMes | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);

    const inicioMes = `${mes}-01`;
    const [anio, mesNum] = mes.split("-").map(Number);
    const finMes = new Date(anio, mesNum, 0).toISOString().slice(0, 10);

    const { data: aportesData, error: errA } = await supabase.from("aportes_mes").select("*").eq("mes", mes);
    if (errA) {
      setError(errA.message);
      setCargando(false);
      return;
    }

    const { data: gastosData, error: errG } = await supabase
      .from("gastos")
      .select("*")
      .eq("es_compartido", true)
      .or("borrado.is.null,borrado.eq.false")
      .gte("fecha", inicioMes)
      .lte("fecha", finMes);
    if (errG) {
      setError(errG.message);
      setCargando(false);
      return;
    }

    // Personas del hogar con su aporte del mes (base de $3.000.000 si no se ajustó) + quienes pagaron gastos
    const hogar = await personasDelHogar();
    const aportes = aportesDelMes(mes, hogar.personas, (aportesData ?? []) as any[], hogar.mesInicio);
    const nombres = new Set<string>(aportes.map((a) => a.nombre));
    // el mismo nombre escrito distinto (ej. "Jhon Fredy Ostos Torres" y "Jhon Ostos") cuenta como una persona
    const canon = (n: string) => nombreCanonico(n, Array.from(nombres));
    (gastosData ?? []).forEach((g: any) => g.usuario_pago_nombre && nombres.add(canon(g.usuario_pago_nombre)));

    const personas: AportePersonaMes[] = Array.from(nombres).map((nombre) => {
      const aporteRow = (aportesData ?? []).find((a: any) => a.usuario_nombre === nombre);
      const ap = aportes.find((a) => a.nombre === nombre);
      const pagado = (gastosData ?? [])
        .filter((g: any) => g.usuario_pago_nombre && canon(g.usuario_pago_nombre) === nombre)
        .reduce((s: number, g: any) => s + Number(g.valor_cop ?? g.valor), 0);
      const aporte = ap?.aporte ?? 0;
      return { usuarioId: aporteRow?.usuario_id ?? null, usuarioNombre: nombre, aporte, esBase: ap?.esBase ?? false, pagado, saldo: aporte - pagado };
    });

    const totalAportes = personas.reduce((s, p) => s + p.aporte, 0);
    const totalPagado = personas.reduce((s, p) => s + p.pagado, 0);

    setResumen({ mes, personas, totalAportes, totalPagado, excedente: totalAportes - totalPagado });
    setError(null);
    setCargando(false);
  }, [mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function definirAporte(usuarioNombre: string, aporte: number, usuarioId?: string) {
    // Busca si ya existe un aporte para esta persona este mes; si sí, lo actualiza, si no, lo crea
    const { data: existente } = await supabase.from("aportes_mes").select("id").eq("mes", mes).eq("usuario_nombre", usuarioNombre).maybeSingle();

    if (existente) {
      const { error: err } = await supabase.from("aportes_mes").update({ aporte }).eq("id", existente.id);
      if (err) throw err;
    } else {
      const { error: err } = await supabase.from("aportes_mes").insert({ mes, usuario_id: usuarioId ?? null, usuario_nombre: usuarioNombre, aporte });
      if (err) throw err;
    }
    await cargar();
  }

  /** Envía el excedente del mes a una meta de ahorro ya existente (tabla aportes_ahorro del módulo de Ahorros). */
  async function enviarExcedenteAAhorro(metaId: string, monto: number, nota?: string) {
    const { data: sesion } = await supabase.auth.getUser();
    const usuario = sesion.user;
    const { error: err } = await supabase.from("aportes_ahorro").insert({
      meta_id: metaId,
      monto,
      nota: nota ?? `Excedente del cierre de ${mes}`,
      usuario_id: usuario?.id,
      usuario_nombre: usuario?.user_metadata?.nombre ?? usuario?.email,
    });
    if (err) throw err;
  }

  return { resumen, cargando, error, definirAporte, enviarExcedenteAAhorro, recargar: cargar };
}
