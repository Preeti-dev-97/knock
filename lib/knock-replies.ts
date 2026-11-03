import * as ImagePicker from "expo-image-picker";
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

  // Generate secure URLs for image replies.
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

export async function pickReplyImage() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error("Please allow photo library access to select an image.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    quality: 0.8,
  });

  if (result.canceled || !result.assets.length) {
    return null;
  }

  return result.assets[0];
}

export async function sendImageReply({
  knockId,
  recipientRowId,
  imageUri,
}: {
  knockId: string;
  recipientRowId: string;
  imageUri: string;
}) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;

  if (!user) throw new Error("Please sign in again.");

  const replyId = crypto.randomUUID();

  const extension = "jpg";

  const mediaPath = `${knockId}/${user.id}/${replyId}.${extension}`;

  const response = await fetch(imageUri);
  const imageBlob = await response.blob();

  const contentType = imageBlob.type || "image/jpeg";

  console.log("Storage path:", mediaPath);
  console.log("Knock ID:", knockId);
  console.log("User ID:", user.id);
  console.log("Recipient row ID:", recipientRowId);

  const { error: uploadError } = await supabase.storage
    .from("knock-replies")
    .upload(mediaPath, imageBlob, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (uploadError) throw uploadError;

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

  if (error) {
    // Remove uploaded media if the database insert fails.
    await supabase.storage.from("knock-replies").remove([mediaPath]);
    throw error;
  }

  return data as KnockReply;
}

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
