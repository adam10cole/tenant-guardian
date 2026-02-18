import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useIssueWizardStore } from '@/store/issueWizardStore';
import { useAuthStore } from '@/store/authStore';
import { getDb } from '@/lib/database/client';
import { enqueueIssueWrite, enqueuePhotoUpload } from '@/lib/sync/queue';
import { getDeadlineDays } from '@/lib/deadlines';
// expo-crypto is bundled with Expo — use it for UUID generation
function generateLocalId(): string {
  // Fallback if crypto.randomUUID unavailable on older Android
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function ConfirmStep() {
  const { category, description, photos, reset } = useIssueWizardStore();
  const { session } = useAuthStore();
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit() {
    if (!session?.user) {
      Alert.alert('Not signed in', 'Please sign in to submit an issue.');
      return;
    }

    setSubmitting(true);
    try {
      const db = await getDb();
      const localId = generateLocalId();
      const now = new Date().toISOString();

      // Get user's jurisdiction for deadline calculation
      const profile = await db
        .getFirstAsync<{
          jurisdiction: string;
        }>('SELECT jurisdiction FROM profiles WHERE id = ?', [session.user.id])
        .catch(() => null);

      const jurisdiction = profile?.jurisdiction ?? 'MI-GENERAL';
      const deadlineDays = getDeadlineDays(jurisdiction, category!);

      // Write issue to local SQLite immediately (offline-first)
      await db.runAsync(
        `INSERT INTO issues (
          local_id, user_id, category, status, description,
          first_reported_at, legal_deadline_days, client_updated_at, created_at, sync_status
        ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, 'pending_insert')`,
        [localId, session.user.id, category!, description, now, deadlineDays, now, now],
      );

      // Enqueue sync
      await enqueueIssueWrite(localId, 'insert', {
        user_id: session.user.id,
        building_id: null,
        category: category!,
        status: 'open',
        description,
        first_reported_at: now,
        landlord_notified_at: null,
        legal_deadline_days: deadlineDays,
        legal_deadline_at: null,
        local_id: localId,
        client_updated_at: now,
      });

      // Enqueue each photo upload
      for (const photo of photos) {
        await db.runAsync(
          `INSERT INTO photos (
            local_id, issue_local_id, user_id, taken_at, latitude, longitude,
            photo_hash, local_path, created_at, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_insert')`,
          [
            photo.localId,
            localId,
            session.user.id,
            photo.takenAt,
            photo.latitude ?? null,
            photo.longitude ?? null,
            photo.hash,
            photo.uri,
            now,
          ],
        );

        await enqueuePhotoUpload(photo.localId, photo.uri, {
          issue_id: localId, // resolved to server id by the sync worker
          user_id: session.user.id,
          storage_path: '', // filled in by sync worker
          taken_at: photo.takenAt,
          latitude: photo.latitude ?? null,
          longitude: photo.longitude ?? null,
          photo_hash: photo.hash,
          local_id: photo.localId,
          watermarked_path: null,
        });
      }

      reset();

      Alert.alert(
        'Issue Reported',
        'Your issue has been saved. It will sync to the cloud when you have internet access.',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/dashboard') }],
      );
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not save issue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="mx-4 my-4">
        <Text className="text-xl font-bold text-gray-900 mb-6">Review Your Report</Text>

        <View className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Category
          </Text>
          <Text className="text-base text-gray-800 capitalize">{category}</Text>
        </View>

        <View className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Description
          </Text>
          <Text className="text-base text-gray-800">{description}</Text>
        </View>

        <View className="bg-white rounded-xl p-4 shadow-sm mb-6">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Photos
          </Text>
          <Text className="text-base text-gray-800">
            {photos.length} photo{photos.length !== 1 ? 's' : ''} attached
          </Text>
        </View>

        <TouchableOpacity
          className={`rounded-full py-4 items-center ${submitting ? 'bg-primary-300' : 'bg-primary-600'}`}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-base">Submit Report</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
