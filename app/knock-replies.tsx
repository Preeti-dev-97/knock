    import { Ionicons } from "@expo/vector-icons";
    import { useLocalSearchParams, useRouter } from "expo-router";
    import { useCallback, useEffect, useState } from "react";
    import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    } from "react-native";
    import { SafeAreaView } from "react-native-safe-area-context";

    import { COLORS } from "../constants/theme";
    import {
      getKnockReplies,
      KnockReply,
      pickReplyImage,
      sendImageReply,
      sendTextReply,
      markKnockRepliesAsRead,
    } from "../lib/knock-replies";
    import { supabase } from "../lib/supabase";

    export default function KnockRepliesScreen() {
    const router = useRouter();

    const { knockId, recipientRowId, personName, canReply } =
        useLocalSearchParams<{
        knockId: string;
        recipientRowId: string;
        personName: string;
        canReply: string;
        }>();

    const [replies, setReplies] = useState<KnockReply[]>([]);
    const [message, setMessage] = useState("");
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [pickingImage, setPickingImage] = useState(false);
    const [currentUserId, setCurrentUserId] = useState("");

    const loadReplies = useCallback(async () => {
      if (!knockId || !recipientRowId) return;

      try {
        const data = await getKnockReplies(knockId);
        setReplies(data);

        // Mark this recipient's conversation as read.
        await markKnockRepliesAsRead(recipientRowId);
      } catch (error) {
        console.error("Failed to load replies:", error);
      } finally {
        setLoading(false);
      }
    }, [knockId, recipientRowId]);

    useEffect(() => {
        const initialize = async () => {
        const { data } = await supabase.auth.getUser();

        if (data.user) {
            setCurrentUserId(data.user.id);
        }

        await loadReplies();
        };

        void initialize();
    }, [loadReplies]);

    // Listen for new replies.
    useEffect(() => {
        if (!knockId) return;

        const channel = supabase
        .channel(`knock-replies-${knockId}`)
        .on(
            "postgres_changes",
            {
            event: "*",
            schema: "public",
            table: "knock_replies",
            filter: `knock_id=eq.${knockId}`,
            },
            () => {
            void loadReplies();
            },
        )
        .subscribe();

        return () => {
        void supabase.removeChannel(channel);
        };
    }, [knockId, loadReplies]);

    const handlePickImage = async () => {
        if (pickingImage || sending) return;

        setPickingImage(true);

        try {
        const asset = await pickReplyImage();

        if (asset) {
            setSelectedImage(asset.uri);
        }
        } catch (error) {
        console.error("Image selection failed:", error);

        const errorMessage =
            error instanceof Error ? error.message : "Please try again.";

        if (Platform.OS === "web" && typeof window !== "undefined") {
            window.alert(errorMessage);
        } else {
            Alert.alert("Couldn't select image", errorMessage);
        }
        } finally {
        setPickingImage(false);
        }
    };

    const handleSend = async () => {
        if ((!message.trim() && !selectedImage) || sending) return;

        setSending(true);

        try {
        if (selectedImage) {
            await sendImageReply({
            knockId,
            recipientRowId,
            imageUri: selectedImage,
            });

            setSelectedImage(null);
        } else {
            await sendTextReply({
            knockId,
            recipientRowId,
            message,
            });

            setMessage("");
        }

        await loadReplies();
        } catch (error) {
        console.error("Failed to send reply:", error);

        const errorMessage =
            error instanceof Error ? error.message : "Please try again.";

        if (Platform.OS === "web" && typeof window !== "undefined") {
            window.alert(errorMessage);
        } else {
            Alert.alert("Couldn't send reply", errorMessage);
        }
        } finally {
        setSending(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
        >
            {/* Header */}
            <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
                <Ionicons name="arrow-back" size={22} color={COLORS.text} />
            </Pressable>

            <View style={styles.headerText}>
                <Text style={styles.title}>Knock Replies</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                {personName || "Conversation"}
                </Text>
            </View>
            </View>

            {/* Messages */}
            <ScrollView
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            >
            {loading ? (
                <ActivityIndicator
                size="large"
                color={COLORS.primary}
                style={{ marginTop: 30 }}
                />
            ) : replies.length === 0 ? (
                <View style={styles.emptyState}>
                <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={42}
                    color={COLORS.accent}
                />

                <Text style={styles.emptyTitle}>No replies yet</Text>

                <Text style={styles.emptyDescription}>
                    {canReply === "true"
                    ? "Send a message or image to respond to this Knock."
                    : "Replies to this Knock will appear here."}
                </Text>
                </View>
            ) : (
                replies.map((reply) => {
                const isMine = reply.sender_id === currentUserId;

                return (
                    <View
                    key={reply.id}
                    style={[styles.messageRow, isMine && styles.myMessageRow]}
                    >
                    <View
                        style={[
                        styles.messageBubble,
                        isMine
                            ? styles.myMessageBubble
                            : styles.otherMessageBubble,
                        ]}
                    >
                        {!isMine && (
                        <Text style={styles.senderName}>{reply.sender_name}</Text>
                        )}

                        {reply.reply_type === "text" ? (
                        <Text style={styles.messageText}>{reply.message}</Text>
                        ) : reply.reply_type === "image" ? (
                        <View>
                            {reply.media_url ? (
                            <Image
                                source={{ uri: reply.media_url }}
                                style={styles.replyImage}
                                resizeMode="cover"
                            />
                            ) : (
                            <View style={styles.imagePlaceholder}>
                                <Ionicons
                                name="image-outline"
                                size={30}
                                color={COLORS.muted}
                                />
                                <Text style={styles.imagePlaceholderText}>
                                Image unavailable
                                </Text>
                            </View>
                            )}

                            {!!reply.message && (
                            <Text
                                style={[styles.messageText, styles.imageCaption]}
                            >
                                {reply.message}
                            </Text>
                            )}
                        </View>
                        ) : (
                        <Text style={styles.messageText}>🎤 Audio reply</Text>
                        )}

                        <Text style={styles.messageTime}>
                        {new Date(reply.created_at).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                        })}
                        </Text>
                    </View>
                    </View>
                );
                })
            )}
            </ScrollView>

            {/* Reply input */}
            {canReply === "true" && (
            <View style={styles.inputWrapper}>
                {/* Selected image preview */}
                {selectedImage && (
                <View style={styles.previewContainer}>
                    <Image
                    source={{ uri: selectedImage }}
                    style={styles.previewImage}
                    resizeMode="cover"
                    />

                    <Pressable
                    style={styles.removeImageButton}
                    onPress={() => setSelectedImage(null)}
                    disabled={sending}
                    >
                    <Ionicons name="close" size={17} color="#FFFFFF" />
                    </Pressable>
                </View>
                )}

                <View style={styles.inputContainer}>
                <Pressable
                    onPress={() => void handlePickImage()}
                    disabled={pickingImage || sending}
                    style={styles.imageButton}
                >
                    {pickingImage ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                    <Ionicons
                        name="image-outline"
                        size={23}
                        color={COLORS.primary}
                    />
                    )}
                </Pressable>

                <TextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Write a reply..."
                    placeholderTextColor={COLORS.muted}
                    style={styles.input}
                    multiline
                    maxLength={2000}
                    editable={!sending}
                />

                <Pressable
                    onPress={() => void handleSend()}
                    disabled={(!message.trim() && !selectedImage) || sending}
                    style={[
                    styles.sendButton,
                    ((!message.trim() && !selectedImage) || sending) &&
                        styles.disabledButton,
                    ]}
                >
                    {sending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                    <Ionicons name="send" size={19} color="#FFFFFF" />
                    )}
                </Pressable>
                </View>
            </View>
            )}
        </KeyboardAvoidingView>
        </SafeAreaView>
    );
    }

    const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: COLORS.background,
    },

    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },

    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        gap: 13,
    },

    backButton: {
        width: 40,
        height: 40,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.surface,
    },

    headerText: {
        flex: 1,
    },

    title: {
        color: COLORS.text,
        fontSize: 19,
        fontWeight: "900",
    },

    subtitle: {
        color: COLORS.secondaryText,
        fontSize: 12,
        marginTop: 3,
    },

    messages: {
        flex: 1,
    },

    messagesContent: {
        padding: 18,
        paddingBottom: 25,
        flexGrow: 1,
    },

    emptyState: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: 60,
    },

    emptyTitle: {
        color: COLORS.text,
        fontSize: 17,
        fontWeight: "800",
        marginTop: 15,
    },

    emptyDescription: {
        color: COLORS.secondaryText,
        fontSize: 13,
        textAlign: "center",
        marginTop: 7,
    },

    messageRow: {
        flexDirection: "row",
        justifyContent: "flex-start",
        marginBottom: 13,
    },

    myMessageRow: {
        justifyContent: "flex-end",
    },

    messageBubble: {
        maxWidth: "82%",
        padding: 12,
        borderRadius: 16,
    },

    myMessageBubble: {
        backgroundColor: COLORS.primary,
        borderBottomRightRadius: 4,
    },

    otherMessageBubble: {
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderBottomLeftRadius: 4,
    },

    senderName: {
        color: COLORS.lavender,
        fontSize: 11,
        fontWeight: "800",
        marginBottom: 5,
    },

    messageText: {
        color: "#FFFFFF",
        fontSize: 14,
        lineHeight: 20,
    },

    messageTime: {
        color: "#FFFFFFAA",
        fontSize: 9,
        textAlign: "right",
        marginTop: 6,
    },

    replyImage: {
        width: 220,
        height: 220,
        borderRadius: 10,
        backgroundColor: COLORS.surface,
    },

    imageCaption: {
        marginTop: 8,
    },

    imagePlaceholder: {
        width: 220,
        height: 150,
        borderRadius: 10,
        backgroundColor: COLORS.surface,
        alignItems: "center",
        justifyContent: "center",
    },

    imagePlaceholderText: {
        color: COLORS.muted,
        fontSize: 11,
        marginTop: 6,
    },

    inputWrapper: {
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        backgroundColor: COLORS.surface,
    },

    previewContainer: {
        marginHorizontal: 14,
        marginTop: 12,
        alignSelf: "flex-start",
        position: "relative",
    },

    previewImage: {
        width: 85,
        height: 85,
        borderRadius: 12,
    },

    removeImageButton: {
        position: "absolute",
        top: -7,
        right: -7,
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#D93650",
    },

    inputContainer: {
        flexDirection: "row",
        alignItems: "flex-end",
        paddingHorizontal: 13,
        paddingTop: 10,
        paddingBottom: 10,
        gap: 10,
    },

    imageButton: {
        width: 45,
        height: 45,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
    },

    input: {
        flex: 1,
        maxHeight: 110,
        minHeight: 45,
        backgroundColor: COLORS.card,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: COLORS.text,
        fontSize: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
    },

    sendButton: {
        width: 45,
        height: 45,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.primary,
    },

    disabledButton: {
        opacity: 0.5,
    },
    });
