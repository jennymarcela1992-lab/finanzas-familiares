import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

export default function AppNavigator() {
  const { usuario, cargando } = useAuth();

  if (cargando) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.primary }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
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
});
