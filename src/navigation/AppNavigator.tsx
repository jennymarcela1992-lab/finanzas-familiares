import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";

import LoginScreen from "../screens/Auth/LoginScreen";
import DashboardScreen from "../screens/Dashboard/DashboardScreen";
import IngresosScreen from "../screens/Ingresos/IngresosScreen";
import GastosScreen from "../screens/Gastos/GastosScreen";
import AhorrosScreen from "../screens/Ahorros/AhorrosScreen";
import DeudasScreen from "../screens/Deudas/DeudasScreen";
import PrestamosScreen from "../screens/Prestamos/PrestamosScreen";
import PropiedadesScreen from "../screens/Propiedades/PropiedadesScreen";
import VehiculoScreen from "../screens/Vehiculo/VehiculoScreen";
import InversionesScreen from "../screens/Inversiones/InversionesScreen";
import EventosScreen from "../screens/Eventos/EventosScreen";
import { useAuth } from "../hooks/useAuth";
import { colors, spacing } from "../theme/theme";
import SideMenu, { EntradaMenu } from "../components/SideMenu";
import RealtimeBanner from "../components/RealtimeBanner";

const Stack = createNativeStackNavigator();

const PANTALLAS: Record<string, React.ComponentType<any>> = {
  Dashboard: DashboardScreen,
  Ingresos: IngresosScreen,
  Gastos: GastosScreen,
  Ahorros: AhorrosScreen,
  Deudas: DeudasScreen,
  Prestamos: PrestamosScreen,
  Propiedades: PropiedadesScreen,
  Vehiculo: VehiculoScreen,
  Inversiones: InversionesScreen,
  Eventos: EventosScreen,
};

const ENTRADAS_MENU: EntradaMenu[] = [
  { tipo: "item", item: { key: "Dashboard", label: "Resumen", icon: "home" } },
  {
    tipo: "seccion",
    seccion: {
      key: "finanzas",
      label: "Finanzas diarias",
      icon: "cash",
      items: [
        { key: "Ingresos", label: "Ingresos", icon: "cash" },
        { key: "Gastos", label: "Gastos", icon: "cart" },
      ],
    },
  },
  {
    tipo: "seccion",
    seccion: {
      key: "ahorros-deudas",
      label: "Ahorros y deudas",
      icon: "wallet",
      items: [
        { key: "Ahorros", label: "Ahorros", icon: "wallet" },
        { key: "Deudas", label: "Deudas y créditos", icon: "card" },
        { key: "Prestamos", label: "Préstamos personales", icon: "people" },
      ],
    },
  },
  {
    tipo: "seccion",
    seccion: {
      key: "patrimonio",
      label: "Patrimonio",
      icon: "business",
      items: [
        { key: "Propiedades", label: "Propiedades", icon: "business" },
        { key: "Vehiculo", label: "Vehículo rentado", icon: "car" },
        { key: "Inversiones", label: "Inversiones", icon: "trending-up" },
      ],
    },
  },
  { tipo: "item", item: { key: "Eventos", label: "Eventos y viajes", icon: "airplane" } },
];

const TITULOS: Record<string, string> = {
  Dashboard: "Resumen",
  Ingresos: "Ingresos",
  Gastos: "Gastos",
  Ahorros: "Ahorros",
  Deudas: "Deudas y créditos",
  Prestamos: "Préstamos",
  Propiedades: "Propiedades",
  Vehiculo: "Vehículo",
  Inversiones: "Inversiones",
  Eventos: "Eventos y viajes",
};

function HomeShell() {
  const insets = useSafeAreaInsets();
  const [activeScreen, setActiveScreen] = useState("Dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const ActiveComponent = PANTALLAS[activeScreen];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.menuButton}>
          <Ionicons name="menu" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{TITULOS[activeScreen]}</Text>
      </View>

      <View style={{ flex: 1 }}>
        <ActiveComponent />
      </View>

      <SideMenu
        visible={menuOpen}
        activeScreen={activeScreen}
        entradas={ENTRADAS_MENU}
        onSelect={(key) => {
          setActiveScreen(key);
          setMenuOpen(false);
        }}
        onClose={() => setMenuOpen(false)}
      />

      <RealtimeBanner />
    </View>
  );
}

function PantallaBloqueo({ onDesbloquear, intentando }: { onDesbloquear: () => void; intentando: boolean }) {
  return (
    <View style={styles.bloqueoContainer}>
      <View style={styles.bloqueoIcono}>
        <Ionicons name="finger-print" size={40} color={colors.white} />
      </View>
      <Text style={styles.bloqueoTitulo}>Finanzas Familiares</Text>
      <Text style={styles.bloqueoSubtitulo}>Usa tu huella o Face ID para continuar</Text>
      <TouchableOpacity style={styles.bloqueoBoton} onPress={onDesbloquear} disabled={intentando}>
        {intentando ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.bloqueoBotonTexto}>Desbloquear</Text>}
      </TouchableOpacity>
    </View>
  );
}

export default function AppNavigator() {
  const { usuario, cargando } = useAuth();
  const [desbloqueado, setDesbloqueado] = useState(Platform.OS === "web");
  const [verificando, setVerificando] = useState(false);

  async function intentarDesbloquear() {
    setVerificando(true);
    try {
      const hayHardware = await LocalAuthentication.hasHardwareAsync();
      const estaEnrolado = await LocalAuthentication.isEnrolledAsync();
      if (!hayHardware || !estaEnrolado) {
        // El dispositivo no tiene huella/Face ID configurado: no forzamos el bloqueo
        setDesbloqueado(true);
        return;
      }
      const resultado = await LocalAuthentication.authenticateAsync({ promptMessage: "Desbloquea Finanzas Familiares" });
      setDesbloqueado(resultado.success);
    } finally {
      setVerificando(false);
    }
  }

  useEffect(() => {
    if (Platform.OS === "web" || !usuario) return;
    intentarDesbloquear();
  }, [usuario?.id]);

  if (cargando) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.primary }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (usuario && !desbloqueado) {
    return <PantallaBloqueo onDesbloquear={intentarDesbloquear} intentando={verificando} />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {usuario ? <Stack.Screen name="Home" component={HomeShell} /> : <Stack.Screen name="Login" component={LoginScreen} />}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  menuButton: { marginRight: spacing.md, padding: 2 },
  topBarTitle: { color: colors.white, fontSize: 17, fontWeight: "700" },
  bloqueoContainer: { flex: 1, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  bloqueoIcono: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  bloqueoTitulo: { color: colors.white, fontSize: 20, fontWeight: "800", marginBottom: 6 },
  bloqueoSubtitulo: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginBottom: spacing.xl, textAlign: "center" },
  bloqueoBoton: { backgroundColor: colors.white, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  bloqueoBotonTexto: { color: colors.primary, fontWeight: "700", fontSize: 15 },
});
