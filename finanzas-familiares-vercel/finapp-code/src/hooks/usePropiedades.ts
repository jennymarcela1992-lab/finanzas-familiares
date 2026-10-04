import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";

export interface ArriendoRow {
  id: string;
  mes: string;
  monto: number;
  fecha: string;
}

export interface PropiedadConDetalle {
  id: string;
  nombre: string;
  direccion: string | null;
  arrendatario: string | null;
  valor_arriendo: number;
  dia_pago_arriendo: number;
  credito_id: string | null;
  arriendos: ArriendoRow[];
  // Datos traídos del crédito asociado (módulo de Deudas), si existe
  credito: {
    nombre: string;
    entidad_pago: string | null;
    numero_cuenta: string | null;
    alias_pago: string | null;
    proximaCuotaValor: number | null;
    proximaCuotaFecha: string | null;
  } | null;
  netoMesActual: number;
}

export interface NuevaPropiedad {
  nombre: string;
  direccion?: string;
  arrendatario?: string;
  valorArriendo: number;
  diaPagoArriendo?: number;
  creditoId?: string;
}

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function usePropiedades() {
  const [propiedades, setPropiedades] = useState<PropiedadConDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: propsData, error: errP } = await supabase.from("propiedades").select("*").order("creado_en", { ascending: false });
    if (errP) {
      setError(errP.message);
      setCargando(false);
      return;
    }
    const { data: arriendosData, error: errA } = await supabase.from("arriendos_recibidos").select("*");
    if (errA) {
      setError(errA.message);
      setCargando(false);
      return;
    }

    // Traemos las deudas y cuotas asociadas para mostrar "a dónde pagar" del crédito de cada propiedad
    const creditoIds = (propsData ?? []).map((p: any) => p.credito_id).filter(Boolean);
    let deudasMap: Record<string, any> = {};
    let cuotasMap: Record<string, any[]> = {};
    if (creditoIds.length > 0) {
      const { data: deudasData } = await supabase.from("deudas").select("*").in("id", creditoIds);
      (deudasData ?? []).forEach((d: any) => (deudasMap[d.id] = d));
      const { data: cuotasData } = await supabase
        .from("cuotas_deuda")
        .select("*")
        .in("deuda_id", creditoIds)
        .eq("estado", "pendiente")
        .order("numero_cuota", { ascending: true });
      (cuotasData ?? []).forEach((c: any) => {
        if (!cuotasMap[c.deuda_id]) cuotasMap[c.deuda_id] = [];
        cuotasMap[c.deuda_id].push(c);
      });
    }

    const mes = mesActual();
    const combinadas: PropiedadConDetalle[] = (propsData ?? []).map((p: any) => {
      const arriendosDeEsta = (arriendosData ?? []).filter((a: any) => a.propiedad_id === p.id);
      const arriendoMesActual = arriendosDeEsta.find((a: any) => a.mes === mes);
      const deuda = p.credito_id ? deudasMap[p.credito_id] : null;
      const proximaCuota = p.credito_id ? cuotasMap[p.credito_id]?.[0] : null;

      return {
        ...p,
        arriendos: arriendosDeEsta,
        credito: deuda
          ? {
              nombre: deuda.nombre,
              entidad_pago: deuda.entidad_pago,
              numero_cuenta: deuda.numero_cuenta,
              alias_pago: deuda.alias_pago,
              proximaCuotaValor: proximaCuota ? Number(proximaCuota.cuota_total) : null,
              proximaCuotaFecha: proximaCuota ? proximaCuota.fecha_vencimiento : null,
            }
          : null,
        netoMesActual: (arriendoMesActual ? Number(arriendoMesActual.monto) : Number(p.valor_arriendo)) - (proximaCuota ? Number(proximaCuota.cuota_total) : 0),
      };
    });

    setPropiedades(combinadas);
    setError(null);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crearPropiedad(nueva: NuevaPropiedad) {
    const { error: err } = await supabase.from("propiedades").insert({
      nombre: nueva.nombre,
      direccion: nueva.direccion ?? null,
      arrendatario: nueva.arrendatario ?? null,
      valor_arriendo: nueva.valorArriendo,
      dia_pago_arriendo: nueva.diaPagoArriendo ?? 5,
      credito_id: nueva.creditoId ?? null,
    });
    if (err) throw err;
    await cargar();
  }

  async function registrarArriendoRecibido(propiedadId: string, monto: number, mes?: string) {
    const { error: err } = await supabase.from("arriendos_recibidos").insert({ propiedad_id: propiedadId, monto, mes: mes ?? mesActual() });
    if (err) throw err;
    await cargar();
  }

  return { propiedades, cargando, error, crearPropiedad, registrarArriendoRecibido, recargar: cargar };
}
