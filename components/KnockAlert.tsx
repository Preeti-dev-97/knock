import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type KnockAlertVariant = "success" | "error" | "warning" | "info";

type KnockAlertOptions = {
  title: string;
  message: string;
  variant?: KnockAlertVariant;
  buttonLabel?: string;
  onDone?: () => void;
  dismissOnBackdrop?: boolean;
};

const appearance: Record<KnockAlertVariant, { icon: string; color: string }> = {
  success: { icon: "checkmark", color: "#34D399" },
  error: { icon: "alert-circle", color: "#FF5573" },
  warning: { icon: "warning", color: "#F59E0B" },
  info: { icon: "information", color: "#A78BFA" },
};

export function useKnockAlert() {
  const [dialog, setDialog] = useState<KnockAlertOptions | null>(null);

  const showAlert = useCallback((options: KnockAlertOptions) => {
    setDialog(options);
  }, []);

  const closeAlert = useCallback(() => {
    const callback = dialog?.onDone;
    setDialog(null);
    callback?.();
  }, [dialog]);

  const variant = dialog?.variant ?? "info";
  const alertStyle = appearance[variant];

  const alertNode = (
    <Modal
      visible={!!dialog}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeAlert}
    >
      <View style={styles.overlay}>
        {dialog && (
          <>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={
                dialog.dismissOnBackdrop === false ? undefined : closeAlert
              }
            />

            <View style={styles.card}>
              <LinearGradient
                colors={[`${alertStyle.color}30`, `${alertStyle.color}08`]}
                style={styles.glow}
              >
                <View
                  style={[
                    styles.iconWrap,
                    {
                      backgroundColor: `${alertStyle.color}25`,
                    },
                  ]}
                >
                  <Ionicons
                    name={alertStyle.icon as any}
                    size={30}
                    color={alertStyle.color}
                  />
                </View>

                <Text style={styles.title}>{dialog.title}</Text>

                <Text style={styles.message}>{dialog.message}</Text>
              </LinearGradient>

              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.button}
                onPress={closeAlert}
              >
                <Text style={styles.buttonText}>
                  {dialog.buttonLabel ??
                    (variant === "success" ? "Awesome!" : "Got it")}
                </Text>

                <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );

  return { showAlert, alertNode };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(8, 5, 20, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },

  card: {
    width: "100%",
    maxWidth: 390,
    backgroundColor: "#21143F",
    borderRadius: 26,
    padding: 12,
    borderWidth: 1,
    borderColor: "#8060C855",
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },

  glow: {
    borderRadius: 19,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 22,
  },

  iconWrap: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 17,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
  },

  message: {
    color: "#D4C9EC",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 9,
  },

  button: {
    height: 50,
    borderRadius: 16,
    backgroundColor: "#6841C6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 3,
    marginBottom: 2,
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
