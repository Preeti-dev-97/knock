import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useKnockAlert } from "../../components/KnockAlert";
import { COLORS } from "../../constants/theme";
import { supabase } from "../../lib/supabase";

type KnockPriority = "normal" | "urgent";
type RecipientStatus = "sent" | "delivered" | "acknowledged";
type HistoryFilter = "all" | "sent" | "received";

type KnockItem = {
  id: string;
  recipient_row_id: string;
  sender_id: string;
  recipient_id: string;
  alert: string | null;
  message: string | null;
  priority: KnockPriority;
  created_at: string;
  status: RecipientStatus;
  delivered_at: string | null;
  acknowledged_at: string | null;
  direction: "sent" | "received";
  person_name: string;
  person_username: string | null;
  knock_id: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  username: string | null;
};

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

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return `Today, ${date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }

  return date.toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: RecipientStatus }) {
  const config = {
    sent: {
      label: "Sent",
      icon: "paper-plane-outline" as const,
      color: COLORS.accent,
    },
    delivered: {
      label: "Delivered",
      icon: "checkmark-done-outline" as const,
      color: "#38BDF8",
    },
    acknowledged: {
      label: "Acknowledged",
      icon: "checkmark-done" as const,
      color: COLORS.success,
    },
  }[status];

  return (
    <View
      style={[
        styles.statusBadge,
        {
          borderColor: `${config.color}55`,
          backgroundColor: `${config.color}14`,
        },
      ]}
    >
      <Ionicons name={config.icon} size={13} color={config.color} />
      <Text style={[styles.statusText, { color: config.color }]}>
        {config.label}
      </Text>
    </View>
  );
}

export default function HistoryScreen() {
  const { showAlert, alertNode } = useKnockAlert();

  const [items, setItems] = useState<KnockItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const { knockId } = useLocalSearchParams<{ knockId?: string }>();
  const router = useRouter();
  const [clearing, setClearing] = useState(false);
  const [unreadReplies, setUnreadReplies] = useState<Record<string, number>>(
    {},
  );

  const selectedKnockId = typeof knockId === "string" ? knockId : undefined;

  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const cardOffsets = useRef<Record<string, number>>({});

  const loadHistory = useCallback(async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      const user = authData.user;

      if (!user) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      setCurrentUserId(user.id);

      const { data: replyReads, error: replyReadsError } = await supabase
        .from("knock_reply_reads")
        .select("recipient_row_id, last_read_at")
        .eq("user_id", user.id);

      if (replyReadsError) throw replyReadsError;

      const lastReadByRecipient = new Map(
        (replyReads ?? []).map((row) => [
          row.recipient_row_id,
          row.last_read_at,
        ]),
      );

      // 1. Load Knocks sent by the current user.
      const { data: outgoingKnocks, error: outgoingError } = await supabase
        .from("knocks")
        .select("id, sender_id, alert, message, priority, created_at")
        .eq("sender_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (outgoingError) throw outgoingError;

      // 2. Load Knocks received by the current user.
      const { data: incomingRows, error: incomingError } = await supabase
        .from("knock_recipients")
        .select(
          "id, knock_id, recipient_id, status, delivered_at, acknowledged_at, created_at",
        )
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (incomingError) throw incomingError;

      const outgoingIds = (outgoingKnocks ?? []).map((row) => row.id);

      const incomingKnockIds = Array.from(
        new Set((incomingRows ?? []).map((row) => row.knock_id)),
      );

      // 3. Load recipient statuses for outgoing Knocks.
      let outgoingRecipients: any[] = [];

      if (outgoingIds.length > 0) {
        const { data, error: recipientsError } = await supabase
          .from("knock_recipients")
          .select(
            "id, knock_id, recipient_id, status, delivered_at, acknowledged_at, created_at",
          )
          .in("knock_id", outgoingIds)
          .order("created_at", { ascending: false });

        if (recipientsError) throw recipientsError;

        outgoingRecipients = data ?? [];
      }

      // 4. Load parent Knocks for incoming recipient rows.
      let incomingKnocks: any[] = [];

      if (incomingKnockIds.length > 0) {
        const { data, error: incomingKnocksError } = await supabase
          .from("knocks")
          .select("id, sender_id, alert, message, priority, created_at")
          .in("id", incomingKnockIds);

        if (incomingKnocksError) throw incomingKnocksError;

        incomingKnocks = data ?? [];
      }

      const knockById = new Map(
        [...(outgoingKnocks ?? []), ...incomingKnocks].map((knock) => [
          knock.id,
          knock,
        ]),
      );

      // 5. Load the other users' profiles.
      const profileIds = Array.from(
        new Set([
          ...outgoingRecipients.map((row) => row.recipient_id),
          ...incomingKnocks.map((knock) => knock.sender_id),
        ]),
      ).filter((id) => id !== user.id);

      let profiles: ProfileRow[] = [];

      if (profileIds.length > 0) {
        const { data, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", profileIds);

        if (profilesError) throw profilesError;

        profiles = (data ?? []) as ProfileRow[];
      }

      const profileById = new Map(
        profiles.map((profile) => [profile.id, profile]),
      );

      // 6. Format outgoing history.
      const sentItems: KnockItem[] = outgoingRecipients.flatMap((row) => {
        const knock = knockById.get(row.knock_id);

        if (!knock) return [];

        const profile = profileById.get(row.recipient_id);

        return [
          {
            id: `${knock.id}:${row.id}`,
            knock_id: knock.id,
            recipient_row_id: row.id,
            sender_id: knock.sender_id,
            recipient_id: row.recipient_id,
            alert: knock.alert,
            message: knock.message,
            priority: knock.priority,
            created_at: knock.created_at,
            status: row.status,
            delivered_at: row.delivered_at,
            acknowledged_at: row.acknowledged_at,
            direction: "sent",
            person_name:
              profile?.full_name?.trim() ||
              profile?.username ||
              "Knock recipient",
            person_username: profile?.username ?? null,
          },
        ];
      });

      // 7. Format incoming history.
      const incomingRowByKnock = new Map(
        (incomingRows ?? []).map((row) => [row.knock_id, row]),
      );

      const receivedItems: KnockItem[] = incomingKnocks.flatMap((knock) => {
        const row = incomingRowByKnock.get(knock.id);

        if (!row) return [];

        const profile = profileById.get(knock.sender_id);

        return [
          {
            id: `${knock.id}:${row.id}`,
            knock_id: knock.id,
            recipient_row_id: row.id,
            sender_id: knock.sender_id,
            recipient_id: row.recipient_id,
            alert: knock.alert,
            message: knock.message,
            priority: knock.priority,
            created_at: knock.created_at,
            status: row.status,
            delivered_at: row.delivered_at,
            acknowledged_at: row.acknowledged_at,
            direction: "received",
            person_name:
              profile?.full_name?.trim() || profile?.username || "Knock sender",
            person_username: profile?.username ?? null,
          },
        ];
      });

      const combined = [...sentItems, ...receivedItems].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      // Get activities previously cleared by this user.
      const { data: hiddenActivities, error: hiddenError } = await supabase
        .from("hidden_knock_activities")
        .select("recipient_row_id")
        .eq("user_id", user.id);

      if (hiddenError) throw hiddenError;

      const hiddenIds = new Set(
        (hiddenActivities ?? []).map((row) => row.recipient_row_id),
      );

      // Hide cleared activities and keep only the latest 10.
      const filteredItems = combined
        .filter((item) => !hiddenIds.has(item.recipient_row_id))
        .slice(0, 10);

      const unreadCounts: Record<string, number> = {};

      for (const item of combined) {
        if (
          !filteredItems.some(
            (visible) => visible.recipient_row_id === item.recipient_row_id,
          )
        ) {
          continue;
        }

        const lastReadAt = lastReadByRecipient.get(item.recipient_row_id);

        const { data: replyRows, error: replyError } = await supabase
          .from("knock_replies")
          .select("id")
          .eq("recipient_row_id", item.recipient_row_id)
          .neq("sender_id", user.id)
          .gt("created_at", lastReadAt ?? "1970-01-01T00:00:00.000Z");

        if (replyError) throw replyError;

        unreadCounts[item.recipient_row_id] = replyRows?.length ?? 0;
      }

      setUnreadReplies(unreadCounts);
      setItems(filteredItems);
    } catch (loadError) {
      console.error("Failed to load Knock history:", loadError);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (selectedKnockId) {
      setFilter("all");
    }
  }, [selectedKnockId]);

  // Load history whenever this tab receives focus.
  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory]),
  );

  // Listen for new Knocks and status changes.
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`knock-history-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "knocks",
        },
        () => {
          void loadHistory(true);
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
          void loadHistory(true);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "knock_replies",
        },
        () => {
          void loadHistory(true);
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Knock history Realtime status:", status);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, loadHistory]);

  // Acknowledge an incoming Knock.
  const acknowledge = async (item: KnockItem) => {
    if (acknowledgingId) return;

    setAcknowledgingId(item.recipient_row_id);

    try {
      const { error: acknowledgeError } = await supabase.rpc(
        "acknowledge_knock",
        {
          recipient_row_id: item.recipient_row_id,
        },
      );

      if (acknowledgeError) throw acknowledgeError;

      await loadHistory(true);
    } catch (ackError) {
      console.error("Failed to acknowledge Knock:", ackError);

      showAlert({
        title: "Couldn't acknowledge Knock",
        message: getErrorMessage(ackError),
        variant: "error",
        buttonLabel: "Got it",
      });
    } finally {
      setAcknowledgingId(null);
    }
  };

  // Actually clear the displayed activities.
  const performClear = async () => {
    setClearing(true);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      const user = authData.user;

      if (!user) {
        throw new Error("Please sign in again.");
      }

      const rows = items.map((item) => ({
        user_id: user.id,
        recipient_row_id: item.recipient_row_id,
      }));

      const { error: clearError } = await supabase
        .from("hidden_knock_activities")
        .upsert(rows, {
          onConflict: "user_id,recipient_row_id",
          ignoreDuplicates: true,
        });

      if (clearError) throw clearError;

      setItems([]);
    } catch (clearError) {
      console.error("Failed to clear notifications:", clearError);

      showAlert({
        title: "Couldn't clear notifications",
        message: getErrorMessage(clearError),
        variant: "error",
        buttonLabel: "Got it",
      });
    } finally {
      setClearing(false);
    }
  };

  // Show the custom Knock confirmation before clearing.
  const clearNotifications = () => {
    if (items.length === 0 || clearing) return;

    showAlert({
      title: "Clear notifications?",
      message:
        "This will remove all 10 displayed activity notifications from your history. You can still receive new Knocks.",
      variant: "warning",
      buttonLabel: "Clear notifications",
      dismissOnBackdrop: false,
      onDone: () => {
        void performClear();
      },
    });
  };

  const visibleItems = useMemo(() => {
    if (filter === "all") return items;

    return items.filter((item) => item.direction === filter);
  }, [filter, items]);

  useEffect(() => {
    if (!selectedKnockId || loading) return;

    const targetExists = items.some(
      (item) => item.knock_id === selectedKnockId,
    );

    if (!targetExists) return;

    const timeout = setTimeout(() => {
      const offset = cardOffsets.current[selectedKnockId];

      if (typeof offset === "number") {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, offset - 12),
          animated: true,
        });
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [selectedKnockId, items, loading]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Activity</Text>
            <Text style={styles.subtitle}>Every Knock, all in one place.</Text>
          </View>

          <Pressable
            onPress={clearNotifications}
            disabled={items.length === 0 || clearing}
            style={[
              styles.clearButton,
              (items.length === 0 || clearing) && styles.clearButtonDisabled,
            ]}
          >
            {clearing ? (
              <ActivityIndicator size="small" color={COLORS.danger} />
            ) : (
              <Ionicons name="trash-outline" size={15} color={COLORS.danger} />
            )}

            <Text style={styles.clearButtonText}>Clear</Text>
          </Pressable>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        {(["all", "sent", "received"] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setFilter(value)}
            style={[
              styles.filterButton,
              filter === value && styles.filterButtonActive,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === value }}
          >
            <Text
              style={[
                styles.filterText,
                filter === value && styles.filterTextActive,
              ]}
            >
              {value === "all" ? "All" : value === "sent" ? "Sent" : "Received"}
            </Text>
          </Pressable>
        ))}

        <Pressable
          onPress={() => void loadHistory(true)}
          style={styles.refreshButton}
          accessibilityRole="button"
          accessibilityLabel="Refresh history"
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={COLORS.accent} />
          ) : (
            <Ionicons name="refresh" size={17} color={COLORS.accent} />
          )}
        </Pressable>
      </View>

      {/* Initial loading */}
      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.stateText}>Loading your activity...</Text>
        </View>
      ) : error ? (
        /* Error state */
        <View style={styles.centerState}>
          <Ionicons
            name="cloud-offline-outline"
            size={38}
            color={COLORS.danger}
          />

          <Text style={styles.emptyTitle}>Couldn't load activity</Text>

          <Text style={styles.description}>{error}</Text>

          <Pressable
            style={styles.retryButton}
            onPress={() => void loadHistory()}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : visibleItems.length === 0 ? (
        /* Empty state */
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadHistory(true)}
              tintColor={COLORS.accent}
            />
          }
        >
          <View style={styles.emptyArea}>
            <View style={styles.iconCircle}>
              <Ionicons
                name="notifications-outline"
                size={38}
                color={COLORS.accent}
              />
            </View>

            <Text style={styles.emptyTitle}>
              {filter === "all"
                ? "Nothing to see yet"
                : `No ${filter} Knocks yet`}
            </Text>

            <Text style={styles.description}>
              When you send or receive a Knock, your notification history and
              its delivery status will show up here.
            </Text>
          </View>
        </ScrollView>
      ) : (
        /* History list */
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadHistory(true)}
              tintColor={COLORS.accent}
            />
          }
        >
          {visibleItems.map((item) => {
            const isUrgent = item.priority === "urgent";
            const isReceived = item.direction === "received";
            const canAcknowledge = isReceived && item.status !== "acknowledged";

            const isAcknowledging = acknowledgingId === item.recipient_row_id;

            return (
              <View
                key={item.id}
                onLayout={(event) => {
                  const y = event.nativeEvent.layout.y;
                  cardOffsets.current[item.knock_id] = y;
                }}
                style={[
                  styles.knockCard,
                  item.knock_id === selectedKnockId &&
                    styles.knockCardHighlighted,
                ]}
              >
                <View style={styles.cardTop}>
                  <View
                    style={[styles.cardIcon, isUrgent && styles.urgentIcon]}
                  >
                    <Ionicons
                      name={
                        isUrgent
                          ? "alert-circle"
                          : isReceived
                            ? "download-outline"
                            : "paper-plane-outline"
                      }
                      size={20}
                      color={isUrgent ? COLORS.danger : COLORS.accent}
                    />
                  </View>

                  <View style={styles.cardHeading}>
                    <Text style={styles.personName} numberOfLines={1}>
                      {isReceived
                        ? `From ${item.person_name}`
                        : `To ${item.person_name}`}
                    </Text>

                    <Text style={styles.dateText}>
                      {formatDate(item.created_at)}
                    </Text>
                  </View>

                  {isUrgent && (
                    <View style={styles.urgentPill}>
                      <Text style={styles.urgentText}>URGENT</Text>
                    </View>
                  )}
                </View>

                {!!item.alert && (
                  <Text style={styles.alertText}>{item.alert}</Text>
                )}

                {!!item.message && (
                  <Text style={styles.messageText}>{item.message}</Text>
                )}

                <View style={styles.cardFooter}>
                  {isReceived ? (
                    canAcknowledge ? (
                      <Pressable
                        style={[
                          styles.ackButton,
                          isAcknowledging && styles.disabledButton,
                        ]}
                        onPress={() => void acknowledge(item)}
                        disabled={acknowledgingId !== null}
                        accessibilityRole="button"
                        accessibilityLabel="Acknowledge received Knock"
                      >
                        {isAcknowledging ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Ionicons
                            name="checkmark"
                            size={15}
                            color="#FFFFFF"
                          />
                        )}

                        <Text style={styles.ackText}>Acknowledge</Text>
                      </Pressable>
                    ) : (
                      <StatusBadge status="acknowledged" />
                    )
                  ) : (
                    <StatusBadge status={item.status} />
                  )}

                  <Pressable
                    style={styles.replyButton}
                    onPress={() =>
                      router.push({
                        pathname: "/knock-replies",
                        params: {
                          knockId: item.knock_id,
                          recipientRowId: item.recipient_row_id,
                          personName: item.person_name,
                          canReply: "true",
                        },
                      })
                    }
                  >
                    <View style={styles.replyButtonContent}>
                      <Ionicons
                        name="chatbubble-outline"
                        size={15}
                        color={COLORS.accent}
                      />
                      <Text style={styles.replyButtonText}>Replies</Text>

                      {(unreadReplies[item.recipient_row_id] ?? 0) > 0 && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>
                            {(unreadReplies[item.recipient_row_id] ?? 0) > 9
                              ? "9+"
                              : unreadReplies[item.recipient_row_id]}
                          </Text>
                        </View>
                      )}
                    </View>
                  </Pressable>

                  {/* Knock Back — received Knocks only */}
                  {isReceived && (
                    <Pressable
                      style={styles.knockBackButton}
                      onPress={() =>
                        router.push({
                          pathname: "/knock-back",
                          params: {
                            senderId: item.sender_id,
                            senderName: item.person_name,
                          },
                        })
                      }
                    >
                      <Ionicons
                        name="return-up-back-outline"
                        size={15}
                        color="#FFFFFF"
                      />
                      <Text style={styles.knockBackButtonText}>Knock Back</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Shared Knock Alert */}
      {alertNode}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 22,
    paddingTop: Platform.OS === "web" ? 30 : 60,
  },

  header: {
    marginBottom: 22,
  },

  title: {
    color: COLORS.text,
    fontSize: 27,
    fontWeight: "900",
  },

  subtitle: {
    color: COLORS.secondaryText,
    fontSize: 13,
    marginTop: 5,
  },

  filters: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 16,
  },

  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  filterButtonActive: {
    backgroundColor: "#8B5CF620",
    borderColor: COLORS.primary,
  },

  filterText: {
    color: COLORS.secondaryText,
    fontSize: 12,
    fontWeight: "700",
  },

  filterTextActive: {
    color: COLORS.lavender,
  },

  refreshButton: {
    marginLeft: "auto",
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 55,
  },

  stateText: {
    color: COLORS.secondaryText,
    fontSize: 13,
    marginTop: 12,
  },

  emptyScroll: {
    flexGrow: 1,
  },

  emptyArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
    paddingHorizontal: 12,
  },

  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 30,
    backgroundColor: "#8B5CF620",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "800",
    marginTop: 22,
    textAlign: "center",
  },

  description: {
    color: COLORS.secondaryText,
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 9,
    maxWidth: 310,
  },

  retryButton: {
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },

  retryText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },

  listContent: {
    paddingBottom: 28,
    gap: 12,
  },

  knockCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 15,
  },

  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#8B5CF620",
    alignItems: "center",
    justifyContent: "center",
  },

  urgentIcon: {
    backgroundColor: "#FF55731A",
  },

  cardHeading: {
    flex: 1,
  },

  personName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },

  dateText: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },

  urgentPill: {
    backgroundColor: "#FF55731A",
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  urgentText: {
    color: COLORS.danger,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  alertText: {
    color: COLORS.lavender,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 14,
  },

  messageText: {
    color: COLORS.secondaryText,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },

  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    gap: 10,
    flexWrap: "wrap",
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },

  ackButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 112,
  },

  disabledButton: {
    opacity: 0.65,
  },

  ackText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },

  knockCardHighlighted: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    backgroundColor: "#8B5CF615",
  },

  replyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },

  replyButtonText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: "800",
  },

  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${COLORS.danger}55`,
    backgroundColor: `${COLORS.danger}12`,
  },

  clearButtonDisabled: {
    opacity: 0.4,
  },

  clearButtonText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "800",
  },

  replyButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  unreadBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: COLORS.danger,
    alignItems: "center",
    justifyContent: "center",
  },

  unreadBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },
  knockBackButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },

  knockBackButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
});
