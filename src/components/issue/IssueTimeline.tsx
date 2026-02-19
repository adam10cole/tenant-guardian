import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Dimensions } from 'react-native';
import { StatusBadge } from '@/components/issue/StatusBadge';
import type { LocalIssue, LocalPhoto, LocalIssueUpdate, IssueStatus } from '@/types/database';
import type { ViewerPhoto } from '@/components/camera/PhotoViewer';

const THUMB_SIZE = (Dimensions.get('window').width - 80) / 3;

type TimelineEntry =
  | { kind: 'initial'; date: string; note: string | null; photos: LocalPhoto[] }
  | { kind: 'update'; update: LocalIssueUpdate; photos: LocalPhoto[] }
  | { kind: 'status_change'; update: LocalIssueUpdate };

function buildEntries(
  issue: LocalIssue,
  photos: LocalPhoto[],
  updates: LocalIssueUpdate[],
): TimelineEntry[] {
  const initialPhotos = photos.filter((p) => !p.update_id && !p.update_local_id);

  const initial: TimelineEntry = {
    kind: 'initial',
    date: issue.first_reported_at,
    note: issue.description,
    photos: initialPhotos,
  };

  const rest: TimelineEntry[] = updates.map((u) => {
    if (u.event_type === 'status_change') {
      return { kind: 'status_change', update: u };
    }
    return {
      kind: 'update',
      update: u,
      photos: photos.filter((p) =>
        p.update_id ? p.update_id === u.id : p.update_local_id === u.local_id,
      ),
    };
  });

  rest.sort((a, b) => {
    const aDate = a.kind === 'initial' ? issue.first_reported_at : a.update.created_at;
    const bDate = b.kind === 'initial' ? issue.first_reported_at : b.update.created_at;
    return aDate.localeCompare(bDate);
  });

  return [initial, ...rest];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

interface PhotoGridProps {
  photos: LocalPhoto[];
  onPhotoPress: (photos: ViewerPhoto[], index: number) => void;
}

function PhotoGrid({ photos, onPhotoPress }: PhotoGridProps) {
  if (photos.length === 0) return null;

  const viewerPhotos: ViewerPhoto[] = photos.map((p) => ({
    uri: p.local_path ?? p.storage_path ?? '',
    takenAt: p.taken_at,
    localId: p.local_id,
  }));

  return (
    <View className="flex-row flex-wrap gap-1 mt-2">
      {photos.map((photo, index) => {
        const uri = photo.local_path ?? photo.storage_path;
        if (!uri) return null;
        return (
          <TouchableOpacity
            key={photo.local_id ?? photo.id}
            style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
            className="rounded-lg overflow-hidden bg-gray-100"
            onPress={() => onPhotoPress(viewerPhotos, index)}
            activeOpacity={0.85}
          >
            <Image
              source={{ uri }}
              style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
              resizeMode="cover"
            />
            {photo.sync_status !== 'synced' && (
              <View className="absolute bottom-0 left-0 right-0 bg-black/40 py-0.5">
                <Text className="text-white text-center text-xs">Uploading…</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface IssueTimelineProps {
  issue: LocalIssue;
  photos: LocalPhoto[];
  updates: LocalIssueUpdate[];
  onPhotoPress: (photos: ViewerPhoto[], index: number) => void;
}

export function IssueTimeline({ issue, photos, updates, onPhotoPress }: IssueTimelineProps) {
  const entries = buildEntries(issue, photos, updates);

  return (
    <View>
      {entries.map((entry, i) => {
        const isLast = i === entries.length - 1;

        if (entry.kind === 'initial') {
          return (
            <View key="initial" className="flex-row">
              <View style={{ width: 24 }} className="items-center">
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: '#6b7280',
                    marginTop: 4,
                  }}
                />
                {!isLast && (
                  <View style={{ width: 2, flex: 1, backgroundColor: '#e5e7eb', marginTop: 2 }} />
                )}
              </View>
              <View className="flex-1 ml-3 pb-4">
                <View className="flex-row items-center gap-2 mb-1">
                  <View className="bg-gray-100 px-2 py-0.5 rounded-full">
                    <Text className="text-xs font-semibold text-gray-600">Initial Report</Text>
                  </View>
                  <Text className="text-xs text-gray-400">{formatDate(entry.date)}</Text>
                </View>
                {entry.note && <Text className="text-sm text-gray-700">{entry.note}</Text>}
                <PhotoGrid photos={entry.photos} onPhotoPress={onPhotoPress} />
              </View>
            </View>
          );
        }

        if (entry.kind === 'update') {
          const isPending = entry.update.sync_status !== 'synced';
          return (
            <View key={entry.update.local_id ?? entry.update.id} className="flex-row">
              <View style={{ width: 24 }} className="items-center">
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: '#1a56db',
                    marginTop: 4,
                  }}
                />
                {!isLast && (
                  <View style={{ width: 2, flex: 1, backgroundColor: '#e5e7eb', marginTop: 2 }} />
                )}
              </View>
              <View className="flex-1 ml-3 pb-4">
                <View className="flex-row items-center gap-2 mb-1">
                  <View className="bg-primary-100 px-2 py-0.5 rounded-full">
                    <Text className="text-xs font-semibold text-primary-700">Update</Text>
                  </View>
                  <Text className="text-xs text-gray-400">
                    {formatDate(entry.update.created_at)}
                  </Text>
                  {isPending && <View className="w-2 h-2 rounded-full bg-warning-400" />}
                </View>
                {entry.update.note && (
                  <Text className="text-sm text-gray-700">{entry.update.note}</Text>
                )}
                <PhotoGrid photos={entry.photos} onPhotoPress={onPhotoPress} />
              </View>
            </View>
          );
        }

        if (entry.kind === 'status_change') {
          return (
            <View key={entry.update.local_id ?? entry.update.id} className="flex-row">
              <View style={{ width: 24 }} className="items-center">
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: '#7c3aed',
                    marginTop: 4,
                  }}
                />
                {!isLast && (
                  <View style={{ width: 2, flex: 1, backgroundColor: '#e5e7eb', marginTop: 2 }} />
                )}
              </View>
              <View className="flex-1 ml-3 pb-4">
                <View className="flex-row items-center gap-2 mb-1">
                  <View className="bg-purple-100 px-2 py-0.5 rounded-full">
                    <Text className="text-xs font-semibold text-purple-700">Status Changed</Text>
                  </View>
                  <Text className="text-xs text-gray-400">
                    {formatDate(entry.update.created_at)}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1 mt-1">
                  <Text className="text-sm text-gray-500">→</Text>
                  {entry.update.status_value && (
                    <StatusBadge status={entry.update.status_value as IssueStatus} />
                  )}
                </View>
              </View>
            </View>
          );
        }

        return null;
      })}
    </View>
  );
}
