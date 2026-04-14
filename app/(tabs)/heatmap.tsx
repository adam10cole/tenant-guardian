import { useRef } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { useHeatmap } from '@/hooks/useHeatmap';
import type { HeatmapCell } from '@/types/database';

MapLibreGL.setAccessToken(null);

const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

function buildGeoJSON(points: HeatmapCell[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { weight: Number(p.report_count) },
    })),
  };
}

export default function HeatmapScreen() {
  const { points, userCoords, isLoading, error } = useHeatmap();
  const cameraRef = useRef<MapLibreGL.Camera>(null);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-danger-600 text-base text-center">{error.message}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <MapLibreGL.MapView
        style={{ flex: 1 }}
        mapStyle={MAP_STYLE}
        logoEnabled={false}
        attributionEnabled={false}
      >
        <MapLibreGL.UserLocation visible />
        <MapLibreGL.Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: [-83.743, 42.2808], zoomLevel: 11 }}
          {...(userCoords
            ? {
                centerCoordinate: [userCoords.lng, userCoords.lat],
                zoomLevel: 17,
                animationMode: 'flyTo',
                animationDuration: 800,
              }
            : {})}
        />

        {points.length > 0 && (
          <MapLibreGL.ShapeSource id="heatmap-source" shape={buildGeoJSON(points)}>
            <MapLibreGL.HeatmapLayer
              id="heatmap-layer"
              sourceID="heatmap-source"
              style={{
                heatmapRadius: 30,
                heatmapOpacity: 0.7,
                heatmapWeight: ['get', 'weight'],
                heatmapIntensity: 1,
                heatmapColor: [
                  'interpolate',
                  ['linear'],
                  ['heatmap-density'],
                  0,
                  'rgba(33,102,172,0)',
                  0.2,
                  'rgb(103,169,207)',
                  0.4,
                  'rgb(209,229,240)',
                  0.6,
                  'rgb(253,219,199)',
                  0.8,
                  'rgb(239,138,98)',
                  1,
                  'rgb(178,24,43)',
                ],
              }}
            />
          </MapLibreGL.ShapeSource>
        )}
      </MapLibreGL.MapView>

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
