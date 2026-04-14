import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import type { HeatmapCell } from '@/types/database';

export function useHeatmap(radiusKm: number = 10) {
  const [points, setPoints] = useState<HeatmapCell[]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          throw new Error('Location permission is required to view the heatmap.');
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!cancelled) {
          setUserCoords({
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          });
        }

        const { data, error: rpcError } = await supabase.rpc('get_heatmap_data', {
          center_lat: location.coords.latitude,
          center_lng: location.coords.longitude,
          radius_km: radiusKm,
        });

        if (rpcError) throw new Error(rpcError.message);
        if (!cancelled) setPoints(data ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [radiusKm]);

  return { points, userCoords, isLoading, error };
}
