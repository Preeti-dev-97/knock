import { Ionicons } from "@expo/vector-icons";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Session } from "@supabase/supabase-js";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { COLORS } from "../constants/theme";
import { registerPushNotifications } from "../lib/notifications";
import { supabase } from "../lib/supabase";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [pendingKnockId, setPendingKnockId] = useState<string | null>(null);

  const handledNotificationIds = useRef<Set<string>>(new Set());

  const [fontsLoaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...Ionicons.font,
  });

  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const notificationId = response.notification.request.identifier;

      if (handledNotificationIds.current.has(notificationId)) return;
      handledNotificationIds.current.add(notificationId);

      const data = response.notification.request.content.data;

      const knockId =
        data?.type === "knock" && typeof data?.knockId === "string"
          ? data.knockId
          : null;

      void Notifications.clearLastNotificationResponseAsync().catch(
        console.error,
      );

      if (knockId) setPendingKnockId(knockId);
    },
    [],
  );

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse,
    );

    // Also check whether the app was launched by tapping a notification.
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          handleNotificationResponse(response);
        }
      })
      .catch(console.error);

    return () => {
      subscription.remove();
    };
  }, [handleNotificationResponse]);

  useEffect(() => {
    if (!pendingKnockId || !fontsLoaded || authLoading) {
      return;
    }

    // Keep the notification pending until the user signs in.
    if (!session) {
      return;
    }

    router.push({
      pathname: "/(tabs)/history",
      params: {
        knockId: pendingKnockId,
      },
    });

    setPendingKnockId(null);
  }, [pendingKnockId, session, authLoading, fontsLoaded, router]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        console.error("Session loading error:", error.message);
      }

      setSession(data.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;

      setSession(newSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!fontsLoaded || authLoading) return;

    const currentRoute = segments[0];

    const inAuthScreen = currentRoute === "auth";
    const inResetPasswordScreen = currentRoute === "reset-password";

    // Allow password recovery even without an existing session.
    if (!session && !inAuthScreen && !inResetPasswordScreen) {
      router.replace("/auth");
      return;
    }

    // Only redirect the regular auth screen after login.
    // Never redirect away from the password reset screen.
    if (session && inAuthScreen) {
      router.replace("/");
    }
  }, [session, authLoading, fontsLoaded, segments, router]);

  useEffect(() => {
    if (fontsLoaded && !authLoading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, authLoading]);

  useEffect(() => {
    if (!session?.user?.id) return;

    registerPushNotifications(session.user.id);
  }, [session?.user?.id]);

  if (!fontsLoaded || authLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: COLORS.background,
          },
        }}
      >
        <Stack.Screen name="auth" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="modal"
          options={{
            presentation: "modal",
            headerShown: true,
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
