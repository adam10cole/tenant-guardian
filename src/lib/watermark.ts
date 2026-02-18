/**
 * Photo watermarking — Tenant Guardian
 *
 * Applies a visible timestamp + "TENANT GUARDIAN" text watermark to
 * evidence photos. This is burned into the image before the SHA-256
 * hash is computed, so the hash covers the watermarked version.
 *
 * Current implementation: expo-image-manipulator does not natively
 * support text overlays on React Native. The authoritative watermark
 * is applied server-side in the generate-pdf Edge Function where
 * pdf-lib places the watermark text over the embedded photo.
 *
 * For the client-side preview, we use a React Native Image + View
 * overlay (see src/components/camera/WatermarkOverlay.tsx) which is
 * purely cosmetic and does NOT affect the stored hash.
 *
 * TODO: Implement true burned-in watermark using a canvas-based
 * solution (e.g., react-native-canvas or an Expo Module) so the
 * watermark is part of the hashed image bytes.
 */

import * as ImageManipulator from 'expo-image-manipulator';

export interface WatermarkOptions {
  takenAt: string; // ISO 8601 timestamp shown in watermark
  jurisdiction?: string; // Optional jurisdiction tag
}

/**
 * Normalizes the image (resize + compress) in preparation for hashing.
 * In the current implementation this is the only transformation applied
 * client-side. Text watermark is deferred to the PDF generation step.
 *
 * @param uri    - Local file URI of the source image
 * @param options - Watermark metadata
 * @returns URI of the processed image
 */
export async function applyWatermark(uri: string, _options: WatermarkOptions): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1920 } }], {
    compress: 0.92,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return result.uri;
}
