import { View, Text, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
import { StatusBadge } from './StatusBadge';
import { daysUntilDeadline } from '@/lib/deadlines';
import type { LocalIssue } from '@/types/database';

interface IssueCardProps {
  issue: LocalIssue;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function IssueCard({ issue }: IssueCardProps) {
  const daysLeft = daysUntilDeadline(issue.legal_deadline_at);
  const isPending = issue.sync_status !== 'synced';

  const deadlineColor =
    daysLeft === null
      ? undefined
      : daysLeft < 0
        ? 'text-danger-600'
        : daysLeft <= 3
          ? 'text-warning-600'
          : 'text-gray-500';

  const deadlineText =
    daysLeft === null
      ? null
      : daysLeft < 0
        ? `Deadline passed ${Math.abs(daysLeft)}d ago`
        : daysLeft === 0
          ? 'Deadline today'
          : `${daysLeft}d until deadline`;

  return (
    <Link href={`/issue/${issue.local_id ?? issue.id}`} asChild>
      <TouchableOpacity className="bg-white rounded-xl p-4 mb-3 shadow-sm active:opacity-80">
        <View className="flex-row items-start justify-between mb-2">
          <Text className="text-base font-semibold text-gray-900 capitalize flex-1 mr-2">
            {issue.category.replace('_', ' ')}
          </Text>
          <StatusBadge status={issue.status} />
        </View>

        {issue.description && (
          <Text className="text-sm text-gray-600 mb-2" numberOfLines={2}>
            {issue.description}
          </Text>
        )}

        <View className="flex-row items-center justify-between mt-1">
          <Text className="text-xs text-gray-400">
            Reported {formatDate(issue.first_reported_at)}
          </Text>

          {deadlineText && (
            <Text className={`text-xs font-semibold ${deadlineColor}`}>{deadlineText}</Text>
          )}
        </View>

        {isPending && (
          <View className="mt-2 flex-row items-center">
            <View className="w-2 h-2 rounded-full bg-warning-500 mr-1" />
            <Text className="text-xs text-warning-600">Pending sync</Text>
          </View>
        )}
      </TouchableOpacity>
    </Link>
  );
}
