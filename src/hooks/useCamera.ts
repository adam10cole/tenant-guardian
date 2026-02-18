import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import type { WizardPhoto } from '@/store/issueWizardStore';

function generateLocalId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Computes a SHA-256 hash of the file at the given URI.
 * Uses expo-file-system to read as base64, then Web Crypto API.
 */
async function hashFile(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Decode base64 to bytes
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes.buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Applies a timestamp watermark to the image.
 * Returns the URI of the watermarked copy.
 *
 * Note: expo-image-manipulator does not support text overlays natively.
 * In production, add a text watermark via a canvas-based approach or
 * the generate-pdf Edge Function. Here we add a subtle crop as a placeholder.
 */
async function applyWatermark(uri: string, takenAt: string): Promise<string> {
  // Currently returns original URI — text watermarking requires
  // a canvas/SVG overlay not available in bare ImageManipulator.
  // TODO: Implement watermark in src/lib/watermark.ts using SVG overlay.
  void takenAt;

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1920 } }], // Normalize size for consistent hashing
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
  );

  return result.uri;
}

export function useCamera() {
  async function processImageUri(uri: string): Promise<WizardPhoto> {
    const takenAt = new Date().toISOString();

    // Get GPS coordinates (optional — don't block if permission not granted)
    let latitude: number | null = null;
    let longitude: number | null = null;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        latitude = loc.coords.latitude;
        longitude = loc.coords.longitude;
      }
    } catch {
      // Location is optional for photos
    }

    const watermarkedUri = await applyWatermark(uri, takenAt);
    const hash = await hashFile(watermarkedUri);

    return {
      localId: generateLocalId(),
      uri: watermarkedUri,
      takenAt,
      latitude,
      longitude,
      hash,
    };
  }

  async function takePhoto(): Promise<WizardPhoto | null> {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Camera permission is required to take photos.');
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.92,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return null;
    return processImageUri(result.assets[0].uri);
  }

  async function pickFromLibrary(): Promise<WizardPhoto | null> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Photo library permission is required.');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.92,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return null;
    return processImageUri(result.assets[0].uri);
  }

  return { takePhoto, pickFromLibrary };
}
