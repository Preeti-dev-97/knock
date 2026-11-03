import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function configureNotificationChannel() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("knock-notifications", {
    name: "Knock Notifications",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: "default",
  });
}

export async function registerPushNotifications(userId: string) {
  try {
    if (Platform.OS === "web" || !Device.isDevice) {
      return null;
    }

    await configureNotificationChannel();

    const existingPermission = await Notifications.getPermissionsAsync();

    let status = existingPermission.status;

    if (status !== "granted") {
      const permission = await Notifications.requestPermissionsAsync();

      status = permission.status;
    }

    if (status !== "granted") {
      console.log("Push permission denied.");
      return null;
    }

    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      throw new Error("EAS project ID missing.");
    }

    const response = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const expoPushToken = response.data;

    const { error } = await supabase.from("user_push_tokens").upsert(
      {
        user_id: userId,
        expo_push_token: expoPushToken,
        platform: Platform.OS,
        device_name: Device.deviceName ?? "Unknown device",
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,expo_push_token",
      },
    );

    if (error) throw error;

    console.log("Push token registered:", expoPushToken);

    return expoPushToken;
  } catch (error) {
    console.error("Notification registration failed:", error);
    return null;
  }
}

export async function removePushToken() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) return;

    const response = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const { error } = await supabase
      .from("user_push_tokens")
      .delete()
      .eq("user_id", user.id)
      .eq("expo_push_token", response.data);

    if (error) throw error;
  } catch (error) {
    console.error("Push token cleanup failed:", error);
  }
}
