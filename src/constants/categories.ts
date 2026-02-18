import type { IssueCategory } from '@/types/database';

export interface CategoryMeta {
  value: IssueCategory;
  label: string;
  icon: string;
  description: string;
}

export const ISSUE_CATEGORIES: CategoryMeta[] = [
  {
    value: 'water',
    label: 'Water / Plumbing',
    icon: '💧',
    description: 'Leaks, no hot water, burst pipes',
  },
  {
    value: 'heat',
    label: 'Heat / Cooling',
    icon: '🌡️',
    description: 'No heat, broken furnace, AC failure',
  },
  {
    value: 'pests',
    label: 'Pests',
    icon: '🪲',
    description: 'Rodents, cockroaches, bed bugs',
  },
  {
    value: 'mold',
    label: 'Mold',
    icon: '🍄',
    description: 'Visible mold or mildew growth',
  },
  {
    value: 'structural',
    label: 'Structural',
    icon: '🏗️',
    description: 'Cracks, ceiling damage, foundation',
  },
  {
    value: 'electrical',
    label: 'Electrical',
    icon: '⚡',
    description: 'Faulty wiring, broken outlets',
  },
  {
    value: 'security',
    label: 'Security',
    icon: '🔒',
    description: 'Broken locks, doors, windows',
  },
  {
    value: 'sanitation',
    label: 'Sanitation',
    icon: '🚮',
    description: 'Sewage backup, trash, cleanliness',
  },
  {
    value: 'other',
    label: 'Other',
    icon: '📋',
    description: 'Any other habitability concern',
  },
];
