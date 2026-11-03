import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { COLORS } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

const settings = [
  {
    icon: "person-outline",
    title: "Account details",
    subtitle: "Your personal information",
  },
  {
    icon: "notifications-outline",
    title: "Notifications",
    subtitle: "Manage alert preferences",
  },
  {
    icon: "lock-closed-outline",
    title: "Privacy & security",
    subtitle: "Control who can reach you",
  },
  {
    icon: "help-circle-outline",
    title: "Help & support",
    subtitle: "Get help with Knock",
  },
  {
    icon: "information-circle-outline",
    title: "About Knock",
    subtitle: "App information and version",
  },
];

export default function ProfileScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          router.replace("/auth");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Profile loading error:", profileError.message);
        }

        if (mounted) {
          setFullName(
            profile?.full_name ||
              user.user_metadata?.full_name ||
              "Knock Member",
          );

          setUsername(profile?.username || user.user_metadata?.username || "");

          setEmail(user.email || "");
        }
      } catch (error: any) {
        console.error("Account loading error:", error.message);

        if (mounted) {
          Alert.alert("Error", "Unable to load your account details.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = async () => {
    if (signingOut) return;

    setSigningOut(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      router.replace("/auth");
    } catch (error: any) {
      Alert.alert("Sign out failed", error.message || "Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  const confirmLogout = () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Are you sure you want to sign out of Knock?",
      );

      if (confirmed) {
        handleLogout();
      }

      return;
    }

    Alert.alert("Sign out", "Are you sure you want to sign out of Knock?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: handleLogout,
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Profile</Text>
      <Text style={styles.subtitle}>Your Knock account</Text>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={34} color={COLORS.lavender} />
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.accent} style={{ marginTop: 18 }} />
        ) : (
          <>
            <Text style={styles.name}>{fullName}</Text>

            <Text style={styles.username}>
              {username ? `@${username}` : "Username unavailable"}
            </Text>

            <Text style={styles.email}>{email}</Text>

            <View style={styles.badge}>
              <View style={styles.onlineDot} />
              <Text style={styles.badgeText}>Knock member</Text>
            </View>
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>Settings</Text>

      {settings.map((item) => (
        <TouchableOpacity
          key={item.title}
          style={styles.settingRow}
          onPress={() =>
            Alert.alert(item.title, "This setting will be available soon.")
          }
        >
          <View style={styles.settingIcon}>
            <Ionicons name={item.icon as any} size={21} color={COLORS.accent} />
          </View>

          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>{item.title}</Text>
            <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
          </View>

          <Ionicons name="chevron-forward" size={19} color={COLORS.muted} />
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[styles.logoutButton, signingOut && { opacity: 0.6 }]}
        onPress={confirmLogout}
        disabled={signingOut}
      >
        {signingOut ? (
          <ActivityIndicator color={COLORS.danger} size="small" />
        ) : (
          <>
            <Ionicons name="log-out-outline" size={19} color={COLORS.danger} />
            <Text style={styles.logoutText}>Sign out</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.version}>KNOCK • VERSION 1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 30,
  },
  heading: {
    color: COLORS.text,
    fontSize: 27,
    fontWeight: "900",
  },
  subtitle: {
    color: COLORS.secondaryText,
    fontSize: 13,
    marginTop: 5,
  },
  profileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    padding: 24,
    marginTop: 25,
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 27,
    backgroundColor: "#8B5CF640",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "800",
    marginTop: 13,
  },
  username: {
    color: COLORS.secondaryText,
    fontSize: 12,
    marginTop: 5,
  },
  email: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 5,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#34D39918",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 13,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 5,
    backgroundColor: COLORS.success,
  },
  badgeText: {
    color: COLORS.success,
    fontSize: 10,
    fontWeight: "700",
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 30,
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 13,
    marginBottom: 9,
  },
  settingIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#8B5CF620",
    alignItems: "center",
    justifyContent: "center",
  },
  settingInfo: {
    flex: 1,
    marginLeft: 12,
  },
  settingTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  settingSubtitle: {
    color: COLORS.secondaryText,
    fontSize: 10,
    marginTop: 4,
  },
  logoutButton: {
    height: 49,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FF557340",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 22,
  },
  logoutText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  version: {
    textAlign: "center",
    color: COLORS.muted,
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 24,
  },
});
