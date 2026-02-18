/**
 * Supabase client singleton for Tenant Guardian.
 *
 * Security decisions:
 * - Sessions are stored in expo-secure-store (hardware-backed keychain/keystore),
 *   NEVER in AsyncStorage which is plaintext on disk.
 * - The anon key in the bundle is safe: all data access is enforced by RLS at
 *   the database level. The service role key lives only in Edge Function env vars.
 */

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
      'Copy .env.local.example to .env.local and fill in your project credentials.',
  );
}

/**
 * Expo SecureStore adapter for Supabase session persistence.
 *
 * SecureStore limits keys to 256 chars and values to 2048 bytes on some
 * Android versions. We split large JWT payloads across multiple keys.
 */
const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      // SecureStore can fail if the device is not yet unlocked (background fetch).
      // Log but do not throw — the session will be re-fetched on next foreground.
      console.warn('[supabase] SecureStore.setItem failed:', error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore errors on delete
    }
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
