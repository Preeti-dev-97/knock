import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useKnockAlert } from "../components/KnockAlert";
import { COLORS } from "../constants/theme";
import {
  getKnockReplies,
  KnockReply,
  markKnockRepliesAsRead,
  pickReplyImage,
  sendImageReply,
  sendTextReply,
} from "../lib/knock-replies";
import { supabase } from "../lib/supabase";

export default function KnockRepliesScreen() {
  const router = useRouter();
  const { showAlert, alertNode } = useKnockAlert();

  const { knockId, recipientRowId, personName, canReply } =
    useLocalSearchParams<{
      knockId: string;
      recipientRowId: string;
      personName: string;
      canReply: string;
    }>();
    
  const cameraRef = useRef<CameraView>(null);

  const [cameraFacing, setCameraFacing] = useState<"back" | "front">("back");

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [replies, setReplies] = useState<KnockReply[]>([]);
  const [message, setMessage] = useState("");

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageMimeType, setSelectedImageMimeType] = useState<
    string | null
  >(null);

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [cameraVisible, setCameraVisible] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [takingPhoto, setTakingPhoto] = useState(false);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");

  const QUICK_REPLIES = [
    { label: "👍 Got it", message: "Got it" },
    { label: "🚶 On my way", message: "On my way" },
    { label: "📞 I'll call you", message: "I'll call you" },
    { label: "⏳ Give me a minute", message: "Give me a minute" },
    { label: "❤️ Thank you", message: "Thank you" },
    { label: "❌ Can't right now", message: "Can't right now" },
  ];

  // --------------------------------------------------
  // LOAD REPLIES
  // --------------------------------------------------

  const loadReplies = useCallback(async () => {
    if (!knockId || !recipientRowId) return;

    try {
      const data = await getKnockReplies(knockId);
      setReplies(data);

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

  // --------------------------------------------------
  // REALTIME REPLIES
  // --------------------------------------------------

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

  // --------------------------------------------------
  // GALLERY IMAGE PICKER
  // --------------------------------------------------

  const handlePickImage = async () => {
    if (pickingImage || sending) return;

    setPickingImage(true);

    try {
      const asset = await pickReplyImage();

      if (asset) {
        setSelectedImage(asset.uri);
        setSelectedImageMimeType(asset.mimeType ?? null);
      }
    } catch (error) {
      console.error("Image selection failed:", error);

      showAlert({
        title: "Couldn't select image",
        message: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
        buttonLabel: "Got it",
      });
    } finally {
      setPickingImage(false);
    }
  };

  // --------------------------------------------------
  // OPEN LIVE CAMERA
  // --------------------------------------------------

  const handleOpenCamera = async () => {
    if (sending || pickingImage || takingPhoto) return;

    try {
      let permission = cameraPermission;

      if (!permission?.granted) {
        permission = await requestCameraPermission();
      }

      if (!permission.granted) {
        showAlert({
          title: "Camera permission required",
          message:
            "Please allow camera access in your phone settings to take and send photos.",
          variant: "warning",
          buttonLabel: "Got it",
        });

        return;
      }

      setCameraReady(false);
      setCameraVisible(true);
    } catch (error) {
      console.error("Camera permission error:", error);

      showAlert({
        title: "Camera unavailable",
        message: "Couldn't open the camera. Please try again.",
        variant: "error",
        buttonLabel: "Got it",
      });
    }
  };

  // --------------------------------------------------
  // CAPTURE REAL-TIME PHOTO
  // --------------------------------------------------

  const handleTakePhoto = async () => {
    if (!cameraRef.current || !cameraReady || takingPhoto) return;

    setTakingPhoto(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        throw new Error("Couldn't capture the photo. Please try again.");
      }

      setSelectedImage(photo.uri);
      setSelectedImageMimeType("image/jpeg");

      setCameraVisible(false);
    } catch (error) {
      console.error("Camera capture failed:", error);

      showAlert({
        title: "Couldn't take photo",
        message: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
        buttonLabel: "Got it",
      });
    } finally {
      setTakingPhoto(false);
    }
  };

  // --------------------------------------------------
  // RETAKE PHOTO
  // --------------------------------------------------

  const handleRetakePhoto = () => {
    if (sending) return;

    setSelectedImage(null);
    setSelectedImageMimeType(null);

    void handleOpenCamera();
  };

  // --------------------------------------------------
  // QUICK REPLIES
  // --------------------------------------------------

  const handleQuickReply = async (reply: string) => {
    if (sending) return;

    setSending(true);

    try {
      await sendTextReply({
        knockId,
        recipientRowId,
        message: reply,
      });

      await loadReplies();
    } catch (error) {
      console.error("Failed to send quick reply:", error);

      showAlert({
        title: "Couldn't send reply",
        message: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
        buttonLabel: "Got it",
      });
    } finally {
      setSending(false);
    }
  };

  // --------------------------------------------------
  // SEND REPLY
  // --------------------------------------------------

  const handleSend = async () => {
    if ((!message.trim() && !selectedImage) || sending) return;

    setSending(true);

    try {
      if (selectedImage) {
        await sendImageReply({
          knockId,
          recipientRowId,
          imageUri: selectedImage,
          mimeType: selectedImageMimeType,
        });

        setSelectedImage(null);
        setSelectedImageMimeType(null);
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

      showAlert({
        title: "Couldn't send reply",
        message: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
        buttonLabel: "Got it",
      });
    } finally {
      setSending(false);
    }
  };

  // --------------------------------------------------
  // SCREEN
  // --------------------------------------------------

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* HEADER */}

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

        {/* MESSAGES */}

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
                          <Pressable
                            onPress={() => setPreviewImage(reply.media_url!)}
                          >
                            <Image
                              source={{ uri: reply.media_url }}
                              style={styles.replyImage}
                              resizeMode="cover"
                            />
                          </Pressable>
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

        {/* REPLY INPUT */}

        {canReply === "true" && (
          <View style={styles.inputWrapper}>
            {/* QUICK REPLIES */}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRepliesContainer}
              keyboardShouldPersistTaps="handled"
            >
              {QUICK_REPLIES.map((reply) => (
                <Pressable
                  key={reply.message}
                  style={[
                    styles.quickReplyChip,
                    sending && styles.quickReplyDisabled,
                  ]}
                  disabled={sending}
                  onPress={() => void handleQuickReply(reply.message)}
                >
                  <Text style={styles.quickReplyText}>{reply.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* SELECTED IMAGE PREVIEW */}

            {selectedImage && (
              <View style={styles.previewContainer}>
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />

                <Pressable
                  style={styles.removeImageButton}
                  onPress={() => {
                    setSelectedImage(null);
                    setSelectedImageMimeType(null);
                  }}
                  disabled={sending}
                >
                  <Ionicons name="close" size={17} color="#FFFFFF" />
                </Pressable>

                <Pressable
                  style={styles.retakeButton}
                  onPress={handleRetakePhoto}
                  disabled={sending}
                >
                  <Ionicons
                    name="camera-reverse-outline"
                    size={14}
                    color="#FFFFFF"
                  />
                  <Text style={styles.retakeText}>Retake</Text>
                </Pressable>
              </View>
            )}

            {/* INPUT AND ATTACHMENT BUTTONS */}

            <View style={styles.inputContainer}>
              {/* GALLERY */}

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

              {/* CAMERA */}

              <Pressable
                onPress={() => void handleOpenCamera()}
                disabled={sending || pickingImage || takingPhoto}
                style={styles.imageButton}
              >
                <Ionicons
                  name="camera-outline"
                  size={23}
                  color={COLORS.primary}
                />
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

              {/* SEND */}

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

      {/* LIVE CAMERA MODAL */}

      <Modal
        visible={cameraVisible}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setCameraVisible(false)}
      >
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={cameraFacing}
            mode="picture"
            onCameraReady={() => setCameraReady(true)}
          />

          {/* CAMERA HEADER */}

          <View style={styles.cameraHeader}>
            <Pressable
              style={styles.cameraCloseButton}
              onPress={() => setCameraVisible(false)}
              disabled={takingPhoto}
            >
              <Ionicons name="close" size={27} color="#FFFFFF" />
            </Pressable>

            <Text style={styles.cameraTitle}>Take a photo</Text>

            <Pressable
              style={styles.cameraFlipButton}
              onPress={() => {
                setCameraReady(false);

                setCameraFacing((current) =>
                  current === "back" ? "front" : "back",
                );
              }}
            >
              <Ionicons
                name="camera-reverse-outline"
                size={25}
                color="#FFFFFF"
              />
            </Pressable>
          </View>

          {/* CAMERA CONTROLS */}

          <View style={styles.cameraControls}>
            <Text style={styles.cameraHint}>
              Capture a moment to send with your Knock
            </Text>

            <Pressable
              style={[
                styles.captureButton,
                (!cameraReady || takingPhoto) && styles.captureDisabled,
              ]}
              onPress={() => void handleTakePhoto()}
              disabled={!cameraReady || takingPhoto}
            >
              {takingPhoto ? (
                <ActivityIndicator size="large" color={COLORS.primary} />
              ) : (
                <View style={styles.captureInner} />
              )}
            </Pressable>

            {!cameraReady && (
              <ActivityIndicator color="#FFFFFF" style={styles.cameraLoading} />
            )}
          </View>
        </View>
      </Modal>

      {/* FULL-SCREEN IMAGE VIEWER */}

      <Modal
        visible={!!previewImage}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPreviewImage(null)}
      >
        <View style={styles.imagePreviewOverlay}>
          <Pressable
            style={styles.previewCloseButton}
            onPress={() => setPreviewImage(null)}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>

          {previewImage && (
            <Image
              source={{ uri: previewImage }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* REUSABLE KNOCK ALERT */}

      {alertNode}
    </SafeAreaView>
  );
}

// --------------------------------------------------
// STYLES
// --------------------------------------------------

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
    paddingBottom: 26,
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

  retakeButton: {
    position: "absolute",
    bottom: 0,
    left: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },

  retakeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
  },

  imageButton: {
    width: 43,
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

  quickRepliesContainer: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },

  quickReplyChip: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },

  quickReplyText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
  },

  quickReplyDisabled: {
    opacity: 0.45,
  },

  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },

  previewCloseButton: {
    position: "absolute",
    top: 55,
    right: 22,
    zIndex: 10,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF25",
    alignItems: "center",
    justifyContent: "center",
  },

  fullScreenImage: {
    width: "100%",
    height: "85%",
  },

  // LIVE CAMERA

  cameraContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },

  camera: {
    flex: 1,
  },

  cameraHeader: {
    position: "absolute",
    top: 55,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  cameraCloseButton: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "#00000070",
    alignItems: "center",
    justifyContent: "center",
  },

  cameraTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },

  cameraHeaderSpacer: {
    width: 43,
  },

  cameraControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingTop: 25,
    paddingBottom: 45,
    backgroundColor: "#00000045",
  },

  cameraHint: {
    color: "#FFFFFF",
    fontSize: 12,
    marginBottom: 23,
  },

  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF35",
  },

  captureInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#FFFFFF",
  },

  captureDisabled: {
    opacity: 0.5,
  },

  cameraLoading: {
    position: "absolute",
    bottom: 15,
  },
  cameraFlipButton: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "#00000070",
    alignItems: "center",
    justifyContent: "center",
  },
});
