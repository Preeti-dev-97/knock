import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "../../constants/theme";

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.muted,

        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          height: 68 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
        },

        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="home"
              size={size}
              color={focused ? COLORS.accent : COLORS.muted}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="contacts"
        options={{
          title: "Contacts",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="people"
              size={size}
              color={focused ? COLORS.accent : COLORS.muted}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="notifications"
              size={size}
              color={focused ? COLORS.accent : COLORS.muted}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="person"
              size={size}
              color={focused ? COLORS.accent : COLORS.muted}
            />
          ),
        }}
      />

      <Tabs.Screen name="two" options={{ href: null }} />
    </Tabs>
  );
}
