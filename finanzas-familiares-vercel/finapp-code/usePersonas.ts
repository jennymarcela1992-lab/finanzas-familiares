import { useEffect, useState } from "react";
import { supabase } from "../config/supabase";

/** Nombres de las personas del hogar (usuarios registrados), con el usuario actual primero. */
export function usePersonas() {
  const [personas, setPersonas] = useState<string[]>([]);
  const [yo, setYo] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: sesion } = await supabase.auth.getUser();
      const actual = sesion.user?.user_metadata?.nombre ?? sesion.user?.email ?? "";
      const { data } = await supabase.from("usuarios").select("nombre, email");
      const nombres = new Set<string>();
      if (actual) nombres.add(actual);
      (data ?? []).forEach((u: any) => (u.nombre || u.email) && nombres.add(u.nombre || u.email));
      setYo(actual);
      setPersonas(Array.from(nombres));
    })();
  }, []);

  return { personas, yo };
}
