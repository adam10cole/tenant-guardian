import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getDb } from '@/lib/database/client';
import { supabase } from '@/lib/supabase';
import { StatusBadge } from '@/components/issue/StatusBadge';
import { daysUntilDeadline } from '@/lib/deadlines';
import type { LocalIssue } from '@/types/database';

async function fetchIssue(localId: string): Promise<LocalIssue | null> {
  const db = await getDb();
  return db.getFirstAsync<LocalIssue>('SELECT * FROM issues WHERE local_id = ? OR id = ?', [
    localId,
    localId,
  ]);
}

export default function IssueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: issue, isLoading } = useQuery({
    queryKey: ['issue', id],
    queryFn: () => fetchIssue(id),
    enabled: !!id,
  });

  async function handleGeneratePdf() {
    if (!issue?.id) {
      Alert.alert('Sync required', 'Please wait for this issue to sync before generating a PDF.');
      return;
    }

    Alert.alert('Generating PDF', 'Building your evidence report...');

    try {
      const { data, error } = await supabase.functions.invoke('generate-pdf', {
        body: { issueId: issue.id },
      });

      if (error) throw error;

      Alert.alert('PDF Ready', 'Your evidence report has been generated.', [
        { text: 'OK' },
        {
          text: 'Open',
          onPress: () => {
            /* handled by the app's URL handler */
          },
        },
      ]);
      console.log('PDF URL:', data.signedUrl);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not generate PDF');
    }
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1a56db" />
      </View>
    );
  }

  if (!issue) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-gray-600 text-base">Issue not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-primary-600">Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const daysLeft = daysUntilDeadline(issue.legal_deadline_at);

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="bg-white mx-4 mt-4 rounded-xl p-4 shadow-sm">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xl font-bold text-gray-900 capitalize">{issue.category}</Text>
          <StatusBadge status={issue.status} />
        </View>

        {issue.description && <Text className="text-gray-600 mt-2">{issue.description}</Text>}

        <View className="mt-4 pt-4 border-t border-gray-100">
          <Text className="text-xs text-gray-400">First reported</Text>
          <Text className="text-sm text-gray-700">
            {new Date(issue.first_reported_at).toLocaleDateString()}
          </Text>
        </View>

        {issue.landlord_notified_at && (
          <View className="mt-3">
            <Text className="text-xs text-gray-400">Landlord notified</Text>
            <Text className="text-sm text-gray-700">
              {new Date(issue.landlord_notified_at).toLocaleDateString()}
            </Text>
          </View>
        )}

        {daysLeft !== null && (
          <View
            className={`mt-3 p-3 rounded-lg ${daysLeft < 0 ? 'bg-danger-500/10' : daysLeft <= 3 ? 'bg-warning-500/10' : 'bg-success-500/10'}`}
          >
            <Text
              className={`text-sm font-semibold ${daysLeft < 0 ? 'text-danger-600' : daysLeft <= 3 ? 'text-warning-600' : 'text-success-600'}`}
            >
              {daysLeft < 0
                ? `Legal deadline passed ${Math.abs(daysLeft)} days ago`
                : daysLeft === 0
                  ? 'Legal deadline is today'
                  : `${daysLeft} days until legal deadline`}
            </Text>
          </View>
        )}
      </View>

      <View className="mx-4 mt-4">
        <TouchableOpacity
          className="bg-primary-600 rounded-xl py-4 items-center"
          onPress={handleGeneratePdf}
        >
          <Text className="text-white font-bold text-base">Generate Evidence PDF</Text>
        </TouchableOpacity>
      </View>

      {issue.sync_status !== 'synced' && (
        <View className="mx-4 mt-3 p-3 bg-warning-500/10 rounded-xl">
          <Text className="text-warning-600 text-xs text-center">
            Pending sync — connect to internet to upload
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
