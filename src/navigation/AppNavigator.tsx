import React from "react";
import { View, ActivityIndicator } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function HomeTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerTintColor: "#1F6F5C" }}>
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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#1F6F5C" }}>
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
