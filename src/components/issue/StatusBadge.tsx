import { View, Text } from 'react-native';
import type { IssueStatus } from '@/types/database';

const STATUS_CONFIG: Record<IssueStatus, { label: string; bg: string; text: string }> = {
  open: { label: 'Open', bg: 'bg-danger-500/10', text: 'text-danger-600' },
  landlord_notified: { label: 'Notified', bg: 'bg-warning-500/10', text: 'text-warning-600' },
  in_repair: { label: 'In Repair', bg: 'bg-primary-100', text: 'text-primary-700' },
  resolved: { label: 'Resolved', bg: 'bg-success-500/10', text: 'text-success-600' },
  escalated: { label: 'Escalated', bg: 'bg-danger-500/10', text: 'text-danger-600' },
};

interface StatusBadgeProps {
  status: IssueStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  return (
    <View className={`px-2 py-1 rounded-full ${config.bg}`}>
      <Text className={`text-xs font-semibold ${config.text}`}>{config.label}</Text>
    </View>
  );
}
