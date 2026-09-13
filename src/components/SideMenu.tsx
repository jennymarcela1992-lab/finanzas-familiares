import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius } from "../theme/theme";

const ANCHO_MENU = Math.min(280, Dimensions.get("window").width * 0.78);

export type ItemMenu = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap };
export type SeccionMenu = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; items: ItemMenu[] };
export type EntradaMenu = { tipo: "item"; item: ItemMenu } | { tipo: "seccion"; seccion: SeccionMenu };

interface Props {
  visible: boolean;
  activeScreen: string;
  entradas: EntradaMenu[];
  onSelect: (key: string) => void;
  onClose: () => void;
}

export default function SideMenu({ visible, activeScreen, entradas, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-ANCHO_MENU)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [montado, setMontado] = useState(visible);

  const [expandidas, setExpandidas] = useState<Record<string, boolean>>(() => {
    const inicial: Record<string, boolean> = {};
    entradas.forEach((e) => {
      if (e.tipo === "seccion" && e.seccion.items.some((it) => it.key === activeScreen)) inicial[e.seccion.key] = true;
    });
    return inicial;
  });

  useEffect(() => {
    if (visible) {
      setMontado(true);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -ANCHO_MENU, duration: 200, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setMontado(false));
    }
  }, [visible]);

  if (!montado) return null;

  function alternarSeccion(key: string) {
    setExpandidas((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <View style={styles.overlayWrap} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.panel, { width: ANCHO_MENU, paddingTop: insets.top + spacing.lg, transform: [{ translateX }] }]}>
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Ionicons name="home" size={16} color={colors.white} />
          </View>
          <Text style={styles.brandText}>Finanzas Familiares</Text>
        </View>

        <View style={{ marginTop: spacing.lg }}>
          {entradas.map((entrada) => {
            if (entrada.tipo === "item") {
              const it = entrada.item;
              const activo = activeScreen === it.key;
              return (
                <TouchableOpacity key={it.key} style={[styles.itemRow, activo && styles.itemRowActivo]} onPress={() => onSelect(it.key)}>
                  <Ionicons name={it.icon} size={18} color={activo ? colors.white : colors.textSecondary} />
                  <Text style={[styles.itemLabel, activo && styles.itemLabelActivo]}>{it.label}</Text>
                </TouchableOpacity>
              );
            }

            const sec = entrada.seccion;
            const abierta = !!expandidas[sec.key];
            const contieneActivo = sec.items.some((it) => it.key === activeScreen);
            return (
              <View key={sec.key} style={{ marginBottom: 2 }}>
                <TouchableOpacity style={styles.seccionHeader} onPress={() => alternarSeccion(sec.key)}>
                  <View style={styles.seccionHeaderLeft}>
                    <Ionicons name={sec.icon} size={18} color={contieneActivo ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.seccionLabel, contieneActivo && styles.seccionLabelActiva]}>{sec.label}</Text>
                  </View>
                  <Ionicons name={abierta ? "chevron-down" : "chevron-forward"} size={16} color={colors.textMuted} />
                </TouchableOpacity>

                {abierta && (
                  <View style={styles.subItemsWrap}>
                    {sec.items.map((it) => {
                      const activo = activeScreen === it.key;
                      return (
                        <TouchableOpacity key={it.key} style={[styles.subItemRow, activo && styles.subItemRowActivo]} onPress={() => onSelect(it.key)}>
                          <Text style={[styles.subItemLabel, activo && styles.subItemLabelActivo]}>{it.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(13,74,63,0.35)" },
  panel: { position: "absolute", top: 0, bottom: 0, left: 0, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.sm },
  brandIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  brandText: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: radius.sm, marginBottom: 2 },
  itemRowActivo: { backgroundColor: colors.primary },
  itemLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: "600" },
  itemLabelActivo: { color: colors.white },
  seccionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 10 },
  seccionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  seccionLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: "600" },
  seccionLabelActiva: { color: colors.primary },
  subItemsWrap: { marginLeft: 30, marginBottom: 4 },
  subItemRow: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.sm },
  subItemRowActivo: { backgroundColor: colors.primaryLight },
  subItemLabel: { fontSize: 13, color: colors.textMuted },
  subItemLabelActivo: { color: colors.primary, fontWeight: "700" },
});
