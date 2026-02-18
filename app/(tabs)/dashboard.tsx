import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Link } from 'expo-router';
import { useIssues } from '@/hooks/useIssues';
import { IssueCard } from '@/components/issue/IssueCard';
import type { LocalIssue } from '@/types/database';

export default function DashboardScreen() {
  const { issues, isLoading, refresh } = useIssues();

  return (
    <View className="flex-1 bg-gray-50">
      <FlatList
        data={issues}
        keyExtractor={(item: LocalIssue) => item.local_id ?? item.id}
        renderItem={({ item }) => <IssueCard issue={item} />}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor="#1a56db" />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center py-24 px-6">
              <Text className="text-5xl mb-4">🏠</Text>
              <Text className="text-xl font-bold text-gray-800 mb-2">No issues reported</Text>
              <Text className="text-gray-500 text-center mb-8">
                Document housing problems to build your legal record.
              </Text>
              <Link href="/issue/new" asChild>
                <TouchableOpacity className="bg-primary-600 rounded-lg px-8 py-4">
                  <Text className="text-white font-bold text-base">Report an Issue</Text>
                </TouchableOpacity>
              </Link>
            </View>
          ) : null
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 100, flexGrow: 1 }}
      />

      {/* FAB */}
      <Link href="/issue/new" asChild>
        <TouchableOpacity className="absolute bottom-6 right-6 bg-primary-600 w-14 h-14 rounded-full items-center justify-center shadow-lg">
          <Text className="text-white text-3xl font-light leading-none">+</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}
