import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

const COLORS = {
  background: "#100D18",
  card: "#1B1726",
  purple: "#9B7BFF",
  text: "#FFFFFF",
  muted: "#A7A1B5",
  border: "#30283F",
};

type Preferences = {
  normal: boolean;
  urgent: boolean;
};

const DEFAULT_PREFERENCES: Preferences = {
  normal: true,
  urgent: true,
};

const showMessage = (title: string, message: string) => {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function SettingsScreen() {
  const params = useLocalSearchParams<{ section?: string }>();

  const [preferences, setPreferences] =
    useState<Preferences>(DEFAULT_PREFERENCES);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const section = params.section ?? "notifications";

  const loadSettings = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        router.replace("/");
        return;
      }

      setEmail(user.email ?? "");

      const { data, error } = await supabase
        .from("profiles")
        .select("notification_preferences")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.notification_preferences) {
        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...data.notification_preferences,
        });
      }
    } catch (error) {
      console.error("Settings loading failed:", error);
      showMessage("Couldn't load settings", "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const updatePreference = async (key: keyof Preferences, value: boolean) => {
    if (saving) return;

    const updated = {
      ...preferences,
      [key]: value,
    };

    setSaving(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please sign in again.");

      const { error } = await supabase
        .from("profiles")
        .update({ notification_preferences: updated })
        .eq("id", user.id);

      if (error) throw error;

      setPreferences(updated);
    } catch (error) {
      console.error("Preference update failed:", error);
      showMessage(
        "Couldn't save preference",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      showMessage("Email unavailable", "Please sign in again.");
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: "knock://reset-password",
        },
      );

      if (error) throw error;

      showMessage(
        "Reset email sent",
        `Check ${email} for the password reset instructions.`,
      );
    } catch (error) {
      showMessage(
        "Couldn't send reset email",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const title =
    section === "privacy"
      ? "Privacy & Security"
      : section === "help"
        ? "Help & Support"
        : section === "about"
          ? "About Knock"
          : "Notifications";

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={COLORS.purple} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={21} color={COLORS.text} />
          </Pressable>

          <Text style={styles.headerTitle}>{title}</Text>

          <View style={{ width: 42 }} />
        </View>

        {section === "notifications" && (
          <>
            <Text style={styles.sectionTitle}>PUSH NOTIFICATIONS</Text>

            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={styles.iconBox}>
                  <Ionicons
                    name="notifications-outline"
                    size={21}
                    color={COLORS.purple}
                  />
                </View>

                <View style={styles.settingContent}>
                  <Text style={styles.settingTitle}>Normal Knocks</Text>
                  <Text style={styles.description}>
                    Receive notifications for regular Knocks.
                  </Text>
                </View>

                <Switch
                  value={preferences.normal}
                  onValueChange={(value) =>
                    void updatePreference("normal", value)
                  }
                  disabled={saving}
                  trackColor={{
                    false: "#494253",
                    true: "#7654CF",
                  }}
                  thumbColor={preferences.normal ? "#FFFFFF" : "#BDB8C9"}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.settingRow}>
                <View style={styles.iconBox}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={21}
                    color="#FF7373"
                  />
                </View>

                <View style={styles.settingContent}>
                  <Text style={styles.settingTitle}>Urgent Knocks</Text>
                  <Text style={styles.description}>
                    Receive notifications for urgent Knocks.
                  </Text>
                </View>

                <Switch
                  value={preferences.urgent}
                  onValueChange={(value) =>
                    void updatePreference("urgent", value)
                  }
                  disabled={saving}
                  trackColor={{
                    false: "#494253",
                    true: "#7654CF",
                  }}
                  thumbColor={preferences.urgent ? "#FFFFFF" : "#BDB8C9"}
                />
              </View>
            </View>

            <Text style={styles.note}>
              These preferences control which Knock alerts are sent to your
              device. Your device notification permission must also be enabled.
            </Text>

            {saving && (
              <View style={styles.savingRow}>
                <ActivityIndicator color={COLORS.purple} size="small" />
                <Text style={styles.note}>Saving preference...</Text>
              </View>
            )}
          </>
        )}

        {section === "privacy" && (
          <>
            <Text style={styles.sectionTitle}>PRIVACY</Text>

            <View style={styles.card}>
              <View style={styles.infoRow}>
                <Ionicons
                  name="people-outline"
                  size={22}
                  color={COLORS.purple}
                />
                <View style={styles.settingContent}>
                  <Text style={styles.settingTitle}>
                    Who can send you Knocks?
                  </Text>
                  <Text style={styles.description}>
                    Only users with an accepted connection can send you a Knock.
                  </Text>
                  <Text style={styles.badge}>CURRENT APP POLICY</Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>ACCOUNT SECURITY</Text>

            <Pressable
              style={styles.actionRow}
              onPress={() => void handlePasswordReset()}
            >
              <Ionicons
                name="lock-closed-outline"
                size={21}
                color={COLORS.purple}
              />
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Reset password</Text>
                <Text style={styles.description}>
                  Receive a password reset link by email.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.muted} />
            </Pressable>

            <View style={styles.actionRow}>
              <Ionicons name="mail-outline" size={21} color={COLORS.purple} />
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Registered email</Text>
                <Text style={styles.description}>{email || "Unavailable"}</Text>
              </View>
            </View>

            <Text style={styles.note}>
              Knock currently restricts sending to accepted connections.
            </Text>
          </>
        )}

        {section === "help" && (
          <>
            <Text style={styles.sectionTitle}>HELP & SUPPORT</Text>

            <View style={styles.card}>
              <View style={styles.faqItem}>
                <Text style={styles.settingTitle}>What is a Knock?</Text>
                <Text style={styles.description}>
                  A Knock is a quick alert you can send to your accepted
                  contacts to get their attention.
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.faqItem}>
                <Text style={styles.settingTitle}>
                  How do I know if my Knock was acknowledged?
                </Text>
                <Text style={styles.description}>
                  Open History to check the acknowledgement status of your sent
                  Knocks.
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.faqItem}>
                <Text style={styles.settingTitle}>
                  Why am I not receiving notifications?
                </Text>
                <Text style={styles.description}>
                  Check your device notification permissions and the
                  notification preferences in Knock.
                </Text>
              </View>
            </View>

            <Text style={styles.note}>
              More support options can be added when an official support email
              or website is configured.
            </Text>
          </>
        )}

        {section === "about" && (
          <>
            <View style={styles.aboutCard}>
              <View style={styles.logoCircle}>
                <Ionicons name="hand-left" size={38} color="#FFFFFF" />
              </View>

              <Text style={styles.appName}>Knock</Text>
              <Text style={styles.description}>Get someone's attention.</Text>

              <View style={styles.versionBadge}>
                <Text style={styles.versionText}>
                  Version {Constants.expoConfig?.version ?? "1.0.0"}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>ABOUT</Text>

            <View style={styles.card}>
              <View style={styles.faqItem}>
                <Text style={styles.settingTitle}>
                  Made for quick connections
                </Text>
                <Text style={styles.description}>
                  Knock helps you reach your people through simple,
                  notification-first alerts.
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  container: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "800",
  },
  sectionTitle: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginTop: 12,
    marginBottom: 12,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#30283F",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
    marginLeft: 12,
  },
  settingTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  description: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 5,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  note: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 16,
  },
  savingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 18,
  },
  badge: {
    color: COLORS.purple,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 10,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 17,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  faqItem: {
    paddingVertical: 18,
  },
  aboutCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "#6841C6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  appName: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "900",
  },
  versionBadge: {
    backgroundColor: "#30283F",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 18,
  },
  versionText: {
    color: COLORS.purple,
    fontSize: 11,
    fontWeight: "700",
  },
});
