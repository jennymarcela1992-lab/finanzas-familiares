import { useEffect, useState } from "react";
import { personasDelHogar } from "../utils/aportes";

/**
 * Personas del hogar (usuarios registrados y las agregadas en Ingresos), sin repetir a nadie.
 * El usuario actual va primero. Así cualquiera puede anotar que pagó la otra persona.
 */
export function usePersonas() {
  const [personas, setPersonas] = useState<string[]>([]);
  const [yo, setYo] = useState<string>("");

  useEffect(() => {
    personasDelHogar().then((h) => {
      setYo(h.yo);
      setPersonas(h.personas);
    });
  }, []);

  return { personas, yo };
}
