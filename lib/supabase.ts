import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase environment variables are missing.");
}

const memoryStorage = new Map<string, string>();

const safeWebStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === "undefined") {
      return memoryStorage.get(key) ?? null;
    }

    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryStorage.get(key) ?? null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    memoryStorage.set(key, value);

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Browser storage unavailable.
      }
    }
  },

  removeItem: async (key: string): Promise<void> => {
    memoryStorage.delete(key);

    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Browser storage unavailable.
      }
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: Platform.OS === "web" ? safeWebStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
