import { View, Text, TouchableOpacity, Image, FlatList, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useIssueWizardStore } from '@/store/issueWizardStore';
import { useCamera } from '@/hooks/useCamera';

export default function PhotoStep() {
  const { photos, addPhoto } = useIssueWizardStore();
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
      <Text className="text-base text-gray-500 px-4 py-4">
        Take photos of the issue. Photos are watermarked with the date and time and hashed for
        tamper-evident legal evidence.
      </Text>

      <FlatList
        data={photos}
        keyExtractor={(item) => item.localId}
        numColumns={3}
        contentContainerStyle={{ padding: 16 }}
        columnWrapperClassName="gap-2"
        ItemSeparatorComponent={() => <View className="h-2" />}
        renderItem={({ item }) => (
          <View className="flex-1 aspect-square rounded-lg overflow-hidden">
            <Image source={{ uri: item.uri }} className="flex-1" resizeMode="cover" />
          </View>
        )}
        ListFooterComponent={
          <View className="flex-row gap-3 mt-4">
            <TouchableOpacity
              className="flex-1 bg-primary-600 rounded-xl py-4 items-center"
              onPress={handleCamera}
            >
              <Text className="text-white font-bold">📷 Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-white border border-gray-300 rounded-xl py-4 items-center"
              onPress={handleLibrary}
            >
              <Text className="text-gray-700 font-bold">🖼 Library</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <View className="px-4 pb-6">
        <TouchableOpacity
          className="bg-primary-600 rounded-xl py-4 items-center"
          onPress={() => router.push('/issue/new/confirm')}
        >
          <Text className="text-white font-bold text-base">
            {photos.length === 0
              ? 'Skip Photos'
              : `Continue with ${photos.length} Photo${photos.length > 1 ? 's' : ''}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
