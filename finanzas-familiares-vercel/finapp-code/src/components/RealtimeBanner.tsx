import React, { useEffect, useRef, useState } from "react";
import { Animated, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../config/supabase";
import { useAuth } from "../hooks/useAuth";
import { colors, spacing, radius } from "../theme/theme";

export default function RealtimeBanner() {
  const { usuario } = useAuth();
  const insets = useSafeAreaInsets();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const translateY = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (!usuario) return;

    const canal = supabase
      .channel("gastos-en-vivo")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "gastos" },
        (payload) => {
          const gasto: any = payload.new;
          // No te avises a ti mismo de tu propio gasto
          if (gasto.usuario_pago_id === usuario.id) return;
          const nombre = gasto.usuario_pago_nombre ?? "Tu pareja";
          mostrarAviso(`${nombre} registró: ${gasto.item} · $${Number(gasto.valor).toLocaleString("es-CO")}`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [usuario?.id]);

  function mostrarAviso(texto: string) {
    setMensaje(texto);
    Animated.sequence([
      Animated.timing(translateY, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.delay(3200),
      Animated.timing(translateY, { toValue: -100, duration: 220, useNativeDriver: true }),
    ]).start(() => setMensaje(null));
  }

  if (!mensaje) return null;

  return (
    <Animated.View style={[styles.banner, { top: insets.top + 8, transform: [{ translateY }] }]}>
      <Ionicons name="notifications" size={16} color={colors.white} />
      <Text style={styles.texto} numberOfLines={2}>
        {mensaje}
      </Text>
      <TouchableOpacity onPress={() => setMensaje(null)}>
        <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 100,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  texto: { color: colors.white, fontSize: 12, fontWeight: "600", flex: 1 },
});
