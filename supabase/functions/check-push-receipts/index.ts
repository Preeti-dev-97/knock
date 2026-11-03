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

const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Authenticate scheduled request.
    const cronSecret = Deno.env.get("KNOCK_RECEIPT_CRON_SECRET");

    if (
      !cronSecret ||
      req.headers.get("x-knock-receipt-secret") !== cronSecret
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    const now = Date.now();

    // Expo recommends checking receipts after approximately 15 minutes.
    const eligibleBefore = new Date(now - 15 * 60 * 1000).toISOString();

    const expiredBefore = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    // Expire receipts older than 24 hours.
    const { error: expiryError } = await supabase
      .from("push_receipts")
      .update({
        status: "expired",
        error: "Receipt expired before it could be retrieved.",
        checked_at: new Date().toISOString(),
      })
      .eq("status", "pending")
      .lt("created_at", expiredBefore);

    if (expiryError) throw expiryError;

    // Fetch eligible pending receipts.
    const { data: pending, error: fetchError } = await supabase
      .from("push_receipts")
      .select("ticket_id, user_id, expo_push_token")
      .eq("status", "pending")
      .lte("created_at", eligibleBefore)
      .order("created_at", { ascending: true })
      .limit(1000);

    if (fetchError) throw fetchError;

    if (!pending?.length) {
      return Response.json({
        success: true,
        message: "No pending receipts to check.",
      });
    }

    const ticketIds = pending.map((item) => item.ticket_id);

    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ids: ticketIds,
      }),
    });

    if (!response.ok) {
      throw new Error(`Expo receipt service error: ${response.status}`);
    }

    const result = await response.json();
    const receipts = result.data ?? {};

    let deliveredCount = 0;
    let failedCount = 0;
    let waitingCount = 0;
    let invalidTokenCount = 0;

    for (const item of pending) {
      const receipt = receipts[item.ticket_id];

      // Expo hasn't generated this receipt yet.
      // Leave it pending for the next scheduled run.
      if (!receipt) {
        waitingCount++;
        continue;
      }

      const checkedAt = new Date().toISOString();

      if (receipt.status === "ok") {
        const { error } = await supabase
          .from("push_receipts")
          .update({
            status: "delivered",
            error: null,
            checked_at: checkedAt,
          })
          .eq("ticket_id", item.ticket_id);

        if (error) {
          console.error("Receipt update failed:", error);
          continue;
        }

        deliveredCount++;
      } else {
        const expoError = receipt.details?.error || "UnknownError";

        const errorMessage = receipt.message || expoError;

        const { error } = await supabase
          .from("push_receipts")
          .update({
            status: "failed",
            error: errorMessage,
            checked_at: checkedAt,
          })
          .eq("ticket_id", item.ticket_id);

        if (error) {
          console.error("Failed receipt update:", error);
          continue;
        }

        failedCount++;

        console.error("Expo delivery receipt error:", {
          ticketId: item.ticket_id,
          userId: item.user_id,
          error: expoError,
          message: errorMessage,
        });

        // Remove permanently invalid device tokens.
        if (expoError === "DeviceNotRegistered") {
          const { error: deleteError } = await supabase
            .from("user_push_tokens")
            .delete()
            .eq("user_id", item.user_id)
            .eq("expo_push_token", item.expo_push_token);

          if (deleteError) {
            console.error("Invalid token cleanup failed:", deleteError);
          } else {
            invalidTokenCount++;
          }
        }
      }
    }

    return Response.json({
      success: true,
      checkedCount: pending.length,
      deliveredCount,
      failedCount,
      waitingCount,
      invalidTokenCount,
    });
  } catch (error) {
    console.error("Receipt checking error:", error);

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Receipt checking failed.",
      },
      { status: 500 },
    );
  }
});
