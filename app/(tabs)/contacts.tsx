import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { COLORS } from "../../constants/theme";

type Profile = {
  id: string;
  username: string;
  full_name: string;
};

type FriendRequest = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
};

type Tab = "contacts" | "requests";

export default function ContactsScreen() {
  const [activeTab, setActiveTab] = useState<Tab>("contacts");

  const [userId, setUserId] = useState("");
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  // Load the logged-in user.
  const loadUser = useCallback(async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) throw error;

    if (!user) {
      throw new Error("Please log in again.");
    }

    setUserId(user.id);
    return user.id;
  }, []);

  // Load contacts and requests.
  const loadData = useCallback(async () => {
    try {
      setMessage("");

      const currentUserId = userId || (await loadUser());

      const { data, error } = await supabase
        .from("friend_requests")
        .select("id, requester_id, addressee_id, status, created_at")
        .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const requests = (data || []) as FriendRequest[];

      const accepted = requests.filter(
        (request) => request.status === "accepted",
      );

      const received = requests.filter(
        (request) =>
          request.status === "pending" &&
          request.addressee_id === currentUserId,
      );

      const sent = requests.filter(
        (request) =>
          request.status === "pending" &&
          request.requester_id === currentUserId,
      );

      setIncoming(received);
      setOutgoing(sent);

      // Find the other users involved in these requests.
      const otherUserIds = [
        ...new Set(
          requests.map((request) =>
            request.requester_id === currentUserId
              ? request.addressee_id
              : request.requester_id,
          ),
        ),
      ];

      let profileMap: Record<string, Profile> = {};

      if (otherUserIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, full_name")
          .in("id", otherUserIds);

        if (profileError) throw profileError;

        (profileData || []).forEach((profile) => {
          profileMap[profile.id] = profile as Profile;
        });
      }

      setProfiles(profileMap);

      const connectedContacts = accepted
        .map((request) => {
          const otherUserId =
            request.requester_id === currentUserId
              ? request.addressee_id
              : request.requester_id;

          return profileMap[otherUserId];
        })
        .filter(Boolean);

      setContacts(connectedContacts);
    } catch (error: any) {
      console.error("Contacts loading error:", error.message);
      setMessage(error.message || "Unable to load contacts.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, loadUser]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Search registered users.
  useEffect(() => {
    if (!modalVisible) return;

    const searchTerm = search.trim().replace(/^@/, "");

    if (searchTerm.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let active = true;

    const timer = setTimeout(async () => {
      setSearchLoading(true);

      try {
        const currentUserId = userId || (await loadUser());

        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, full_name")
          .neq("id", currentUserId)
          .or(`username.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
          .limit(20);

        if (error) throw error;

        if (active) {
          setSearchResults((data || []) as Profile[]);
        }
      } catch (error: any) {
        console.error("User search error:", error.message);

        if (active) {
          setSearchResults([]);
        }
      } finally {
        if (active) setSearchLoading(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, modalVisible, userId, loadUser]);

  // Send a connection request.
  const sendRequest = async (targetId: string) => {
    setActionLoading(targetId);
    setMessage("");

    try {
      const { error } = await supabase.rpc("send_friend_request", {
        target_user_id: targetId,
      });

      if (error) throw error;

      setMessage("Connection request sent successfully.");
      await loadData();
    } catch (error: any) {
      setMessage(error.message || "Unable to send request.");
    } finally {
      setActionLoading(null);
    }
  };

  // Accept or reject an incoming request.
  const respondToRequest = async (
    requestId: string,
    action: "accept" | "reject",
  ) => {
    const actionKey = `${requestId}:${action}`;

    setActionLoading(actionKey);
    setMessage("");

    try {
      const { error } = await supabase.rpc(
        action === "accept" ? "accept_friend_request" : "reject_friend_request",
        {
          request_id: requestId,
        },
      );

      if (error) throw error;

      setMessage(
        action === "accept"
          ? "Connection request accepted."
          : "Connection request rejected.",
      );

      await loadData();
    } catch (error: any) {
      setMessage(error.message || "Unable to update request.");
    } finally {
      setActionLoading(null);
    }
  };

  // Cancel an outgoing request.
  const cancelRequest = async (requestId: string) => {
    setActionLoading(requestId);
    setMessage("");

    try {
      const { error } = await supabase.rpc("cancel_friend_request", {
        request_id: requestId,
      });

      if (error) throw error;

      setMessage("Request cancelled.");
      await loadData();
    } catch (error: any) {
      setMessage(error.message || "Unable to cancel request.");
    } finally {
      setActionLoading(null);
    }
  };

  const getRequestStatus = (profileId: string) => {
    const accepted = contacts.some((contact) => contact.id === profileId);

    if (accepted) return "connected";

    if (outgoing.some((request) => request.addressee_id === profileId)) {
      return "sent";
    }

    if (incoming.some((request) => request.requester_id === profileId)) {
      return "received";
    }

    return "add";
  };

  const renderAvatar = (name: string) => (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>
        {name?.charAt(0)?.toUpperCase() || "K"}
      </Text>
    </View>
  );

  const renderProfileInfo = (profile: Profile) => (
    <View style={styles.profileInfo}>
      <Text style={styles.personName} numberOfLines={1}>
        {profile.full_name || "Knock Member"}
      </Text>
      <Text style={styles.personUsername} numberOfLines={1}>
        @{profile.username}
      </Text>
    </View>
  );

  const renderSearchAction = (profile: Profile) => {
    const status = getRequestStatus(profile.id);
    const busy = actionLoading === profile.id;

    return (
      <TouchableOpacity
        style={[
          styles.actionButton,
          status === "connected" && styles.connectedButton,
          status === "sent" && styles.sentButton,
          status === "received" && styles.sentButton,
        ]}
        disabled={status !== "add" || busy}
        onPress={() => sendRequest(profile.id)}
      >
        {busy ? (
          <ActivityIndicator size="small" color={COLORS.accent} />
        ) : (
          <>
            <Ionicons
              name={
                status === "connected"
                  ? "checkmark"
                  : status === "sent"
                    ? "time-outline"
                    : status === "received"
                      ? "mail-outline"
                      : "person-add-outline"
              }
              size={15}
              color={status === "connected" ? COLORS.success : COLORS.accent}
            />
            <Text
              style={[
                styles.actionText,
                status === "connected" && { color: COLORS.success },
              ]}
            >
              {status === "connected"
                ? "Connected"
                : status === "sent"
                  ? "Sent"
                  : status === "received"
                    ? "Received"
                    : "Add"}
            </Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.heading}>Contacts</Text>
            <Text style={styles.subtitle}>Your people, all in one place.</Text>
          </View>

          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              setSearch("");
              setSearchResults([]);
              setMessage("");
              setModalVisible(true);
            }}
          >
            <Ionicons name="person-add" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{contacts.length}</Text>
            <Text style={styles.statLabel}>Connections</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{incoming.length}</Text>
            <Text style={styles.statLabel}>Requests</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{outgoing.length}</Text>
            <Text style={styles.statLabel}>Sent</Text>
          </View>
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "contacts" && styles.activeTab]}
            onPress={() => setActiveTab("contacts")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "contacts" && styles.activeTabText,
              ]}
            >
              My Contacts
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === "requests" && styles.activeTab]}
            onPress={() => setActiveTab("requests")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "requests" && styles.activeTabText,
              ]}
            >
              Requests {incoming.length > 0 ? `(${incoming.length})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        {!!message && (
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator
            size="large"
            color={COLORS.accent}
            style={{ marginTop: 45 }}
          />
        ) : activeTab === "contacts" ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your connections</Text>
              <Text style={styles.countText}>{contacts.length}</Text>
            </View>

            {contacts.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="people-outline"
                    size={32}
                    color={COLORS.accent}
                  />
                </View>

                <Text style={styles.emptyTitle}>No contacts yet</Text>

                <Text style={styles.emptySubtitle}>
                  Find people on Knock and send them a connection request.
                </Text>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => {
                    setSearch("");
                    setModalVisible(true);
                  }}
                >
                  <Ionicons
                    name="person-add-outline"
                    size={17}
                    color="#FFFFFF"
                  />
                  <Text style={styles.primaryButtonText}>Find people</Text>
                </TouchableOpacity>
              </View>
            ) : (
              contacts.map((profile) => (
                <View key={profile.id} style={styles.personCard}>
                  {renderAvatar(profile.full_name)}
                  {renderProfileInfo(profile)}
                  <View style={styles.connectedBadge}>
                    <Ionicons
                      name="checkmark-circle"
                      size={17}
                      color={COLORS.success}
                    />
                    <Text style={styles.connectedText}>Connected</Text>
                  </View>
                </View>
              ))
            )}

            {outgoing.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Pending requests</Text>

                {outgoing.map((request) => {
                  const profile = profiles[request.addressee_id];

                  if (!profile) return null;

                  return (
                    <View key={request.id} style={styles.personCard}>
                      {renderAvatar(profile.full_name)}
                      {renderProfileInfo(profile)}

                      <TouchableOpacity
                        style={styles.cancelButton}
                        disabled={actionLoading === request.id}
                        onPress={() => cancelRequest(request.id)}
                      >
                        {actionLoading === request.id ? (
                          <ActivityIndicator
                            size="small"
                            color={COLORS.accent}
                          />
                        ) : (
                          <Text style={styles.cancelText}>Cancel</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </>
            )}
          </>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Received requests</Text>
              <Text style={styles.countText}>{incoming.length}</Text>
            </View>

            {incoming.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="mail-open-outline"
                    size={32}
                    color={COLORS.accent}
                  />
                </View>

                <Text style={styles.emptyTitle}>No new requests</Text>

                <Text style={styles.emptySubtitle}>
                  When someone wants to connect with you, their request will
                  appear here.
                </Text>
              </View>
            ) : (
              incoming.map((request) => {
                const profile = profiles[request.requester_id];

                if (!profile) return null;

                return (
                  <View key={request.id} style={styles.requestCard}>
                    <View style={styles.personRow}>
                      {renderAvatar(profile.full_name)}
                      {renderProfileInfo(profile)}
                    </View>

                    <View style={styles.requestActions}>
                      <TouchableOpacity
                        style={styles.rejectButton}
                        disabled={actionLoading !== null}
                        onPress={() => respondToRequest(request.id, "reject")}
                      >
                        {actionLoading === `${request.id}:reject` ? (
                          <ActivityIndicator
                            size="small"
                            color={COLORS.danger}
                          />
                        ) : (
                          <>
                            <Ionicons
                              name="close"
                              size={18}
                              color={COLORS.danger}
                            />
                            <Text style={styles.rejectText}>Reject</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.acceptButton}
                        disabled={actionLoading !== null}
                        onPress={() => respondToRequest(request.id, "accept")}
                      >
                        {actionLoading === `${request.id}:accept` ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Ionicons
                              name="checkmark"
                              size={17}
                              color="#FFFFFF"
                            />
                            <Text style={styles.acceptText}>Accept</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* Find people modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Find people</Text>
              <Text style={styles.modalSubtitle}>
                Discover people on Knock.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color={COLORS.muted} />

            <TextInput
              style={styles.searchInput}
              placeholder="Search username or name..."
              placeholderTextColor={COLORS.muted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={19} color={COLORS.muted} />
              </TouchableOpacity>
            )}
          </View>

          {searchLoading ? (
            <ActivityIndicator
              size="large"
              color={COLORS.accent}
              style={{ marginTop: 35 }}
            />
          ) : search.trim().length < 2 ? (
            <View style={styles.modalEmpty}>
              <Ionicons name="search-outline" size={35} color={COLORS.muted} />
              <Text style={styles.modalEmptyText}>
                Enter at least 2 characters to search.
              </Text>
            </View>
          ) : searchResults.length === 0 ? (
            <View style={styles.modalEmpty}>
              <Ionicons name="people-outline" size={35} color={COLORS.muted} />
              <Text style={styles.modalEmptyText}>No users found.</Text>
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 30 }}
            >
              {searchResults.map((profile) => (
                <View key={profile.id} style={styles.personCard}>
                  {renderAvatar(profile.full_name)}
                  {renderProfileInfo(profile)}
                  {renderSearchAction(profile)}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
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
    paddingBottom: 35,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  addButton: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 23,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
  },
  statNumber: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },
  statLabel: {
    color: COLORS.secondaryText,
    fontSize: 10,
    marginTop: 4,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 4,
    marginTop: 25,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 11,
  },
  activeTab: {
    backgroundColor: COLORS.cardLight,
  },
  tabText: {
    color: COLORS.secondaryText,
    fontSize: 12,
    fontWeight: "700",
  },
  activeTabText: {
    color: COLORS.accent,
  },
  messageBox: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  messageText: {
    color: COLORS.accent,
    fontSize: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 25,
    marginBottom: 13,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 24,
    marginBottom: 12,
  },
  countText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  personCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: "#8B5CF630",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: COLORS.lavender,
    fontSize: 18,
    fontWeight: "800",
  },
  profileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  personName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  personUsername: {
    color: COLORS.secondaryText,
    fontSize: 11,
    marginTop: 4,
  },
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  connectedText: {
    color: COLORS.success,
    fontSize: 10,
    fontWeight: "700",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#8B5CF620",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 72,
  },
  connectedButton: {
    backgroundColor: "#34D39918",
  },
  sentButton: {
    backgroundColor: COLORS.cardLight,
  },
  actionText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: COLORS.cardLight,
  },
  cancelText: {
    color: COLORS.secondaryText,
    fontSize: 11,
    fontWeight: "700",
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 25,
    alignItems: "center",
    marginTop: 5,
  },
  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: "#8B5CF620",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 15,
  },
  emptySubtitle: {
    color: COLORS.secondaryText,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 7,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 18,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  requestCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 17,
    padding: 13,
    marginBottom: 11,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  requestActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 13,
  },
  rejectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#FF557315",
  },
  rejectText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: "700",
  },
  acceptButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  acceptText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 20,
    paddingTop: 25,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 23,
    fontWeight: "900",
  },
  modalSubtitle: {
    color: COLORS.secondaryText,
    fontSize: 12,
    marginTop: 5,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 13,
    height: 50,
    marginBottom: 18,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
    outlineStyle: "none" as any,
  },
  modalEmpty: {
    alignItems: "center",
    marginTop: 65,
    gap: 12,
  },
  modalEmptyText: {
    color: COLORS.secondaryText,
    fontSize: 12,
    textAlign: "center",
  },
});
