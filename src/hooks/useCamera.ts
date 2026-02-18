import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import * as Location from 'expo-location';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
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
 *
 * Uses expo-file-system v19's File class (which implements the Blob
 * interface) to read raw bytes, then Web Crypto API for hashing.
 * This produces the same hash as the generate-pdf Edge Function which
 * also downloads and hashes raw bytes from Supabase Storage.
 */
async function hashFile(uri: string): Promise<string> {
  const file = new File(uri);
  const arrayBuffer = await file.arrayBuffer();
  return bytesToHex(sha256(new Uint8Array(arrayBuffer)));
}

/**
 * Normalizes the image for consistent hashing and reduces file size.
 * Text watermarking is applied server-side at PDF generation time.
 */
async function applyWatermark(uri: string, takenAt: string): Promise<string> {
  void takenAt;

  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1920 } }], {
    compress: 0.92,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return result.uri;
}

export function useCamera() {
  async function processImageUri(uri: string): Promise<WizardPhoto> {
    const takenAt = new Date().toISOString();

    // GPS coordinates are optional — don't block if permission not granted
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
      // Location is optional
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
