export const colors = {
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    500: '#3b82f6',
    600: '#1a56db',
    700: '#1d4ed8',
    900: '#1e3a8a',
  },
  danger: { 500: '#ef4444', 600: '#dc2626' },
  warning: { 500: '#f59e0b', 600: '#d97706' },
  success: { 500: '#22c55e', 600: '#16a34a' },
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
} as const;

export const statusColors: Record<string, string> = {
  open: colors.danger[600],
  landlord_notified: colors.warning[600],
  in_repair: colors.primary[600],
  resolved: colors.success[600],
  escalated: colors.danger[600],
};
