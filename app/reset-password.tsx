import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { COLORS } from "../constants/theme";
import { supabase } from "../lib/supabase";

export default function ResetPasswordScreen() {
  const router = useRouter();

  const { code } = useLocalSearchParams<{
    code?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validLink, setValidLink] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const exchangeStarted = useRef(false);

  useEffect(() => {
    const verifyRecoveryLink = async () => {
      if (exchangeStarted.current) return;

      exchangeStarted.current = true;

      try {
        if (!code) {
          setValidLink(false);
          return;
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          console.error("Recovery verification error:", error.message);
          setValidLink(false);
          return;
        }

        setValidLink(true);
      } catch (error) {
        console.error("Recovery error:", error);
        setValidLink(false);
      } finally {
        setLoading(false);
      }
    };

    void verifyRecoveryLink();
  }, [code]);

  const handleResetPassword = async () => {
    if (password.length < 8) {
      Alert.alert(
        "Invalid password",
        "Password must contain at least 8 characters.",
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Password mismatch", "Both passwords must match.");
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        Alert.alert("Reset failed", error.message);
        return;
      }

      await supabase.auth.signOut();

      Alert.alert(
        "Password updated",
        "Your password has been changed successfully. Please log in with your new password.",
        [
          {
            text: "Continue",
            onPress: () => router.replace("/auth"),
          },
        ],
      );
    } catch (error) {
      console.error("Password update error:", error);

      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.subtitle}>Verifying your recovery link...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!validLink) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />

          <Text style={styles.title}>Invalid or expired link</Text>

          <Text style={styles.subtitle}>
            This password recovery link is invalid or has expired. Please
            request a new one.
          </Text>

          <Pressable
            style={styles.button}
            onPress={() => router.replace("/auth")}
          >
            <Text style={styles.buttonText}>Back to Login</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconContainer}>
            <Ionicons
              name="lock-closed-outline"
              size={36}
              color={COLORS.primary}
            />
          </View>

          <Text style={styles.title}>Create New Password</Text>

          <Text style={styles.subtitle}>
            Choose a strong password for your Knock account.
          </Text>

          <Text style={styles.label}>New Password</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Enter new password"
              placeholderTextColor="#85819A"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />

            <Pressable onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={21}
                color="#85819A"
              />
            </Pressable>
          </View>

          <Text style={styles.label}>Confirm Password</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor="#85819A"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
            />

            <Pressable
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              <Ionicons
                name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                size={21}
                color="#85819A"
              />
            </Pressable>
          </View>

          <Text style={styles.hint}>
            Password must contain at least 8 characters.
          </Text>

          <Pressable
            style={[styles.button, saving && { opacity: 0.6 }]}
            onPress={handleResetPassword}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Update Password</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#100B20",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  iconContainer: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: "#24183F",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 25,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    color: "#A9A2BB",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 30,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 9,
    marginTop: 18,
  },
  inputContainer: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#392B55",
    backgroundColor: "#1B1430",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
  },
  hint: {
    color: "#89829C",
    fontSize: 12,
    marginTop: 12,
  },
  button: {
    height: 54,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 30,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
