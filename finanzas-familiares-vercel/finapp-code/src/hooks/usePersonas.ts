import { useEffect, useState } from "react";
import { supabase } from "../config/supabase";
import { personasDelHogar } from "../utils/aportes";

/**
 * Personas del hogar: usuarios registrados y las que se agregaron a mano en Ingresos
 * (no necesitan usuario en la app). El usuario actual va primero.
 * Así cualquiera puede anotar que pagó la otra persona.
 */
export function usePersonas() {
  const [personas, setPersonas] = useState<string[]>([]);
  const [yo, setYo] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [{ data: sesion }, hogar] = await Promise.all([supabase.auth.getUser(), personasDelHogar()]);
      const actual = sesion.user?.user_metadata?.nombre ?? sesion.user?.email ?? "";
      const nombres = new Set<string>();
      if (actual) nombres.add(actual);
      hogar.personas.forEach((n) => n && nombres.add(n));
      setYo(actual);
      setPersonas(Array.from(nombres));
    })();
  }, []);

  return { personas, yo };
}
