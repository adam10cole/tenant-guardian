import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Image,
} from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getDb } from '@/lib/database/client';
import { supabase } from '@/lib/supabase';
import { StatusBadge } from '@/components/issue/StatusBadge';
import { PhotoViewer } from '@/components/camera/PhotoViewer';
import { IssueTimeline } from '@/components/issue/IssueTimeline';
import { daysUntilDeadline } from '@/lib/deadlines';
import type { IssueStatus, LocalIssue, LocalIssueUpdate, LocalPhoto } from '@/types/database';
import type { ViewerPhoto } from '@/components/camera/PhotoViewer';
import type { WizardPhoto } from '@/store/issueWizardStore';
import { useUpdateIssueStatus } from '@/hooks/useUpdateIssueStatus';
import { useAddIssueUpdate } from '@/hooks/useAddIssueUpdate';
import { useCamera } from '@/hooks/useCamera';
import { useAuthStore } from '@/store/authStore';

async function fetchIssue(localId: string): Promise<LocalIssue | null> {
  const db = await getDb();
  return db.getFirstAsync<LocalIssue>('SELECT * FROM issues WHERE local_id = ? OR id = ?', [
    localId,
    localId,
  ]);
}

async function fetchPhotos(issueLocalId: string): Promise<LocalPhoto[]> {
  const db = await getDb();
  return db.getAllAsync<LocalPhoto>(
    'SELECT * FROM photos WHERE issue_local_id = ? OR issue_id = ? ORDER BY taken_at ASC',
    [issueLocalId, issueLocalId],
  );
}

async function fetchUpdates(issueLocalId: string): Promise<LocalIssueUpdate[]> {
  const db = await getDb();
  return db.getAllAsync<LocalIssueUpdate>(
    'SELECT * FROM issue_updates WHERE issue_local_id = ? ORDER BY created_at ASC',
    [issueLocalId],
  );
}

const THUMB_SIZE = 64;

export default function IssueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuthStore();
  const userId = session?.user.id;

  const { data: issue, isLoading } = useQuery({
    queryKey: ['issue', id],
    queryFn: () => fetchIssue(id),
    enabled: !!id,
  });

  const { data: photos = [] } = useQuery({
    queryKey: ['photos', id],
    queryFn: () => fetchPhotos(id),
    enabled: !!id,
  });

  const { data: updates = [] } = useQuery({
    queryKey: ['updates', id],
    queryFn: () => fetchUpdates(id),
    enabled: !!id,
  });

  const statusMutation = useUpdateIssueStatus(issue?.local_id, id, userId);
  const addUpdateMutation = useAddIssueUpdate(issue?.local_id, id);
  const { takePhoto, pickFromLibrary } = useCamera();

  // PhotoViewer state
  const [viewerPhotos, setViewerPhotos] = useState<ViewerPhoto[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Add-update form state
  const [showAddUpdate, setShowAddUpdate] = useState(false);
  const [updateNote, setUpdateNote] = useState('');
  const [stagedPhotos, setStagedPhotos] = useState<WizardPhoto[]>([]);

  const STATUS_LABELS: Record<IssueStatus, string> = {
    open: 'Open',
    landlord_notified: 'Notified Landlord',
    in_repair: 'In Repair',
    resolved: 'Resolved',
    escalated: 'Escalated',
  };

  function handlePhotoPress(photos: ViewerPhoto[], index: number) {
    setViewerPhotos(photos);
    setViewerIndex(index);
  }

  function handleChangeStatus() {
    if (!issue) return;
    const options = (Object.keys(STATUS_LABELS) as IssueStatus[])
      .filter((s) => s !== issue.status)
      .map((s) => ({
        text: STATUS_LABELS[s],
        onPress: () =>
          statusMutation.mutate({
            status: s,
            currentLandlordNotifiedAt: issue.landlord_notified_at,
          }),
      }));
    Alert.alert('Change Status', 'Select a new status for this issue', [
      ...options,
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

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

  async function handleTakePhoto() {
    try {
      const photo = await takePhoto();
      if (photo) setStagedPhotos((prev) => [...prev, photo]);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not take photo');
    }
  }

  async function handlePickPhoto() {
    try {
      const photo = await pickFromLibrary();
      if (photo) setStagedPhotos((prev) => [...prev, photo]);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not pick photo');
    }
  }

  async function handleSaveUpdate() {
    if (!userId) {
      Alert.alert('Not signed in', 'Please sign in to add an update.');
      return;
    }
    if (!updateNote.trim() && stagedPhotos.length === 0) {
      Alert.alert('Empty update', 'Please add a note or photo before saving.');
      return;
    }
    addUpdateMutation.mutate(
      { userId, note: updateNote.trim(), photos: stagedPhotos },
      {
        onSuccess: () => {
          setShowAddUpdate(false);
          setUpdateNote('');
          setStagedPhotos([]);
        },
        onError: (err) => {
          Alert.alert('Error', err instanceof Error ? err.message : 'Could not save update');
        },
      },
    );
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
      {/* Issue summary */}
      <View className="bg-white mx-4 mt-4 rounded-xl p-4 shadow-sm">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xl font-bold text-gray-900 capitalize">{issue.category}</Text>
          <StatusBadge status={issue.status} />
        </View>

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

      {/* Timeline */}
      <View className="mx-4 mt-4">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Timeline
        </Text>
        <IssueTimeline
          issue={issue}
          photos={photos}
          updates={updates}
          onPhotoPress={handlePhotoPress}
        />
      </View>

      {/* Inline add-update form */}
      {showAddUpdate && (
        <View className="bg-white mx-4 mt-4 rounded-xl p-4 shadow-sm">
          <TextInput
            className="border border-gray-200 rounded-lg p-3 text-sm text-gray-800 min-h-[80px]"
            placeholder="Describe the update (optional)…"
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
            value={updateNote}
            onChangeText={setUpdateNote}
          />

          <View className="flex-row gap-3 mt-3">
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center gap-1 border border-gray-300 rounded-lg py-2"
              onPress={handleTakePhoto}
            >
              <Text className="text-sm text-gray-700">📷 Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center gap-1 border border-gray-300 rounded-lg py-2"
              onPress={handlePickPhoto}
            >
              <Text className="text-sm text-gray-700">🖼 Library</Text>
            </TouchableOpacity>
          </View>

          {stagedPhotos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
              <View className="flex-row gap-2">
                {stagedPhotos.map((photo) => (
                  <TouchableOpacity
                    key={photo.localId}
                    onPress={() =>
                      setStagedPhotos((prev) => prev.filter((p) => p.localId !== photo.localId))
                    }
                  >
                    <Image
                      source={{ uri: photo.uri }}
                      style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
                      className="rounded-lg"
                    />
                    <View className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 items-center justify-center">
                      <Text className="text-white text-xs">✕</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          <View className="flex-row gap-3 mt-3">
            <TouchableOpacity
              className="flex-1 bg-primary-600 rounded-xl py-3 items-center"
              onPress={handleSaveUpdate}
              disabled={addUpdateMutation.isPending}
            >
              <Text className="text-white font-semibold text-sm">
                {addUpdateMutation.isPending ? 'Saving…' : 'Save Update'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-white border border-gray-300 rounded-xl py-3 items-center"
              onPress={() => {
                setShowAddUpdate(false);
                setUpdateNote('');
                setStagedPhotos([]);
              }}
            >
              <Text className="text-gray-700 font-semibold text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Add Update button */}
      {!showAddUpdate && (
        <View className="mx-4 mt-3">
          <TouchableOpacity
            className="bg-white border border-gray-300 rounded-xl py-3 items-center"
            onPress={() => setShowAddUpdate(true)}
          >
            <Text className="text-gray-700 font-semibold text-sm">+ Add Update</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Actions */}
      <View className="mx-4 mt-3 gap-3">
        <TouchableOpacity
          className="bg-white border border-gray-300 rounded-xl py-4 items-center"
          onPress={handleChangeStatus}
          disabled={statusMutation.isPending}
        >
          <Text className="text-gray-700 font-semibold text-base">
            {statusMutation.isPending ? 'Updating…' : 'Change Status'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-primary-600 rounded-xl py-4 items-center"
          onPress={handleGeneratePdf}
        >
          <Text className="text-white font-bold text-base">Generate Evidence PDF</Text>
        </TouchableOpacity>
      </View>

      {issue.sync_status !== 'synced' && (
        <View className="mx-4 mt-3 mb-6 p-3 bg-warning-500/10 rounded-xl">
          <Text className="text-warning-600 text-xs text-center">
            Pending sync — connect to internet to upload
          </Text>
        </View>
      )}

      {/* PhotoViewer modal */}
      <PhotoViewer
        photos={viewerPhotos}
        initialIndex={viewerIndex ?? 0}
        visible={viewerIndex !== null}
        onClose={() => setViewerIndex(null)}
      />

      <View className="h-8" />
    </ScrollView>
  );
}
