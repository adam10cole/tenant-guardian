import { View, Text, ActivityIndicator } from 'react-native';
import MapView, { Heatmap, PROVIDER_GOOGLE } from 'react-native-maps';
import { useHeatmap } from '@/hooks/useHeatmap';

export default function HeatmapScreen() {
  const { points, isLoading, error } = useHeatmap();

  if (error) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-danger-600 text-base text-center">{error.message}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <MapView
        style={{ flex: 1 }}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: 42.2808,
          longitude: -83.743,
          latitudeDelta: 0.15,
          longitudeDelta: 0.15,
        }}
      >
        {points.length > 0 && (
          <Heatmap
            points={points.map((p) => ({
              latitude: p.lat,
              longitude: p.lng,
              weight: Number(p.report_count),
            }))}
            radius={30}
            opacity={0.7}
          />
        )}
      </MapView>

      {isLoading && (
        <View className="absolute inset-0 items-center justify-center bg-white/60">
          <ActivityIndicator size="large" color="#1a56db" />
        </View>
      )}

      <View className="absolute bottom-4 left-4 right-4 bg-white/90 rounded-xl p-3 shadow">
        <Text className="text-xs text-gray-500 text-center">
          Heatmap shows areas with 3+ active reports. Individual addresses are not shown to protect
          privacy.
        </Text>
      </View>
    </View>
  );
}
