import { View, Text, TouchableOpacity, Image, FlatList, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useIssueWizardStore } from '@/store/issueWizardStore';
import { useCamera } from '@/hooks/useCamera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function PhotoStep() {
  const insets = useSafeAreaInsets();
  const { photos, addPhoto, removePhoto } = useIssueWizardStore();
  const { takePhoto, pickFromLibrary } = useCamera();
  const router = useRouter();

  async function handleCamera() {
    try {
      const result = await takePhoto();
      if (result) addPhoto(result);
    } catch (e) {
      Alert.alert('Camera error', e instanceof Error ? e.message : 'Could not take photo');
    }
  }

  async function handleLibrary() {
    try {
      const result = await pickFromLibrary();
      if (result) addPhoto(result);
    } catch (e) {
      Alert.alert('Library error', e instanceof Error ? e.message : 'Could not access photos');
    }
  }

  return (
    <View className="flex-1 bg-gray-50">
      <Text className="text-base text-gray-500 px-6 py-4">
        Take up to 10 photos of the issue. Photos are watermarked and hashed for legal evidence.
      </Text>

      <FlatList
        data={photos}
        keyExtractor={(item) => item.localId}
        numColumns={3}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        columnWrapperStyle={{ gap: 10 }}
        renderItem={({ item }) => (
          <View className="flex-1 aspect-square relative mb-3 pt-2 pr-2">
            <View className="flex-1 rounded-2xl overflow-hidden bg-gray-200 border border-gray-100">
              <Image source={{ uri: item.uri }} className="flex-1" resizeMode="cover" />
            </View>

            <TouchableOpacity
              onPress={() => removePhoto(item.localId)}
              className="absolute top-0 right-0 bg-red-500 rounded-full w-8 h-8 items-center justify-center border-2 border-white"
              style={{
                zIndex: 999,
                elevation: 5,
              }}
            >
              <Ionicons name="close" size={18} color="white" />
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          <View className="flex-row gap-3">
            <TouchableOpacity
              className="flex-1 bg-white border border-gray-200 rounded-full py-4 items-center shadow-sm"
              onPress={handleCamera}
            >
              <Text className="text-gray-800 font-bold">📷 Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-white border border-gray-200 rounded-full py-4 items-center shadow-sm"
              onPress={handleLibrary}
            >
              <Text className="text-gray-800 font-bold">🖼 Library</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <View style={{ paddingBottom: Math.max(insets.bottom, 50) }}>
        <TouchableOpacity
          className={`mx-4 rounded-full py-4 items-center ${photos.length === 0 ? 'bg-gray-400' : 'bg-primary-600'}`}
          onPress={() => router.push('/issue/new/confirm')}
        >
          <Text className="text-white font-bold text-base">
            {photos.length === 0
              ? 'Skip Photos'
              : `Continue with ${photos.length} Photo${photos.length !== 1 ? 's' : ''}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
