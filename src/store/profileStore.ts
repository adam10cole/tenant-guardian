import { create } from 'zustand';
import type { Profile, UserRole } from '@/types/database';

interface ProfileState {
  profile: Profile | null;
  isLoading: boolean;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  isLoading: true,
  setProfile: (profile) => set({ profile, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}));

/** Convenience selector — returns the current user's role or null while loading */
export function useRole(): UserRole | null {
  return useProfileStore((s) => s.profile?.role ?? null);
}
