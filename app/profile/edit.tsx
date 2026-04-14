import { useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfileStore } from '@/store/profileStore';
import { useAuthStore } from '@/store/authStore';

export default function EditProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuthStore();
  const profile = useProfileStore((s) => s.profile);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!displayName.trim()) {
      Alert.alert('Name required', 'Please enter your display name.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() })
        .eq('id', session!.user.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['profile', session!.user.id] });
      router.back();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView className="flex-1" contentContainerClassName="px-6 py-8">
        <Text className="text-sm font-semibold text-gray-700 mb-1">Display Name</Text>
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-base mb-6 bg-white"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          textContentType="name"
          autoComplete="name"
          autoFocus
        />

        <TouchableOpacity
          className={`rounded-lg py-4 items-center ${loading ? 'bg-primary-300' : 'bg-primary-600'}`}
          onPress={handleSave}
          disabled={loading}
        >
          <Text className="text-white font-bold text-base">
            {loading ? 'Saving…' : 'Save Changes'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity className="mt-4 items-center" onPress={() => router.back()}>
          <Text className="text-gray-500 text-base">Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
