// En el navegador, Alert.alert de React Native no muestra nada.
// Esto lo reemplaza por los avisos del navegador para que los mensajes
// de error y las confirmaciones ("¿Eliminar?") funcionen en la version web.
import { Alert, Platform, AlertButton } from "react-native";

if (Platform.OS === "web" && typeof window !== "undefined") {
  Alert.alert = (titulo: string, mensaje?: string, botones?: AlertButton[]) => {
    const texto = [titulo, mensaje].filter(Boolean).join("\n\n");
    if (!botones || botones.length <= 1) {
      window.alert(texto);
      botones?.[0]?.onPress?.();
      return;
    }
    const cancelar = botones.find((b) => b.style === "cancel");
    const aceptar = [...botones].reverse().find((b) => b.style !== "cancel") ?? botones[botones.length - 1];
    if (window.confirm(texto)) aceptar.onPress?.();
    else cancelar?.onPress?.();
  };
}
