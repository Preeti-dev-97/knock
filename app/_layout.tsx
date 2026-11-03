import { Ionicons } from "@expo/vector-icons";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Session } from "@supabase/supabase-js";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
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

  const [fontsLoaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...Ionicons.font,
  });

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

    const inAuthScreen = segments[0] === "auth";

    if (!session && !inAuthScreen) {
      router.replace("/auth");
    } else if (session && inAuthScreen) {
      router.replace("/");
    }
  }, [session, authLoading, fontsLoaded, segments]);

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
