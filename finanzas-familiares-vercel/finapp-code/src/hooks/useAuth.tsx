import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import React from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../config/supabase";

interface AuthContextType {
  usuario: Session["user"] | null;
  cargando: boolean;
  registrar: (email: string, password: string, nombre: string) => Promise<void>;
  iniciarSesion: (email: string, password: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Session["user"] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUsuario(data.session?.user ?? null);
      setCargando(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUsuario(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function registrar(email: string, password: string, nombre: string) {
    setError(null);
    const { data, error: errRegistro } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre } },
    });
    if (errRegistro) {
      setError(traducirErrorSupabase(errRegistro.message));
      throw errRegistro;
    }
    if (data.user) {
      await supabase.from("usuarios").insert({ id: data.user.id, nombre, email });
    }
  }

  async function iniciarSesion(email: string, password: string) {
    setError(null);
    const { error: errLogin } = await supabase.auth.signInWithPassword({ email, password });
    if (errLogin) {
      setError(traducirErrorSupabase(errLogin.message));
      throw errLogin;
    }
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, registrar, iniciarSesion, cerrarSesion, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

function traducirErrorSupabase(mensaje: string): string {
  const mapa: Record<string, string> = {
    "User already registered": "Ese correo ya está registrado.",
    "Invalid login credentials": "Correo o contraseña incorrectos.",
    "Password should be at least 6 characters": "La contraseña debe tener al menos 6 caracteres.",
  };
  return mapa[mensaje] || mensaje || "Ocurrió un error. Intenta de nuevo.";
}
