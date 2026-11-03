import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { COLORS } from "../constants/theme";
import { supabase } from "../lib/supabase";

export default function AuthScreen() {
  const [isSignup, setIsSignup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async () => {
    if (loading) return;

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    if (isSignup) {
      if (!fullName.trim()) {
        Alert.alert("Required", "Please enter your full name.");
        return;
      }

      if (!/^[a-zA-Z0-9_]{3,20}$/.test(normalizedUsername)) {
        Alert.alert(
          "Invalid username",
          "Username must be 3–20 characters and contain only letters, numbers or underscores.",
        );
        return;
      }
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      Alert.alert(
        "Weak password",
        "Password must contain at least 8 characters.",
      );
      return;
    }

    if (isSignup && password !== confirmPassword) {
      Alert.alert("Password mismatch", "Your passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      if (isSignup) {
        const { data: available, error: usernameError } = await supabase.rpc(
          "is_username_available",
          {
            candidate_username: normalizedUsername,
          },
        );

        if (usernameError) throw usernameError;

        if (!available) {
          Alert.alert("Username taken", "Please choose another username.");
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              username: normalizedUsername,
            },
          },
        });

        if (error) throw error;

        if (data.session) {
          Alert.alert("Welcome to Knock!", "Your account has been created.");
          router.replace("/(tabs)");
        } else {
          Alert.alert(
            "Verify your email",
            "Your account has been created. Please check your email to confirm your account, then sign in.",
            [{ text: "OK", onPress: () => setIsSignup(false) }],
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) throw error;

        router.replace("/(tabs)");
      }
    } catch (error: any) {
      Alert.alert(
        "Authentication failed",
        error.message || "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert("Enter email", "Please enter your registered email first.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: "knock://reset-password",
        },
      );

      if (error) throw error;

      Alert.alert(
        "Password recovery",
        "If an account exists for this email, a password reset link will be sent.",
      );
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === "ios"
          ? "padding"
          : Platform.OS === "android"
            ? "height"
            : undefined
      }
      keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <LinearGradient colors={["#A78BFA", "#6841C6"]} style={styles.logo}>
            <Ionicons name="hand-left" size={34} color="#FFFFFF" />
          </LinearGradient>

          <Text style={styles.brand}>
            knock<Text style={styles.brandDot}>.</Text>
          </Text>

          <Text style={styles.tagline}>Get their attention.</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.heading}>
            {isSignup ? "Create account" : "Welcome back"}
          </Text>

          <Text style={styles.description}>
            {isSignup
              ? "Join Knock and stay connected with your people."
              : "Sign in to stay connected with your people."}
          </Text>

          {isSignup && (
            <>
              <Text style={styles.label}>Full name</Text>

              <View style={styles.inputContainer}>
                <Ionicons
                  name="person-outline"
                  size={19}
                  color={COLORS.muted}
                />

                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  placeholderTextColor={COLORS.muted}
                  style={styles.input}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>

              <Text style={styles.label}>Username</Text>

              <View style={styles.inputContainer}>
                <Text style={styles.usernamePrefix}>@</Text>

                <TextInput
                  value={username}
                  onChangeText={(value) =>
                    setUsername(value.replace(/\s/g, ""))
                  }
                  placeholder="Choose a username"
                  placeholderTextColor={COLORS.muted}
                  style={styles.input}
                  autoCapitalize="none"
                  maxLength={20}
                  returnKeyType="next"
                />
              </View>

              <Text style={styles.helper}>
                This is how people will find you on Knock.
              </Text>
            </>
          )}

          <Text style={styles.label}>Email address</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={19} color={COLORS.muted} />

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              placeholderTextColor={COLORS.muted}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          <Text style={styles.label}>Password</Text>

          <View style={styles.inputContainer}>
            <Ionicons
              name="lock-closed-outline"
              size={19}
              color={COLORS.muted}
            />

            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor={COLORS.muted}
              style={styles.input}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              returnKeyType={isSignup ? "next" : "done"}
            />

            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={COLORS.muted}
              />
            </TouchableOpacity>
          </View>

          {isSignup && (
            <>
              <Text style={styles.label}>Confirm password</Text>

              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={19}
                  color={COLORS.muted}
                />

                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm your password"
                  placeholderTextColor={COLORS.muted}
                  style={styles.input}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                />

                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  <Ionicons
                    name={
                      showConfirmPassword ? "eye-off-outline" : "eye-outline"
                    }
                    size={20}
                    color={COLORS.muted}
                  />
                </TouchableOpacity>
              </View>
            </>
          )}

          {!isSignup && (
            <TouchableOpacity
              style={styles.forgotButton}
              onPress={handleForgotPassword}
              disabled={loading}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleSubmit}
            disabled={loading}
            style={styles.submitButton}
          >
            <LinearGradient
              colors={["#9B72F5", "#6841C6"]}
              style={styles.submitGradient}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.submitText}>
                    {isSignup ? "Create Account" : "Sign In"}
                  </Text>

                  <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.switchContainer}>
            <Text style={styles.switchText}>
              {isSignup
                ? "Already have an account? "
                : "Don't have an account? "}
            </Text>

            <TouchableOpacity
              onPress={() => setIsSignup(!isSignup)}
              disabled={loading}
            >
              <Text style={styles.switchLink}>
                {isSignup ? "Sign In" : "Sign Up"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.footer}>
          Your moments. Your people. Your Knock.
        </Text>

        <View style={{ height: 25 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 45,
    paddingBottom: 20,
  },

  top: {
    alignItems: "center",
    marginBottom: 30,
  },

  logo: {
    width: 67,
    height: 67,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  brand: {
    color: COLORS.text,
    fontSize: 35,
    fontWeight: "900",
    letterSpacing: -1.5,
  },

  brandDot: {
    color: COLORS.primary,
  },

  tagline: {
    color: COLORS.secondaryText,
    fontSize: 13,
    marginTop: 2,
  },

  formCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 22,
  },

  heading: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: "900",
  },

  description: {
    color: COLORS.secondaryText,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
    marginBottom: 22,
  },

  label: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 9,
    marginTop: 15,
  },

  inputContainer: {
    height: 51,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 11,
  },

  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
    height: "100%",
  },

  usernamePrefix: {
    color: COLORS.accent,
    fontSize: 17,
    fontWeight: "800",
  },

  helper: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 7,
  },

  forgotButton: {
    alignSelf: "flex-end",
    marginTop: 13,
  },

  forgotText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: "700",
  },

  submitButton: {
    marginTop: 25,
    borderRadius: 15,
    overflow: "hidden",
  },

  submitGradient: {
    height: 53,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },

  submitText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  switchContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 23,
  },

  switchText: {
    color: COLORS.secondaryText,
    fontSize: 12,
  },

  switchLink: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "800",
  },

  footer: {
    color: COLORS.muted,
    textAlign: "center",
    fontSize: 11,
    marginTop: 25,
  },
});
