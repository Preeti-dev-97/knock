import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { supabase } from "../lib/supabase";

type Contact = {
  id: string;
  name: string;
  username: string;
};

type Priority = "normal" | "urgent";

const alertGroups = [
  {
    category: "Social",
    description: "Small moments and friendly check-ins",
    alerts: [
      { title: "Hello", icon: "hand-left-outline", color: "#A78BFA" },
      { title: "Thinking of you", icon: "heart-outline", color: "#EC4899" },
      {
        title: "Just checking in",
        icon: "chatbubble-ellipses-outline",
        color: "#F59E0B",
      },
      {
        title: "How are you?",
        icon: "sparkles-outline",
        color: "#A78BFA",
      },
    ],
  },
  {
    category: "Action",
    description: "When you need someone to do something",
    alerts: [
      { title: "Call me", icon: "call-outline", color: "#A78BFA" },
      {
        title: "Check phone",
        icon: "phone-portrait-outline",
        color: "#38BDF8",
      },
      { title: "Where are you?", icon: "location-outline", color: "#34D399" },
      { title: "I'm on my way", icon: "walk-outline", color: "#22C55E" },
    ],
  },
  {
    category: "Help",
    description: "Get attention when it matters",
    alerts: [
      { title: "Need help", icon: "help-circle-outline", color: "#FF5573" },
      { title: "Please come here", icon: "navigate-outline", color: "#34D399" },
      {
        title: "Something important",
        icon: "alert-circle-outline",
        color: "#FF5573",
      },
      { title: "Urgent", icon: "warning-outline", color: "#FF5573" },
    ],
  },
];

const avatarColors = [
  "#8B5CF6",
  "#EC4899",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#6366F1",
];

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

export default function SendScreen() {
  const params = useLocalSearchParams<{ alert?: string | string[] }>();
  const routeAlert = Array.isArray(params.alert)
    ? params.alert[0]
    : params.alert;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsError, setContactsError] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedAlert, setSelectedAlert] = useState(routeAlert ?? "");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const { showAlert, alertNode } = useKnockAlert();
  const showMessage = (title: string, message: string, onDone?: () => void) => {
    const lowerTitle = title.toLowerCase();
    const variant =
      lowerTitle.includes("sent") || lowerTitle.includes("success")
        ? "success"
        : lowerTitle.includes("couldn't") || lowerTitle.includes("unable")
          ? "error"
          : "info";
    showAlert({ title, message, variant, onDone });
  };

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    setContactsError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user)
        throw new Error("Your session has expired. Please sign in again.");

      const { data: requests, error: requestsError } = await supabase
        .from("friend_requests")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      if (requestsError) throw requestsError;

      const contactIds = Array.from(
        new Set(
          (requests ?? []).map((request) =>
            request.requester_id === user.id
              ? request.addressee_id
              : request.requester_id,
          ),
        ),
      );

      if (contactIds.length === 0) {
        setContacts([]);
        setSelectedContacts([]);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", contactIds)
        .order("full_name", { ascending: true });

      if (profilesError) throw profilesError;

      const loadedContacts: Contact[] = (profiles ?? []).map((profile) => ({
        id: profile.id,
        name: profile.full_name?.trim() || profile.username || "Knock user",
        username: profile.username
          ? `@${String(profile.username).replace(/^@/, "")}`
          : "@user",
      }));

      setContacts(loadedContacts);
      setSelectedContacts((current) =>
        current.filter((id) =>
          loadedContacts.some((contact) => contact.id === id),
        ),
      );
    } catch (error) {
      console.error("Failed to load Knock contacts:", error);
      setContactsError(getErrorMessage(error));
    } finally {
      setContactsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const filteredContacts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) return contacts;

    return contacts.filter(
      (contact) =>
        contact.name.toLowerCase().includes(normalizedSearch) ||
        contact.username.toLowerCase().includes(normalizedSearch),
    );
  }, [contacts, search]);

  const allSelected =
    contacts.length > 0 && selectedContacts.length === contacts.length;

  const toggleContact = (id: string) => {
    if (sending) return;

    setSelectedContacts((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const toggleAll = () => {
    if (sending) return;
    setSelectedContacts(
      allSelected ? [] : contacts.map((contact) => contact.id),
    );
  };

  const handleSend = async () => {
    if (sending) return;

    if (selectedContacts.length === 0) {
      showMessage(
        "Choose someone",
        "Please select at least one accepted contact.",
      );
      return;
    }

    const trimmedMessage = message.trim();

    if (!selectedAlert && !trimmedMessage) {
      showMessage("Add your Knock", "Choose a quick alert or write a message.");
      return;
    }

    if (trimmedMessage.length > 160) {
      showMessage(
        "Message too long",
        "Your message cannot exceed 160 characters.",
      );
      return;
    }

    setSending(true);

    try {
      const { data, error } = await supabase.rpc("send_knock", {
        target_user_ids: selectedContacts,
        alert_text: selectedAlert || null,
        custom_message: trimmedMessage || null,
        knock_priority: priority,
      });

      if (error) throw error;
      if (!data)
        throw new Error(
          "The Knock could not be confirmed. Please check your history.",
        );

      showMessage(
        "Knock sent!",
        `Your ${priority} Knock was successfully sent to ${selectedContacts.length} contact${selectedContacts.length === 1 ? "" : "s"}.`,
        () => router.back(),
      );
    } catch (error) {
      console.error("Failed to send Knock:", error);
      showMessage("Couldn't send Knock", getErrorMessage(error));
    } finally {
      setSending(false);
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
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.headerText}>
            <Text style={styles.title}>Send a Knock</Text>
            <Text style={styles.subtitle}>Get someone's attention.</Text>
          </View>

          <View style={{ width: 44 }} />
        </View>

        <LinearGradient
          colors={["#6841C6", "#43248E", "#29165A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          <View style={styles.bannerIcon}>
            <Ionicons name="hand-left" size={25} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Make some noise!</Text>
            <Text style={styles.bannerSubtitle}>
              Choose who should receive your Knock.
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Choose recipients</Text>
            <Text style={styles.sectionSubtitle}>
              {selectedContacts.length} selected
            </Text>
          </View>

          <TouchableOpacity
            onPress={toggleAll}
            disabled={sending || contactsLoading || contacts.length === 0}
          >
            <Text
              style={[
                styles.selectAll,
                (sending || contactsLoading || contacts.length === 0) &&
                  styles.disabledText,
              ]}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={19} color={COLORS.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search your contacts..."
            placeholderTextColor={COLORS.muted}
            style={styles.searchInput}
            editable={!sending && !contactsLoading}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch("")}
              disabled={sending}
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={19} color={COLORS.muted} />
            </TouchableOpacity>
          )}
        </View>

        {contactsLoading ? (
          <View style={styles.contactsState}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.stateText}>Loading your contacts...</Text>
          </View>
        ) : contactsError ? (
          <View style={styles.contactsState}>
            <Ionicons
              name="alert-circle-outline"
              size={24}
              color={COLORS.danger}
            />
            <Text style={styles.stateError}>{contactsError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadContacts}>
              <Ionicons name="refresh" size={16} color={COLORS.text} />
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : contacts.length === 0 ? (
          <View style={styles.contactsState}>
            <Ionicons name="people-outline" size={27} color={COLORS.muted} />
            <Text style={styles.stateText}>
              You don't have any accepted contacts yet.
            </Text>
            <Text style={styles.stateHint}>
              Add contacts first, then you can send them a Knock.
            </Text>
          </View>
        ) : filteredContacts.length === 0 ? (
          <Text style={styles.noContacts}>No contacts found.</Text>
        ) : (
          filteredContacts.map((contact) => {
            const selected = selectedContacts.includes(contact.id);
            const color =
              avatarColors[contact.name.charCodeAt(0) % avatarColors.length];

            return (
              <TouchableOpacity
                key={contact.id}
                activeOpacity={0.8}
                style={[styles.contactRow, selected && styles.contactSelected]}
                onPress={() => toggleContact(contact.id)}
                disabled={sending}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled: sending }}
              >
                <View style={[styles.avatar, { backgroundColor: color }]}>
                  <Text style={styles.avatarText}>
                    {getInitials(contact.name)}
                  </Text>
                </View>

                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <Text style={styles.username}>{contact.username}</Text>
                </View>

                <Ionicons
                  name={selected ? "checkmark-circle" : "ellipse-outline"}
                  size={23}
                  color={selected ? COLORS.accent : COLORS.muted}
                />
              </TouchableOpacity>
            );
          })
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Choose your alert</Text>
            <Text style={styles.sectionSubtitle}>What do you want to say?</Text>
          </View>
        </View>

        {alertGroups.map((group) => (
          <View key={group.category} style={styles.alertGroup}>
            <Text style={styles.alertCategory}>{group.category}</Text>
            <Text style={styles.alertDescription}>{group.description}</Text>
            <View style={styles.alertGrid}>
              {group.alerts.map((alert) => {
                const selected = selectedAlert === alert.title;

                return (
                  <TouchableOpacity
                    key={alert.title}
                    activeOpacity={0.8}
                    style={[
                      styles.alertCard,
                      selected && styles.alertCardSelected,
                    ]}
                    onPress={() =>
                      setSelectedAlert(selected ? "" : alert.title)
                    }
                    disabled={sending}
                  >
                    <View
                      style={[
                        styles.alertIcon,
                        { backgroundColor: `${alert.color}20` },
                      ]}
                    >
                      <Ionicons
                        name={alert.icon as any}
                        size={22}
                        color={alert.color}
                      />
                    </View>

                    <Text style={styles.alertTitle}>{alert.title}</Text>

                    {selected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={COLORS.accent}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Custom message</Text>
            <Text style={styles.sectionSubtitle}>
              Add a personal touch (optional)
            </Text>
          </View>
        </View>

        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Type your message here..."
          placeholderTextColor={COLORS.muted}
          multiline
          maxLength={160}
          editable={!sending}
          textAlignVertical="top"
          style={styles.messageInput}
        />

        <Text style={styles.characterCount}>{message.length}/160</Text>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Priority</Text>
            <Text style={styles.sectionSubtitle}>
              How important is this Knock?
            </Text>
          </View>
        </View>

        <View style={styles.priorityRow}>
          <TouchableOpacity
            style={[
              styles.priorityCard,
              priority === "normal" && styles.normalSelected,
            ]}
            onPress={() => setPriority("normal")}
            disabled={sending}
          >
            <Ionicons
              name="notifications-outline"
              size={21}
              color={priority === "normal" ? COLORS.accent : COLORS.muted}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.priorityTitle}>Normal</Text>
              <Text style={styles.prioritySubtitle}>Regular notification</Text>
            </View>
            {priority === "normal" && (
              <Ionicons
                name="checkmark-circle"
                size={19}
                color={COLORS.accent}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.priorityCard,
              priority === "urgent" && styles.urgentSelected,
            ]}
            onPress={() => setPriority("urgent")}
            disabled={sending}
          >
            <Ionicons
              name="alert-circle"
              size={21}
              color={priority === "urgent" ? COLORS.danger : COLORS.muted}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.priorityTitle}>Urgent</Text>
              <Text style={styles.prioritySubtitle}>High-priority alert</Text>
            </View>
            {priority === "urgent" && (
              <Ionicons
                name="checkmark-circle"
                size={19}
                color={COLORS.danger}
              />
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.sendButton, sending && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={sending || contactsLoading || !!contactsError}
          accessibilityRole="button"
        >
          {sending ? (
            <>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.sendButtonText}>Sending...</Text>
            </>
          ) : (
            <>
              <Ionicons name="paper-plane" size={19} color="#FFFFFF" />
              <Text style={styles.sendButtonText}>
                Send Knock{" "}
                {selectedContacts.length > 0
                  ? `(${selectedContacts.length})`
                  : ""}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Your Knock will be saved and shared with the selected contacts.
        </Text>

        <View style={{ height: 30 }} />
      </ScrollView>

      {alertNode}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 20, paddingTop: 55, paddingBottom: 25 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerText: { flex: 1, alignItems: "center" },
  title: { color: COLORS.text, fontSize: 19, fontWeight: "800" },
  subtitle: { color: COLORS.secondaryText, fontSize: 11, marginTop: 3 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 20,
    marginTop: 25,
  },
  bannerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#FFFFFF25",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  bannerSubtitle: { color: "#E2D8FF", fontSize: 11, marginTop: 4 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 27,
    marginBottom: 13,
  },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: "800" },
  sectionSubtitle: { color: COLORS.secondaryText, fontSize: 11, marginTop: 4 },
  selectAll: { color: COLORS.accent, fontSize: 12, fontWeight: "700" },
  disabledText: { opacity: 0.45 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 13 },
  noContacts: { color: COLORS.secondaryText, textAlign: "center", padding: 20 },
  contactsState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 25,
    gap: 10,
  },
  stateText: {
    color: COLORS.secondaryText,
    fontSize: 12,
    textAlign: "center",
  },
  stateHint: {
    color: COLORS.muted,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 17,
  },
  stateError: {
    color: COLORS.danger,
    fontSize: 12,
    textAlign: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 3,
  },
  retryText: { color: COLORS.text, fontSize: 12, fontWeight: "700" },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    marginTop: 9,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  contactSelected: {
    borderColor: COLORS.primary,
    backgroundColor: "#8B5CF610",
  },
  avatar: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  contactInfo: { flex: 1, marginLeft: 12 },
  contactName: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  username: { color: COLORS.secondaryText, fontSize: 11, marginTop: 4 },
  alertGroup: { marginBottom: 17 },
  alertCategory: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 3,
  },
  alertDescription: {
    color: COLORS.muted,
    fontSize: 10,
    marginBottom: 10,
  },
  alertGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  alertCard: {
    width: "48%",
    minHeight: 83,
    padding: 12,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  alertCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: "#8B5CF615",
  },
  alertIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  alertTitle: { color: COLORS.text, fontSize: 11, fontWeight: "700", flex: 1 },
  messageInput: {
    minHeight: 105,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    color: COLORS.text,
    fontSize: 13,
  },
  characterCount: {
    textAlign: "right",
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 6,
  },
  priorityRow: { gap: 10 },
  priorityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
  },
  normalSelected: { borderColor: COLORS.primary, backgroundColor: "#8B5CF610" },
  urgentSelected: { borderColor: COLORS.danger, backgroundColor: "#FF557310" },
  priorityTitle: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  prioritySubtitle: { color: COLORS.secondaryText, fontSize: 10, marginTop: 3 },
  sendButton: {
    height: 54,
    marginTop: 27,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  sendButtonDisabled: { opacity: 0.65 },
  sendButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  footerNote: {
    color: COLORS.muted,
    fontSize: 10,
    textAlign: "center",
    marginTop: 12,
  },
});
