import { removePushToken } from "@/lib/notifications";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { COLORS } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

const settings = [
  {
    icon: "person-outline",
    title: "Account details",
    subtitle: "Edit your name and username",
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

  // Edit profile state
  const [editVisible, setEditVisible] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const showMessage = (title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

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

      if (profileError) throw profileError;

      setFullName(
        profile?.full_name || user.user_metadata?.full_name || "Knock Member",
      );

      setUsername(profile?.username || user.user_metadata?.username || "");
      setEmail(user.email || "");
    } catch (error: any) {
      console.error("Profile loading error:", error.message);

      showMessage("Error", "Unable to load your account details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  // Open edit profile modal
  const openEditProfile = () => {
    setEditFullName(fullName);
    setEditUsername(username);
    setEditVisible(true);
  };

  // Save profile changes
  const handleSaveProfile = async () => {
    const cleanName = editFullName.trim();
    const cleanUsername = editUsername.trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 60) {
      showMessage(
        "Invalid name",
        "Your name must contain between 2 and 60 characters.",
      );
      return;
    }

    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      showMessage(
        "Invalid username",
        "Username must be 3–20 characters and contain only lowercase letters, numbers, and underscores.",
      );
      return;
    }

    setSavingProfile(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("Please sign in again.");

      // Check whether another user already has this username.
      const { data: existingUser, error: usernameError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", cleanUsername)
        .neq("id", user.id)
        .limit(1)
        .maybeSingle();

      if (usernameError) throw usernameError;

      if (existingUser) {
        showMessage(
          "Username unavailable",
          "This username is already taken. Please choose another one.",
        );
        return;
      }

      // Update the current user's profile.
      const { data: updatedProfile, error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: cleanName,
          username: cleanUsername,
        })
        .eq("id", user.id)
        .select("full_name, username")
        .single();

      if (updateError) {
        if (updateError.code === "23505") {
          throw new Error("This username is already taken.");
        }

        throw updateError;
      }

      // Immediately update the profile screen.
      setFullName(updatedProfile.full_name || cleanName);
      setUsername(updatedProfile.username || cleanUsername);

      setEditVisible(false);

      showMessage(
        "Profile updated",
        "Your profile has been updated successfully.",
      );
    } catch (error: any) {
      console.error("Profile update error:", error);

      showMessage(
        "Update failed",
        error.message || "Unable to update your profile. Please try again.",
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    if (signingOut) return;

    setSigningOut(true);

    try {
      // Remove this device's push token before signing out.
      try {
        await removePushToken();
      } catch (tokenError) {
        console.warn("Push token cleanup failed:", tokenError);
      }

      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      // Do not navigate here.
      // RootLayout handles the redirect to /auth.
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Please try again.";

      showMessage("Couldn't sign out", message);
      setSigningOut(false);
    }
  };

  const confirmLogout = () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Are you sure you want to sign out of Knock?",
      );

      if (confirmed) handleLogout();

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

  const openSettings = (
    section: "notifications" | "privacy" | "help" | "about",
  ) => {
    router.push({
      pathname: "/settings",
      params: { section },
    });
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.heading}>Profile</Text>
        <Text style={styles.subtitle}>Your Knock account</Text>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={34} color={COLORS.lavender} />
          </View>

          {loading ? (
            <ActivityIndicator
              color={COLORS.accent}
              style={{ marginTop: 18 }}
            />
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

              <TouchableOpacity
                style={styles.editProfileButton}
                onPress={openEditProfile}
              >
                <Ionicons name="create-outline" size={17} color={COLORS.text} />
                <Text style={styles.editProfileText}>Edit profile</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Settings</Text>

        {settings.map((item) => (
          <TouchableOpacity
            key={item.title}
            style={styles.settingRow}
            onPress={() => {
              switch (item.title) {
                case "Account details":
                  openEditProfile();
                  break;

                case "Notifications":
                  openSettings("notifications");
                  break;

                case "Privacy & security":
                  openSettings("privacy");
                  break;

                case "Help & support":
                  openSettings("help");
                  break;

                case "About Knock":
                  openSettings("about");
                  break;
              }
            }}
          >
            <View style={styles.settingIcon}>
              <Ionicons
                name={item.icon as any}
                size={21}
                color={COLORS.accent}
              />
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
              <Ionicons
                name="log-out-outline"
                size={19}
                color={COLORS.danger}
              />
              <Text style={styles.logoutText}>Sign out</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.version}>KNOCK • VERSION 1.0.0</Text>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={editVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Edit profile</Text>
                <Text style={styles.modalSubtitle}>
                  Update your personal information
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setEditVisible(false)}
                disabled={savingProfile}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={22} color={COLORS.secondaryText} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Full name</Text>

            <TextInput
              style={styles.input}
              value={editFullName}
              onChangeText={setEditFullName}
              placeholder="Enter your full name"
              placeholderTextColor={COLORS.muted}
              maxLength={60}
              autoCapitalize="words"
            />

            <Text style={styles.inputLabel}>Username</Text>

            <View style={styles.usernameInputContainer}>
              <Text style={styles.atSymbol}>@</Text>

              <TextInput
                style={styles.usernameInput}
                value={editUsername}
                onChangeText={(value) =>
                  setEditUsername(value.toLowerCase().replace(/\s/g, ""))
                }
                placeholder="username"
                placeholderTextColor={COLORS.muted}
                maxLength={20}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={styles.inputHint}>
              3–20 characters. Letters, numbers and underscores only.
            </Text>

            <TouchableOpacity
              style={[styles.saveButton, savingProfile && { opacity: 0.6 }]}
              onPress={handleSaveProfile}
              disabled={savingProfile}
            >
              {savingProfile ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save changes</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setEditVisible(false)}
              disabled={savingProfile}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
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
  editProfileButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#8B5CF625",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 18,
  },
  editProfileText: {
    color: COLORS.text,
    fontSize: 12,
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

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 22,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 25,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: "900",
  },
  modalSubtitle: {
    color: COLORS.secondaryText,
    fontSize: 12,
    marginTop: 5,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  inputLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 9,
    marginTop: 5,
  },
  input: {
    height: 50,
    backgroundColor: COLORS.surface,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    color: COLORS.text,
    fontSize: 14,
    marginBottom: 20,
  },
  usernameInputContainer: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
  },
  atSymbol: {
    color: COLORS.accent,
    fontSize: 16,
    fontWeight: "800",
    marginRight: 7,
  },
  usernameInput: {
    flex: 1,
    height: "100%",
    color: COLORS.text,
    fontSize: 14,
  },
  inputHint: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 8,
    marginBottom: 22,
  },
  saveButton: {
    height: 50,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 14,
  },
  cancelButtonText: {
    color: COLORS.secondaryText,
    fontSize: 13,
    fontWeight: "600",
  },
});
