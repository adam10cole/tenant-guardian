import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>((set) => {
  // Initialize from Supabase on app start
  supabase.auth.getSession().then(({ data }) => {
    set({ session: data.session, isLoading: false });
  });

  // Subscribe to auth state changes
  supabase.auth.onAuthStateChange((_event, session) => {
    set({ session, isLoading: false });
  });

  return {
    session: null,
    isLoading: true,
    setSession: (session) => set({ session }),
  };
});
