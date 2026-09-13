import React from "react";
import { View, ActivityIndicator } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

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
import { colors } from "../theme/theme";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dashboard: "home",
  Ingresos: "cash",
  Gastos: "cart",
  Ahorros: "wallet",
  Deudas: "card",
  "Préstamos": "people",
  Propiedades: "business",
  "Vehículo": "car",
  Inversiones: "trending-up",
  Eventos: "airplane",
};

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
        tabBarStyle: { height: 62, paddingTop: 6, paddingBottom: 8, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => <Ionicons name={ICONS[route.name] ?? "ellipse"} size={size ? size - 2 : 20} color={color} />,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Ingresos" component={IngresosScreen} />
      <Tab.Screen name="Gastos" component={GastosScreen} />
      <Tab.Screen name="Ahorros" component={AhorrosScreen} />
      <Tab.Screen name="Deudas" component={DeudasScreen} />
      <Tab.Screen name="Préstamos" component={PrestamosScreen} />
      <Tab.Screen name="Propiedades" component={PropiedadesScreen} />
      <Tab.Screen name="Vehículo" component={VehiculoScreen} />
      <Tab.Screen name="Inversiones" component={InversionesScreen} />
      <Tab.Screen name="Eventos" component={EventosScreen} />
    </Tab.Navigator>
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
      {usuario ? <Stack.Screen name="Home" component={HomeTabs} /> : <Stack.Screen name="Login" component={LoginScreen} />}
    </Stack.Navigator>
  );
}
