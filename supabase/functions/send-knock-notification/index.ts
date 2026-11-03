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

    const invalidTokenIds: string[] = [];
    const receiptRecords: {
      ticket_id: string;
      user_id: string;
      expo_push_token: string;
    }[] = [];

    let successfulTicketCount = 0;
    let failedTicketCount = 0;

    // Expo accepts batches of up to 100 messages.
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
      const tickets = Array.isArray(result.data) ? result.data : [];

      for (let j = 0; j < tickets.length; j++) {
        const ticket = tickets[j];
        const device = batchDevices[j];

        if (!device) continue;

        if (ticket.status === "ok" && ticket.id) {
          successfulTicketCount++;

          // Save ticket for later receipt verification.
          receiptRecords.push({
            ticket_id: ticket.id,
            user_id: device.user_id,
            expo_push_token: device.expo_push_token,
          });
        } else {
          failedTicketCount++;

          const expoError = ticket.details?.error || "UnknownError";

          console.error("Expo push ticket error:", {
            userId: device.user_id,
            error: expoError,
            message: ticket.message,
          });

          if (expoError === "DeviceNotRegistered") {
            invalidTokenIds.push(device.id);
          }
        }
      }
    }

    // Remove tokens rejected immediately by Expo.
    if (invalidTokenIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("user_push_tokens")
        .delete()
        .in("id", invalidTokenIds);

      if (deleteError) {
        console.error("Invalid token cleanup failed:", deleteError);
      }
    }

    // Persist successful tickets for scheduled receipt checking.
    let receiptTrackingSaved = true;

    if (receiptRecords.length > 0) {
      const { error: receiptError } = await supabase
        .from("push_receipts")
        .insert(receiptRecords);

      if (receiptError) {
        receiptTrackingSaved = false;

        console.error(
          "Push receipt tracking could not be saved:",
          receiptError,
        );
      }
    }

    return Response.json({
      success: true,
      knockId,
      recipientCount: recipientIds.length,
      deviceCount: devices.length,
      successfulTicketCount,
      failedTicketCount,
      receiptTrackingSaved,
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
