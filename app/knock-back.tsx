import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useKnockAlert } from "../components/KnockAlert";
import { COLORS } from "../constants/theme";
import { sendKnockBack } from "../lib/knock-replies";

export default function KnockBackScreen() {
  const params = useLocalSearchParams<{
    senderId?: string;
    senderName?: string;
  }>();

  const senderId = params.senderId ?? "";
  const senderName = params.senderName ?? "your contact";

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const { showAlert, alertNode } = useKnockAlert();

  const handleSend = async () => {
    if (sending) return;

    if (!senderId) {
      showAlert({
        title: "Unable to send",
        message: "The original sender could not be found.",
        variant: "error",
      });
      return;
    }

    setSending(true);

    try {
      await sendKnockBack(senderId, message);

      showAlert({
        title: "Knock Back sent!",
        message: `Your Knock Back has been sent to ${senderName}.`,
        variant: "success",
        onDone: () => router.back(),
      });
    } catch (error) {
      console.error("Knock Back failed:", error);

      showAlert({
        title: "Couldn't send Knock Back",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
        variant: "error",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          disabled={sending}
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="hand-left" size={38} color="#FFFFFF" />
          </View>

          <Text style={styles.title}>Knock Back</Text>

          <Text style={styles.subtitle}>
            Send a little attention back to {senderName}.
          </Text>
        </View>

        <View style={styles.recipientCard}>
          <Ionicons
            name="person-circle-outline"
            size={25}
            color={COLORS.accent}
          />

          <View style={{ flex: 1 }}>
            <Text style={styles.recipientLabel}>Sending to</Text>
            <Text style={styles.recipientName}>{senderName}</Text>
          </View>

          <Ionicons name="checkmark-circle" size={21} color={COLORS.accent} />
        </View>

        <View style={styles.messageSection}>
          <Text style={styles.sectionTitle}>Add a message</Text>
          <Text style={styles.sectionSubtitle}>
            Optional — let them know what's on your mind.
          </Text>

          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Write something..."
            placeholderTextColor={COLORS.muted}
            multiline
            maxLength={160}
            editable={!sending}
            textAlignVertical="top"
            style={styles.input}
          />

          <Text style={styles.counter}>{message.length}/160</Text>
        </View>

        <View style={styles.preview}>
          <Ionicons name="hand-left-outline" size={21} color={COLORS.accent} />

          <View style={{ flex: 1 }}>
            <Text style={styles.previewTitle}>Knock Back</Text>
            <Text style={styles.previewMessage}>
              {message.trim() || "Sending a Knock right back!"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.sendButton, sending && styles.disabled]}
          onPress={handleSend}
          disabled={sending}
          activeOpacity={0.85}
        >
          {sending ? (
            <>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={styles.sendButtonText}>Sending...</Text>
            </>
          ) : (
            <>
              <Ionicons name="paper-plane" size={19} color="#FFFFFF" />
              <Text style={styles.sendButtonText}>Send Knock Back</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {alertNode}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
    paddingTop: 55,
    paddingBottom: 35,
    flexGrow: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    alignItems: "center",
    marginTop: 35,
    marginBottom: 30,
  },
  heroIcon: {
    width: 85,
    height: 85,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 20,
  },
  subtitle: {
    color: COLORS.secondaryText,
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
  recipientCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 17,
    padding: 16,
  },
  recipientLabel: {
    color: COLORS.muted,
    fontSize: 11,
  },
  recipientName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 3,
  },
  messageSection: {
    marginTop: 30,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
  },
  sectionSubtitle: {
    color: COLORS.secondaryText,
    fontSize: 11,
    marginTop: 5,
    marginBottom: 13,
  },
  input: {
    minHeight: 115,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 15,
    color: COLORS.text,
    fontSize: 13,
  },
  counter: {
    color: COLORS.muted,
    fontSize: 10,
    textAlign: "right",
    marginTop: 6,
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: "#8B5CF610",
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 16,
    padding: 16,
    marginTop: 25,
  },
  previewTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 13,
  },
  previewMessage: {
    color: COLORS.secondaryText,
    fontSize: 11,
    marginTop: 4,
  },
  sendButton: {
    height: 55,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: 30,
  },
  disabled: {
    opacity: 0.65,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
