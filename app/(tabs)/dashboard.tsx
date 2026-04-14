import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Link } from 'expo-router';
import { useIssues } from '@/hooks/useIssues';
import { useDeleteIssue } from '@/hooks/useDeleteIssue';
import { useLandlordIssues } from '@/hooks/useLandlordIssues';
import { IssueCard } from '@/components/issue/IssueCard';
import { SwipeableRow } from '@/components/issue/SwipeableRow';
import { useRole } from '@/store/profileStore';
import type { LocalIssue, IssueWithTenant } from '@/types/database';

function TenantDashboard() {
  const { issues, isLoading, refresh } = useIssues();
  const deleteMutation = useDeleteIssue();

  function confirmDelete(issue: LocalIssue) {
    Alert.alert(
      'Delete Issue',
      'This will permanently delete this issue and all its photos, updates, and communications. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(issue),
        },
      ],
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <FlatList
        data={issues}
        keyExtractor={(item: LocalIssue) => item.local_id ?? item.id}
        renderItem={({ item }) => (
          <SwipeableRow onDelete={() => confirmDelete(item)}>
            <IssueCard issue={item} />
          </SwipeableRow>
        )}
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
      <Link href="/issue/new" asChild>
        <TouchableOpacity className="absolute bottom-6 right-6 bg-primary-600 w-14 h-14 rounded-full items-center justify-center shadow-lg">
          <Text className="text-white text-3xl font-light leading-none">+</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

function LandlordDashboard() {
  const { data: issues = [], isLoading, refetch, error } = useLandlordIssues();

  return (
    <View className="flex-1 bg-gray-50">
      {error && (
        <View className="mx-4 mt-4 p-3 bg-danger-50 border border-danger-200 rounded-xl">
          <Text className="text-danger-700 text-xs">
            {(error as Error)?.message ?? 'Failed to load issues'}
          </Text>
        </View>
      )}
      <FlatList
        data={issues}
        keyExtractor={(item: IssueWithTenant) => item.id}
        renderItem={({ item }) => (
          <IssueCard
            issue={{ ...item, sync_status: 'synced' }}
            tenantName={item.tenant_display_name}
            linkId={item.id}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#1a56db" />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center py-24 px-6">
              <Text className="text-5xl mb-4">🏘️</Text>
              <Text className="text-xl font-bold text-gray-800 mb-2">No tenant issues yet</Text>
              <Text className="text-gray-500 text-center">
                Issues reported by your linked tenants will appear here.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }}
      />
    </View>
  );
}

export default function DashboardScreen() {
  const role = useRole();

  if (role === null) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1a56db" />
      </View>
    );
  }

  return role === 'landlord' ? <LandlordDashboard /> : <TenantDashboard />;
}
