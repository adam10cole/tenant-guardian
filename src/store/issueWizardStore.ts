import { create } from 'zustand';
import type { IssueCategory } from '@/types/database';

export interface WizardPhoto {
  localId: string;
  uri: string;
  takenAt: string;
  latitude: number | null;
  longitude: number | null;
  hash: string;
}

interface IssueWizardState {
  category: IssueCategory | null;
  description: string;
  photos: WizardPhoto[];

  setCategory: (category: IssueCategory) => void;
  setDescription: (description: string) => void;
  addPhoto: (photo: WizardPhoto) => void;
  removePhoto: (localId: string) => void;
  reset: () => void;
}

export const useIssueWizardStore = create<IssueWizardState>((set) => ({
  category: null,
  description: '',
  photos: [],

  setCategory: (category) => set({ category }),
  setDescription: (description) => set({ description }),
  addPhoto: (photo) => set((s) => ({ photos: [...s.photos, photo] })),
  removePhoto: (localId) => set((s) => ({ photos: s.photos.filter((p) => p.localId !== localId) })),
  reset: () => set({ category: null, description: '', photos: [] }),
}));
