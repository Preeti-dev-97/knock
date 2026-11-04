import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useKnockAlert } from "../../components/KnockAlert";
import { COLORS } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

const quickAlerts = [
  { id: "hello", title: "Hello", icon: "hand-left-outline", color: "#A78BFA" },
  {
    id: "thinking",
    title: "Thinking of you",
    icon: "heart-outline",
    color: "#EC4899",
  },
  {
    id: "checking",
    title: "Just checking in",
    icon: "chatbubble-ellipses-outline",
    color: "#F59E0B",
  },
  {
    id: "asking",
    title: "How are you?",
    icon: "sparkles-outline",
    color: "#A78BFA",
  },

  { id: "call", title: "Call me", icon: "call-outline", color: "#A78BFA" },
  {
    id: "phone",
    title: "Check phone",
    icon: "phone-portrait-outline",
    color: "#38BDF8",
  },
  {
    id: "where",
    title: "Where are you?",
    icon: "location-outline",
    color: "#34D399",
  },
  { id: "way", title: "I'm on my way", icon: "walk-outline", color: "#22C55E" },
  {
    id: "help",
    title: "Need help",
    icon: "help-buoy-outline",
    color: "#FF5573",
  },
  {
    id: "come",
    title: "Please come here",
    icon: "navigate-outline",
    color: "#34D399",
  },
  {
    id: "important",
    title: "Something important",
    icon: "alert-circle-outline",
    color: "#FF5573",
  },
  { id: "urgent", title: "Urgent", icon: "warning-outline", color: "#FF5573" },
];

type ActivityItem = {
  id: string;
  knockId: string;
  recipientRowId?: string;
  direction: "sent" | "received";
  name: string;
  username?: string;
  alert?: string | null;
  message?: string | null;
  priority: "normal" | "urgent";
  status: string;
  createdAt: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
};

function getTimeAgo(date: string) {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 1000),
  );

  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(date).toLocaleDateString();
}

function getDisplayName(profile?: Profile) {
  return profile?.full_name || profile?.username || "Unknown user";
}

function StatusBadge({
  status,
  direction,
}: {
  status: string;
  direction: "sent" | "received";
}) {
  let label = status;
  let color = COLORS.secondaryText;
  let background = COLORS.cardLight;

  if (direction === "received" && status !== "acknowledged") {
    label = "New";
    color = COLORS.accent;
    background = "#8B5CF620";
  } else if (status === "acknowledged") {
    label = "Acknowledged";
    color = COLORS.success;
    background = "#34D39918";
  } else if (status === "delivered") {
    label = "Delivered";
    color = "#38BDF8";
    background = "#38BDF818";
  } else if (status === "sent") {
    label = "Sent";
    color = COLORS.secondaryText;
    background = COLORS.cardLight;
  }

  return (
    <View style={[styles.statusBadge, { backgroundColor: background }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusText, { color }]}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activityError, setActivityError] = useState("");
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const { showAlert, alertNode } = useKnockAlert();

  const openSend = (alert?: string) => {
    router.push({
      pathname: "/send",
      params: alert ? { alert } : {},
    });
  };

  const loadActivity = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoadingActivity(true);
    }

    setActivityError("");

    try {
      // Check the locally stored session before making authenticated requests.
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      // User is logged out or the session is being cleared.
      if (!session?.user) {
        setActivities([]);
        setActivityError("");
        return;
      }

      const userId = session.user.id;

      // 1. Fetch Knocks sent by the current user.
      const { data: outgoingKnocks, error: outgoingError } = await supabase
        .from("knocks")
        .select("id, sender_id, alert, message, priority, created_at")
        .eq("sender_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (outgoingError) throw outgoingError;

      // 2. Fetch recipient records for sent Knocks.
      const outgoingIds = (outgoingKnocks || []).map((item) => item.id);

      let outgoingRecipients: any[] = [];

      if (outgoingIds.length > 0) {
        const { data, error } = await supabase
          .from("knock_recipients")
          .select(
            "id, knock_id, recipient_id, status, created_at, acknowledged_at",
          )
          .in("knock_id", outgoingIds);

        if (error) throw error;
        outgoingRecipients = data || [];
      }

      // 3. Fetch received Knocks.
      const { data: incomingRecipients, error: incomingError } = await supabase
        .from("knock_recipients")
        .select(
          "id, knock_id, recipient_id, status, created_at, acknowledged_at",
        )
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (incomingError) throw incomingError;

      const incomingRows = incomingRecipients || [];
      const incomingKnockIds = incomingRows.map((item) => item.knock_id);

      // 4. Fetch parent Knocks for received records.
      let incomingKnocks: any[] = [];

      if (incomingKnockIds.length > 0) {
        const { data, error } = await supabase
          .from("knocks")
          .select("id, sender_id, alert, message, priority, created_at")
          .in("id", incomingKnockIds);

        if (error) throw error;
        incomingKnocks = data || [];
      }

      // 5. Collect profile IDs.
      const profileIds = new Set<string>();

      outgoingRecipients.forEach((row) => {
        profileIds.add(row.recipient_id);
      });

      incomingKnocks.forEach((row) => {
        profileIds.add(row.sender_id);
      });

      // 6. Fetch profiles.
      let profiles: Profile[] = [];

      if (profileIds.size > 0) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", Array.from(profileIds));

        if (error) throw error;
        profiles = (data || []) as Profile[];
      }

      const profileMap = new Map(
        profiles.map((profile) => [profile.id, profile]),
      );

      const outgoingKnockMap = new Map(
        (outgoingKnocks || []).map((knock) => [knock.id, knock]),
      );

      const incomingKnockMap = new Map(
        incomingKnocks.map((knock) => [knock.id, knock]),
      );

      // 7. Build sent activity.
      const sentItems: ActivityItem[] = [];

      for (const row of outgoingRecipients) {
        const knock = outgoingKnockMap.get(row.knock_id);
        if (!knock) continue;

        const recipient = profileMap.get(row.recipient_id);

        sentItems.push({
          id: `sent-${row.id}`,
          knockId: knock.id,
          recipientRowId: row.id,
          direction: "sent",
          name: getDisplayName(recipient),
          username: recipient?.username || undefined,
          alert: knock.alert,
          message: knock.message,
          priority: knock.priority,
          status: row.status,
          createdAt: knock.created_at,
        });
      }

      // 8. Build received activity.
      const receivedItems: ActivityItem[] = [];

      for (const row of incomingRows) {
        const knock = incomingKnockMap.get(row.knock_id);
        if (!knock) continue;

        const sender = profileMap.get(knock.sender_id);

        receivedItems.push({
          id: `received-${row.id}`,
          knockId: knock.id,
          recipientRowId: row.id,
          direction: "received",
          name: getDisplayName(sender),
          username: sender?.username || undefined,
          alert: knock.alert,
          message: knock.message,
          priority: knock.priority,
          status: row.status,
          createdAt: knock.created_at,
        });
      }

      // 9. Combine and sort.
      const combined = [...sentItems, ...receivedItems].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      // 10. Verify that the same user is still signed in.
      // Prevents an old request from updating activity after logout/login.
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (currentSession?.user?.id !== userId) {
        setActivities([]);
        return;
      }

      setActivities(combined);
    } catch (error: any) {
      // Logging out can invalidate an in-progress Supabase request.
      // This is expected and should not be displayed as an activity error.
      if (
        error?.name === "AuthSessionMissingError" ||
        error?.message?.includes("Auth session missing")
      ) {
        setActivities([]);
        setActivityError("");
        return;
      }

      console.error("Failed to load Home activity:", error);
      setActivityError(error?.message || "Unable to load recent activity.");
    } finally {
      setLoadingActivity(false);
      setRefreshing(false);
    }
  }, []);

  // Load whenever the Home screen becomes active.
  useFocusEffect(
    useCallback(() => {
      loadActivity();
    }, [loadActivity]),
  );

  // Subscribe to new Knocks and recipient status changes.
  useEffect(() => {
    const channel = supabase
      .channel("home-knock-activity")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "knocks",
        },
        () => {
          loadActivity(true);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "knock_recipients",
        },
        () => {
          loadActivity(true);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadActivity]);

  const unreadCount = activities.filter(
    (item) => item.direction === "received" && item.status !== "acknowledged",
  ).length;

  const acknowledgeKnock = async (item: ActivityItem) => {
    if (!item.recipientRowId) return;

    setAcknowledgingId(item.id);

    try {
      const { data, error } = await supabase.rpc("acknowledge_knock", {
        recipient_row_id: item.recipientRowId,
      });

      if (error) throw error;

      if (!data) {
        throw new Error("This Knock could not be acknowledged.");
      }

      await loadActivity(true);
    } catch (error: any) {
      console.error("Failed to acknowledge Knock:", error);
      showAlert({
        title: "Unable to acknowledge",
        message: error?.message || "Please try again.",
        variant: "error",
      });
    } finally {
      setAcknowledgingId(null);
    }
  };

  const openHistory = () => {
    router.push("/(tabs)/history");
  };

  const renderActivity = (item: ActivityItem) => {
    const isReceived = item.direction === "received";
    const isUrgent = item.priority === "urgent";
    const isAcknowledged = item.status === "acknowledged";
    const isAcknowledging = acknowledgingId === item.id;

    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.8}
        style={styles.activityCard}
        onPress={openHistory}
      >
        <View
          style={[
            styles.activityIcon,
            {
              backgroundColor: isUrgent
                ? "#FF557318"
                : isReceived
                  ? "#8B5CF620"
                  : "#38BDF818",
            },
          ]}
        >
          <Ionicons
            name={
              isUrgent
                ? "alert-circle"
                : isReceived
                  ? "arrow-down-outline"
                  : "arrow-up-outline"
            }
            size={21}
            color={
              isUrgent ? COLORS.danger : isReceived ? COLORS.accent : "#38BDF8"
            }
          />
        </View>

        <View style={styles.activityInfo}>
          <View style={styles.activityTopLine}>
            <Text style={styles.activityName} numberOfLines={1}>
              {isReceived ? item.name : `To ${item.name}`}
            </Text>

            {isUrgent && (
              <View style={styles.urgentBadge}>
                <Text style={styles.urgentText}>URGENT</Text>
              </View>
            )}
          </View>

          <Text style={styles.activityMessage} numberOfLines={1}>
            {item.alert || item.message || "Sent a Knock"}
            {item.alert && item.message ? ` · ${item.message}` : ""}
          </Text>

          <View style={styles.activityBottomLine}>
            {isReceived ? (
              isAcknowledged ? (
                <StatusBadge status="acknowledged" direction="received" />
              ) : (
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={isAcknowledging}
                  style={[
                    styles.acknowledgeButton,
                    isAcknowledging && { opacity: 0.65 },
                  ]}
                  onPress={() => acknowledgeKnock(item)}
                >
                  {isAcknowledging ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={16}
                        color="#FFFFFF"
                      />
                      <Text style={styles.acknowledgeText}>Acknowledge</Text>
                    </>
                  )}
                </TouchableOpacity>
              )
            ) : (
              <StatusBadge status={item.status} direction="sent" />
            )}

            <Text style={styles.activityTime}>
              {getTimeAgo(item.createdAt)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadActivity(true)}
            tintColor={COLORS.accent}
            colors={[COLORS.primary]}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>
              knock<Text style={styles.brandDot}>.</Text>
            </Text>
            <Text style={styles.tagline}>Get their attention.</Text>
          </View>

          <TouchableOpacity
            style={styles.notificationButton}
            onPress={openHistory}
          >
            <Ionicons
              name="notifications-outline"
              size={23}
              color={COLORS.text}
            />

            {unreadCount > 0 && (
              <View style={styles.notificationDot}>
                <Text style={styles.notificationCount}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.greeting}></View>

        <LinearGradient
          colors={["#6841C6", "#43248E", "#29165A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.mainCard}
        >
          <View style={styles.glowCircle} />

          <View style={styles.cardTop}>
            <View style={styles.cardIcon}>
              <Ionicons name="hand-left" size={25} color="#FFFFFF" />
            </View>
            <Text style={styles.cardLabel}>YOUR NEXT MOVE</Text>
          </View>

          <Text style={styles.cardTitle}>Ready to send{"\n"}a Knock?</Text>
          <Text style={styles.cardDescription}>
            Get someone's attention with just one tap.
          </Text>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.sendButton}
            onPress={() => openSend()}
          >
            <Text style={styles.sendButtonText}>Send a Knock</Text>
            <Ionicons name="arrow-forward" size={19} color="#4C2A91" />
          </TouchableOpacity>
        </LinearGradient>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Quick alerts</Text>
            <Text style={styles.sectionSubtitle}>Say it without typing</Text>
          </View>
          <Ionicons name="flash" size={20} color={COLORS.accent} />
        </View>

        <View style={styles.alertGrid}>
          {quickAlerts.map((item) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.8}
              style={styles.alertCard}
              onPress={() => openSend(item.title)}
            >
              <View
                style={[
                  styles.alertIcon,
                  { backgroundColor: `${item.color}20` },
                ]}
              >
                <Ionicons
                  name={item.icon as any}
                  size={23}
                  color={item.color}
                />
              </View>
              <Text style={styles.alertTitle}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Recent activity</Text>
            <Text style={styles.sectionSubtitle}>Your latest Knocks</Text>
          </View>

          <TouchableOpacity onPress={openHistory}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>

        {loadingActivity ? (
          <View style={styles.loadingActivity}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={styles.loadingText}>Loading activity...</Text>
          </View>
        ) : activityError ? (
          <View style={styles.emptyActivity}>
            <Ionicons
              name="cloud-offline-outline"
              size={28}
              color={COLORS.danger}
            />
            <Text style={styles.emptyTitle}>Couldn't load activity</Text>
            <Text style={styles.emptyDescription}>{activityError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => loadActivity()}
            >
              <Ionicons name="refresh" size={16} color="#FFFFFF" />
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : activities.length === 0 ? (
          <View style={styles.emptyActivity}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="notifications-outline"
                size={27}
                color={COLORS.accent}
              />
            </View>
            <Text style={styles.emptyTitle}>It's quiet here</Text>
            <Text style={styles.emptyDescription}>
              Your sent and received Knocks will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.activityList}>
            {activities.slice(0, 2).map(renderActivity)}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
      {alertNode}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 20, paddingTop: 58, paddingBottom: 25 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1.5,
  },
  brandDot: { color: COLORS.primary },
  tagline: { color: COLORS.secondaryText, fontSize: 12, marginTop: -2 },

  notificationButton: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  notificationDot: {
    position: "absolute",
    top: 5,
    right: 5,
    minWidth: 17,
    height: 17,
    borderRadius: 10,
    backgroundColor: COLORS.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  notificationCount: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },

  greeting: { marginTop: 34, marginBottom: 22 },

  mainCard: {
    borderRadius: 26,
    padding: 22,
    overflow: "hidden",
    minHeight: 245,
  },
  glowCircle: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 100,
    backgroundColor: "#A78BFA20",
    right: -65,
    top: -65,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FFFFFF25",
    justifyContent: "center",
    alignItems: "center",
  },
  cardLabel: {
    color: "#E4D9FF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "900",
    marginTop: 19,
  },
  cardDescription: { color: "#E2D8FF", fontSize: 13, marginTop: 7 },
  sendButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    height: 49,
    marginTop: 20,
    paddingHorizontal: 17,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sendButtonText: { color: "#4C2A91", fontSize: 14, fontWeight: "800" },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 31,
    marginBottom: 15,
  },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  sectionSubtitle: { color: COLORS.secondaryText, fontSize: 12, marginTop: 4 },

  alertGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 11,
  },
  alertCard: {
    width: "48%",
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    minHeight: 105,
    justifyContent: "space-between",
  },
  alertIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  alertTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 10,
  },
  viewAll: { color: COLORS.accent, fontSize: 12, fontWeight: "700" },

  loadingActivity: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 28,
    alignItems: "center",
    gap: 10,
  },
  loadingText: { color: COLORS.secondaryText, fontSize: 12 },

  emptyActivity: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 23,
    alignItems: "center",
  },
  emptyIcon: {
    width: 55,
    height: 55,
    borderRadius: 18,
    backgroundColor: "#8B5CF620",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 13,
  },
  emptyDescription: {
    color: COLORS.secondaryText,
    fontSize: 12,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 19,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  retryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },

  activityList: { gap: 10 },
  activityCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  activityIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  activityInfo: { flex: 1, minWidth: 0 },
  activityTopLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  activityName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
    flexShrink: 1,
  },
  urgentBadge: {
    backgroundColor: "#FF557320",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  urgentText: {
    color: COLORS.danger,
    fontSize: 8,
    fontWeight: "900",
  },
  activityMessage: {
    color: COLORS.secondaryText,
    fontSize: 12,
    marginTop: 5,
  },
  activityBottomLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 9,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 9, fontWeight: "800" },
  activityTime: { color: COLORS.muted, fontSize: 10 },

  acknowledgeButton: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.primary,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 112,
    justifyContent: "center",
  },
  acknowledgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
});
