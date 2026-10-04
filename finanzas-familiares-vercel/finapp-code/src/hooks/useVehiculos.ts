import { useState, useEffect, useCallback } from "react";
import { supabase } from "../config/supabase";

export const NOMBRES_DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export interface PagoVehiculoRow {
  id: string;
  fecha: string;
  estado: "pagado" | "no_pagado" | "descanso";
  monto: number | null;
}

export interface VehiculoConResumen {
  id: string;
  nombre: string;
  placa: string | null;
  arrendatario: string | null;
  cuota_diaria: number;
  dia_descanso: number;
  pagos: PagoVehiculoRow[];
  totalEsperadoMes: number;
  totalRecibidoMes: number;
  diasEnMora: number;
  yaRegistradoHoy: boolean;
}

export interface NuevoVehiculo {
  nombre: string;
  placa?: string;
  arrendatario?: string;
  cuotaDiaria: number;
  diaDescanso: number;
}

function inicioDeMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function useVehiculos() {
  const [vehiculos, setVehiculos] = useState<VehiculoConResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: vehData, error: errV } = await supabase.from("vehiculos").select("*").order("creado_en", { ascending: false });
    if (errV) {
      setError(errV.message);
      setCargando(false);
      return;
    }
    const { data: pagosData, error: errP } = await supabase.from("pagos_vehiculo").select("*").order("fecha", { ascending: false });
    if (errP) {
      setError(errP.message);
      setCargando(false);
      return;
    }

    const hoy = new Date();
    const hoyStr = hoy.toISOString().slice(0, 10);
    const inicio = inicioDeMes();

    const combinados: VehiculoConResumen[] = (vehData ?? []).map((v: any) => {
      const pagosDeEste = (pagosData ?? []).filter((p: any) => p.vehiculo_id === v.id);

      let totalEsperadoMes = 0;
      let totalRecibidoMes = 0;
      let diasEnMora = 0;

      for (let d = new Date(inicio); d <= hoy; d.setDate(d.getDate() + 1)) {
        const diaSemana = d.getDay();
        const fechaStr = d.toISOString().slice(0, 10);
        if (diaSemana === v.dia_descanso) continue; // día de descanso, no cuenta
        totalEsperadoMes += Number(v.cuota_diaria);
        const pagoDelDia = pagosDeEste.find((p: any) => p.fecha === fechaStr);
        if (pagoDelDia && pagoDelDia.estado === "pagado") {
          totalRecibidoMes += Number(pagoDelDia.monto ?? v.cuota_diaria);
        } else {
          diasEnMora++;
        }
      }

      return {
        ...v,
        pagos: pagosDeEste,
        totalEsperadoMes,
        totalRecibidoMes,
        diasEnMora,
        yaRegistradoHoy: pagosDeEste.some((p: any) => p.fecha === hoyStr),
      };
    });

    setVehiculos(combinados);
    setError(null);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crearVehiculo(nuevo: NuevoVehiculo) {
    const { error: err } = await supabase.from("vehiculos").insert({
      nombre: nuevo.nombre,
      placa: nuevo.placa ?? null,
      arrendatario: nuevo.arrendatario ?? null,
      cuota_diaria: nuevo.cuotaDiaria,
      dia_descanso: nuevo.diaDescanso,
    });
    if (err) throw err;
    await cargar();
  }

  async function registrarPagoHoy(vehiculoId: string, estado: "pagado" | "no_pagado", monto?: number) {
    const hoyStr = new Date().toISOString().slice(0, 10);
    const { error: err } = await supabase.from("pagos_vehiculo").insert({ vehiculo_id: vehiculoId, fecha: hoyStr, estado, monto: monto ?? null });
    if (err) throw err;
    await cargar();
  }

  return { vehiculos, cargando, error, crearVehiculo, registrarPagoHoy, recargar: cargar, NOMBRES_DIAS };
}
