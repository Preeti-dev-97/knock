import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export type KnockReply = {
  id: string;
  knock_id: string;
  recipient_row_id: string;
  sender_id: string;
  reply_type: "text" | "image" | "audio";
  message: string | null;
  media_path: string | null;
  created_at: string;
  sender_name?: string;
  media_url?: string | null;
};

// --------------------------------------------------
// GET KNOCK REPLIES
// --------------------------------------------------

export async function getKnockReplies(knockId: string) {
  const { data, error } = await supabase
    .from("knock_replies")
    .select("*")
    .eq("knock_id", knockId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const replies = (data ?? []) as KnockReply[];

  const senderIds = [...new Set(replies.map((reply) => reply.sender_id))];

  if (senderIds.length === 0) return replies;

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, username")
    .in("id", senderIds);

  if (profileError) throw profileError;

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      profile.full_name?.trim() || profile.username || "User",
    ]),
  );

  const repliesWithNames = replies.map((reply) => ({
    ...reply,
    sender_name: profileMap.get(reply.sender_id) || "User",
  }));

  // Generate signed URLs for private image storage.
  return Promise.all(
    repliesWithNames.map(async (reply) => {
      if (reply.reply_type !== "image" || !reply.media_path) {
        return reply;
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from("knock-replies")
        .createSignedUrl(reply.media_path, 3600);

      if (signedError) {
        console.error("Failed to generate image URL:", signedError);
        return { ...reply, media_url: null };
      }

      return {
        ...reply,
        media_url: signedData.signedUrl,
      };
    }),
  );
}

// --------------------------------------------------
// SEND TEXT REPLY
// --------------------------------------------------

export async function sendTextReply({
  knockId,
  recipientRowId,
  message,
}: {
  knockId: string;
  recipientRowId: string;
  message: string;
}) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  if (!user) throw new Error("Please sign in again.");

  const cleanMessage = message.trim();

  if (!cleanMessage) {
    throw new Error("Please enter a message.");
  }

  const { data, error } = await supabase
    .from("knock_replies")
    .insert({
      knock_id: knockId,
      recipient_row_id: recipientRowId,
      sender_id: user.id,
      reply_type: "text",
      message: cleanMessage,
    })
    .select()
    .single();

  if (error) throw error;

  return data as KnockReply;
}

// --------------------------------------------------
// PICK REPLY IMAGE
// --------------------------------------------------

export async function pickReplyImage() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error("Please allow photo library access to select an image.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 0.8,
  });

  if (result.canceled || !result.assets.length) {
    return null;
  }

  return result.assets[0];
}

// --------------------------------------------------
// SEND IMAGE REPLY
// --------------------------------------------------

export async function sendImageReply({
  knockId,
  recipientRowId,
  imageUri,
  mimeType,
}: {
  knockId: string;
  recipientRowId: string;
  imageUri: string;
  mimeType?: string | null;
}) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  if (!user) throw new Error("Please sign in again.");

  const replyId = Crypto.randomUUID();

  // Read the selected image using Expo FileSystem.
  // Read image differently on web and native platforms.
  let arrayBuffer: ArrayBuffer;
  let detectedMimeType: string | null = mimeType ?? null;

  if (Platform.OS === "web") {
    // Browser image reading.
    const response = await fetch(imageUri);

    if (!response.ok) {
      throw new Error("Couldn't access the selected image.");
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error("The selected image is empty.");
    }

    arrayBuffer = await blob.arrayBuffer();
    detectedMimeType = detectedMimeType || blob.type || null;
  } else {
    // Android and iOS image reading.
    const { File } = await import("expo-file-system");

    const imageFile = new File(imageUri);

    if (!imageFile.exists) {
      throw new Error(
        "The selected image could not be accessed. Please select another image.",
      );
    }

    if (imageFile.size === 0) {
      throw new Error("The selected image is empty.");
    }

    arrayBuffer = await imageFile.arrayBuffer();

    detectedMimeType = detectedMimeType || imageFile.type || null;
  }

  if (!arrayBuffer.byteLength) {
    throw new Error("Couldn't read the selected image. Please try another.");
  }

  // Determine image extension.
  const uriExtension = imageUri.split("?")[0].split(".").pop()?.toLowerCase();

  const extensionMimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    gif: "image/gif",
  };

  // Determine actual content type.
  const contentType =
    detectedMimeType || extensionMimeTypes[uriExtension || ""] || "image/jpeg";

  const extensionMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/gif": "gif",
  };

  const extension = extensionMap[contentType] || "jpg";

  const mediaPath = `${knockId}/${user.id}/${replyId}.${extension}`;

  console.log("Uploading Knock image:", {
    mediaPath,
    contentType,
    size: arrayBuffer.byteLength,
  });

  // Upload image to private Supabase Storage.
  const { error: uploadError } = await supabase.storage
    .from("knock-replies")
    .upload(mediaPath, arrayBuffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  // Save image reply in database.
  const { data, error } = await supabase
    .from("knock_replies")
    .insert({
      id: replyId,
      knock_id: knockId,
      recipient_row_id: recipientRowId,
      sender_id: user.id,
      reply_type: "image",
      media_path: mediaPath,
    })
    .select()
    .single();

  // Remove uploaded image if database insertion fails.
  if (error) {
    const { error: cleanupError } = await supabase.storage
      .from("knock-replies")
      .remove([mediaPath]);

    if (cleanupError) {
      console.error("Failed to clean up uploaded image:", cleanupError);
    }

    throw error;
  }

  return data as KnockReply;
}

// --------------------------------------------------
// MARK REPLIES AS READ
// --------------------------------------------------

export async function markKnockRepliesAsRead(recipientRowId: string) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  if (!user) throw new Error("Please sign in again.");

  const { error } = await supabase.from("knock_reply_reads").upsert(
    {
      user_id: user.id,
      recipient_row_id: recipientRowId,
      last_read_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id,recipient_row_id",
    },
  );

  if (error) throw error;
}

export async function sendKnockBack(
  originalSenderId: string,
  message?: string,
) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;

  if (!user) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!originalSenderId || originalSenderId === user.id) {
    throw new Error("Invalid Knock recipient.");
  }

  const trimmedMessage = message?.trim() ?? "";

  if (trimmedMessage.length > 160) {
    throw new Error("Your message cannot exceed 160 characters.");
  }

  const { data, error } = await supabase.rpc("send_knock", {
    target_user_ids: [originalSenderId],
    alert_text: "Knock Back",
    custom_message: trimmedMessage || null,
    knock_priority: "normal",
  });

  if (error) throw error;

  if (!data) {
    throw new Error("Your Knock Back could not be confirmed.");
  }

  return data;
}
