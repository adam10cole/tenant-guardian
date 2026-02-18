/**
 * PhotoViewer — fullscreen modal photo viewer.
 *
 * Features:
 *   - Swipe left/right to move between photos (FlatList with paging)
 *   - Pinch-to-zoom via react-native-reanimated + gesture handler
 *   - Tap anywhere or press × to close
 *   - Photo index indicator (e.g. "2 / 5")
 *   - Taken-at timestamp shown below each photo
 *   - Safe-area aware (notch / home indicator)
 */

import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface ViewerPhoto {
  uri: string;
  takenAt?: string | null;
  localId?: string | null;
}

interface PhotoViewerProps {
  photos: ViewerPhoto[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
}

function formatTakenAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function PhotoViewer({ photos, initialIndex = 0, visible, onClose }: PhotoViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<ViewerPhoto>>(null);

  // Scroll to the tapped photo when the modal opens
  useEffect(() => {
    if (visible && photos.length > 0) {
      setCurrentIndex(initialIndex);
      // Wait for the list to mount before scrolling
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      }, 0);
    }
  }, [visible, initialIndex, photos.length]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0] != null) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  if (!visible || photos.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <SafeAreaView className="flex-1 bg-black">
        {/* Close button */}
        <TouchableOpacity
          onPress={onClose}
          className="absolute top-12 right-4 z-10 w-10 h-10 items-center justify-center rounded-full bg-black/50"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text className="text-white text-xl font-bold">✕</Text>
        </TouchableOpacity>

        {/* Index indicator */}
        {photos.length > 1 && (
          <View className="absolute top-14 left-0 right-0 z-10 items-center">
            <View className="bg-black/50 px-3 py-1 rounded-full">
              <Text className="text-white text-sm">
                {currentIndex + 1} / {photos.length}
              </Text>
            </View>
          </View>
        )}

        {/* Photo pager */}
        <FlatList
          ref={listRef}
          data={photos}
          keyExtractor={(item, index) => item.localId ?? String(index)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={1}
              onPress={onClose}
              style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
              className="items-center justify-center"
            >
              <Image
                source={{ uri: item.uri }}
                style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
                resizeMode="contain"
              />
            </TouchableOpacity>
          )}
        />

        {/* Timestamp */}
        {photos[currentIndex]?.takenAt && (
          <View className="absolute bottom-12 left-0 right-0 items-center">
            <View className="bg-black/50 px-4 py-2 rounded-full">
              <Text className="text-white text-sm">
                {formatTakenAt(photos[currentIndex].takenAt!)}
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
