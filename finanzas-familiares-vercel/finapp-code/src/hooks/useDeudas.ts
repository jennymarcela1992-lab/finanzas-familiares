import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";

export interface CuotaRow {
  id: string;
  deuda_id: string;
  numero_cuota: number;
  cuota_total: number;
  capital: number;
  interes: number;
  saldo: number;
  fecha_vencimiento: string;
  estado: "pendiente" | "pagada";
  pagada_por: string | null;
}

export interface DeudaConCuotas {
  id: string;
  nombre: string;
  valor_inicial: number;
  tasa_interes: number;
  plazo_meses: number;
  entidad_pago: string | null;
  numero_cuenta: string | null;
  alias_pago: string | null;
  dias_aviso_previo: number;
  cuotas: CuotaRow[];
  cuotasPagadas: number;
  porcentajePagado: number;
  proximaCuota: CuotaRow | null;
}

export interface NuevaDeuda {
  nombre: string;
  valorInicial: number;
  tasaInteresMensual: number; // en % (ej. 1.5)
  plazoMeses: number;
  entidadPago?: string;
  numeroCuenta?: string;
  aliasPago?: string;
  diasAvisoPrevio?: number;
  fechaInicio?: string; // YYYY-MM-DD
}

/** Genera la tabla de amortización por el método francés (cuota fija). */
function calcularAmortizacion(valorInicial: number, tasaMensual: number, plazoMeses: number, fechaInicio: Date) {
  const i = tasaMensual / 100;
  const cuotaFija =
    i === 0 ? valorInicial / plazoMeses : (valorInicial * (i * Math.pow(1 + i, plazoMeses))) / (Math.pow(1 + i, plazoMeses) - 1);

  let saldo = valorInicial;
  const cuotas = [];
  for (let n = 1; n <= plazoMeses; n++) {
    const interes = saldo * i;
    const capital = cuotaFija - interes;
    saldo = Math.max(saldo - capital, 0);
    const fechaVencimiento = new Date(fechaInicio);
    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + n);
    cuotas.push({
      numero_cuota: n,
      cuota_total: Math.round(cuotaFija),
      capital: Math.round(capital),
      interes: Math.round(interes),
      saldo: Math.round(saldo),
      fecha_vencimiento: fechaVencimiento.toISOString().slice(0, 10),
      estado: "pendiente" as const,
    });
  }
  return cuotas;
}

export function useDeudas() {
  const [deudas, setDeudas] = useState<DeudaConCuotas[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: deudasData, error: errD } = await supabase.from("deudas").select("*").order("creado_en", { ascending: false });
    if (errD) {
      setError(errD.message);
      setCargando(false);
      return;
    }
    const { data: cuotasData, error: errC } = await supabase.from("cuotas_deuda").select("*").order("numero_cuota", { ascending: true });
    if (errC) {
      setError(errC.message);
      setCargando(false);
      return;
    }

    const combinadas: DeudaConCuotas[] = (deudasData ?? []).map((d: any) => {
      const cuotasDeEsta = (cuotasData ?? []).filter((c: any) => c.deuda_id === d.id);
      const cuotasPagadas = cuotasDeEsta.filter((c: any) => c.estado === "pagada").length;
      const proximaCuota = cuotasDeEsta.find((c: any) => c.estado === "pendiente") ?? null;
      return {
        ...d,
        cuotas: cuotasDeEsta,
        cuotasPagadas,
        porcentajePagado: cuotasDeEsta.length > 0 ? cuotasPagadas / cuotasDeEsta.length : 0,
        proximaCuota,
      };
    });

    setDeudas(combinadas);
    setError(null);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crearDeuda(nueva: NuevaDeuda) {
    const fechaInicio = nueva.fechaInicio ? new Date(nueva.fechaInicio) : new Date();

    const { data: deudaCreada, error: errDeuda } = await supabase
      .from("deudas")
      .insert({
        nombre: nueva.nombre,
        valor_inicial: nueva.valorInicial,
        tasa_interes: nueva.tasaInteresMensual,
        plazo_meses: nueva.plazoMeses,
        entidad_pago: nueva.entidadPago ?? null,
        numero_cuenta: nueva.numeroCuenta ?? null,
        alias_pago: nueva.aliasPago ?? null,
        dias_aviso_previo: nueva.diasAvisoPrevio ?? 3,
        fecha_inicio: fechaInicio.toISOString().slice(0, 10),
      })
      .select()
      .single();

    if (errDeuda) throw errDeuda;

    const cuotas = calcularAmortizacion(nueva.valorInicial, nueva.tasaInteresMensual, nueva.plazoMeses, fechaInicio).map((c) => ({
      ...c,
      deuda_id: deudaCreada.id,
    }));

    const { error: errCuotas } = await supabase.from("cuotas_deuda").insert(cuotas);
    if (errCuotas) throw errCuotas;

    await cargar();
  }

  async function marcarCuotaPagada(cuotaId: string) {
    const { data: sesion } = await supabase.auth.getUser();
    const nombre = sesion.user?.user_metadata?.nombre ?? sesion.user?.email ?? "Alguien";
    const { error: err } = await supabase
      .from("cuotas_deuda")
      .update({ estado: "pagada", pagada_por: nombre, fecha_pago: new Date().toISOString().slice(0, 10) })
      .eq("id", cuotaId);
    if (err) throw err;
    await cargar();
  }

  return { deudas, cargando, error, crearDeuda, marcarCuotaPagada, recargar: cargar };
}
