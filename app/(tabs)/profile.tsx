import { View, Text, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useProfileStore } from '@/store/profileStore';
import { getPendingCount, clearLocalData } from '@/lib/sync/queue';
import { useCallback, useState } from 'react';

export default function ProfileScreen() {
  const { session, setSession } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useProfileStore((s) => s.profile);
  const [pendingCount, setPendingCount] = useState(0);

  // Refresh pending count every time this tab comes into focus
  useFocusEffect(
    useCallback(() => {
      getPendingCount()
        .then(setPendingCount)
        .catch(() => {});
    }, []),
  );

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await clearLocalData().catch(() => {});
          queryClient.clear();
          useProfileStore.getState().setProfile(null);
          await supabase.auth.signOut();
          setSession(null);
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="bg-white mx-4 mt-4 rounded-xl p-4 shadow-sm">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Account
        </Text>
        {profile?.display_name && (
          <Text className="text-lg font-semibold text-gray-900 mb-1">{profile.display_name}</Text>
        )}
        <Text className="text-base text-gray-800">{session?.user.email}</Text>
        {profile?.role && (
          <View className="mt-2 self-start bg-gray-100 px-2 py-0.5 rounded-full">
            <Text className="text-xs font-semibold text-gray-600 capitalize">{profile.role}</Text>
          </View>
        )}
      </View>

      {pendingCount > 0 && (
        <View className="bg-warning-500/10 border border-warning-500 mx-4 mt-4 rounded-xl p-4">
          <Text className="text-warning-600 font-semibold">
            {pendingCount} change{pendingCount > 1 ? 's' : ''} pending sync
          </Text>
          <Text className="text-warning-600 text-sm mt-1">
            Connect to the internet to sync your data to the cloud.
          </Text>
        </View>
      )}

      <View className="bg-white mx-4 mt-4 rounded-xl overflow-hidden shadow-sm">
        <TouchableOpacity
          className="p-4 border-b border-gray-100"
          onPress={() => router.push('/profile/edit')}
        >
          <Text className="text-base text-gray-800">Edit Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="p-4 border-b border-gray-100"
          onPress={() =>
            Alert.alert('Coming soon', 'Notification settings will be added in a future update.')
          }
        >
          <Text className="text-base text-gray-800">Notifications</Text>
        </TouchableOpacity>
        <TouchableOpacity className="p-4" onPress={handleSignOut}>
          <Text className="text-base text-danger-600">Sign Out</Text>
        </TouchableOpacity>
      </View>

      <Text className="text-center text-xs text-gray-400 mt-6 mb-4">Tenant Guardian v1.0.0</Text>
    </ScrollView>
  );
}
