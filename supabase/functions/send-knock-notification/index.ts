import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
      });
    }

    // Authenticate database webhook
    const webhookSecret = Deno.env.get("KNOCK_WEBHOOK_SECRET");

    if (
      !webhookSecret ||
      req.headers.get("x-knock-webhook-secret") !== webhookSecret
    ) {
      return new Response("Unauthorized", {
        status: 401,
      });
    }

    const payload = await req.json();

    const knockId = payload.record?.id;

    if (!knockId) {
      throw new Error("Knock ID missing.");
    }

    // Fetch Knock
    const { data: knock, error: knockError } = await supabase
      .from("knocks")
      .select("id, sender_id, alert, message, priority")
      .eq("id", knockId)
      .single();

    if (knockError) throw knockError;

    // Fetch sender
    const { data: sender, error: senderError } = await supabase
      .from("profiles")
      .select("full_name, username")
      .eq("id", knock.sender_id)
      .single();

    if (senderError) throw senderError;

    const senderName = sender?.full_name || sender?.username || "Someone";

    // Fetch recipients
    const { data: recipients, error: recipientError } = await supabase
      .from("knock_recipients")
      .select("recipient_id")
      .eq("knock_id", knockId);

    if (recipientError) throw recipientError;

    const recipientIds = [
      ...new Set((recipients ?? []).map((item) => item.recipient_id)),
    ];

    if (recipientIds.length === 0) {
      return Response.json({
        success: true,
        message: "No recipients found.",
      });
    }

    // Fetch device tokens
    const { data: devices, error: deviceError } = await supabase
      .from("user_push_tokens")
      .select("id, user_id, expo_push_token")
      .in("user_id", recipientIds);

    if (deviceError) throw deviceError;

    if (!devices?.length) {
      return Response.json({
        success: true,
        message: "No registered devices.",
      });
    }

    const urgent = knock.priority === "urgent";

    const notificationText =
      knock.alert || knock.message || "You received a Knock.";

    const messages = devices.map((device) => ({
      to: device.expo_push_token,
      sound: "default",
      title: urgent
        ? `🚨 Urgent Knock from ${senderName}`
        : `Knock from ${senderName}`,
      body: urgent ? `URGENT: ${notificationText}` : notificationText,
      priority: "high",
      channelId: "knock-notifications",
      ttl: 86400,
      data: {
        type: "knock",
        knockId: knock.id,
        priority: knock.priority,
      },
    }));

    // Expo accepts batches of up to 100 messages.
    const invalidTokenIds: string[] = [];

    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const batchDevices = devices.slice(i, i + 100);

      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        throw new Error(`Expo push service error: ${response.status}`);
      }

      const result = await response.json();

      for (let j = 0; j < (result.data ?? []).length; j++) {
        const ticket = result.data[j];

        if (
          ticket.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered"
        ) {
          invalidTokenIds.push(batchDevices[j].id);
        }
      }
    }

    // Remove invalid tokens
    if (invalidTokenIds.length > 0) {
      await supabase
        .from("user_push_tokens")
        .delete()
        .in("id", invalidTokenIds);
    }

    return Response.json({
      success: true,
      knockId,
      recipientCount: recipientIds.length,
      deviceCount: devices.length,
    });
  } catch (error) {
    console.error("Knock notification error:", error);

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Notification failed.",
      },
      { status: 500 },
    );
  }
});
