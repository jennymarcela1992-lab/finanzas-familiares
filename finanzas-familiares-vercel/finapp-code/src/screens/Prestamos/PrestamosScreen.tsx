import React, { useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import ScreenHeader from "../../components/ScreenHeader";
import PrestamosPanel, { PrestamosPanelRef } from "../../components/PrestamosPanel";
import { colors } from "../../theme/theme";

export default function PrestamosScreen() {
  const panel = useRef<PrestamosPanelRef>(null);
  const [formNuevo, setFormNuevo] = useState(false);
  return (
    <View style={styles.container}>
      <ScreenHeader title="Préstamos" subtitle="A terceros o entre ustedes" actionLabel="Nuevo" onAction={() => panel.current?.abrirNuevo()} actionActive={formNuevo} />
      <PrestamosPanel ref={panel} modo="normal" onFormCambia={(abierto, editando) => setFormNuevo(abierto && !editando)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
