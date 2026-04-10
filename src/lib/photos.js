/**
 * Photo upload utility for Field Command
 *
 * Flow: compress on-device → get presigned URL from Edge Function → upload directly to R2
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase, SUPABASE_URL } from './supabase';

const UPLOAD_FUNCTION = `${SUPABASE_URL}/functions/v1/upload-photo`;
const MAX_WIDTH = 1920;
const JPEG_QUALITY = 0.6;

/**
 * Compress and resize a photo before upload.
 * @param {string} uri - Local file URI from camera/picker
 * @returns {Promise<{ uri: string, width: number, height: number }>}
 */
async function compressPhoto(uri) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_WIDTH } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result;
}

/**
 * Upload a single photo to R2 via presigned URL.
 *
 * @param {string} localUri - Local file URI
 * @param {number} jobId - Job ID for organizing in R2
 * @param {string} filename - Original filename
 * @returns {Promise<{ key: string, public_url: string }>}
 */
export async function uploadPhoto(localUri, jobId, filename) {
  // 1. Compress
  const compressed = await compressPhoto(localUri);

  // 2. Get presigned URL from Edge Function
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(UPLOAD_FUNCTION, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      job_id: jobId,
      filename: filename || 'photo.jpg',
      content_type: 'image/jpeg',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Upload request failed: ${response.status}`);
  }

  const { upload_url, public_url, key } = await response.json();

  // 3. Upload directly to R2
  const file = await fetch(compressed.uri);
  const blob = await file.blob();

  const uploadResponse = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error(`R2 upload failed: ${uploadResponse.status}`);
  }

  return { key, public_url };
}

/**
 * Upload multiple photos, returning results for each.
 * Uploads sequentially to avoid overwhelming the connection on mobile.
 *
 * @param {string[]} uris - Array of local file URIs
 * @param {number} jobId - Job ID
 * @param {function} onProgress - Called with (completed, total) after each upload
 * @returns {Promise<Array<{ uri: string, key: string, public_url: string, error?: string }>>}
 */
export async function uploadPhotos(uris, jobId, onProgress) {
  const results = [];
  for (let i = 0; i < uris.length; i++) {
    try {
      const { key, public_url } = await uploadPhoto(uris[i], jobId, `photo_${i + 1}.jpg`);
      results.push({ uri: uris[i], key, public_url });
    } catch (err) {
      console.error(`Photo ${i + 1} upload failed:`, err);
      results.push({ uri: uris[i], key: null, public_url: null, error: err.message });
    }
    if (onProgress) onProgress(i + 1, uris.length);
  }
  return results;
}
