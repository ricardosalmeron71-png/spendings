import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export type PickedImage = { uri: string; width?: number; height?: number };

/** Abre galería (selección múltiple) o cámara. */
export async function pickImages(source: 'library' | 'camera'): Promise<PickedImage[]> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Necesitamos permiso de cámara para tomar la foto del ticket');
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    return res.canceled ? [] : res.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 10,
    quality: 0.8,
  });
  return res.canceled ? [] : res.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
}

/** Comprime a máx. 1600px JPEG para ahorrar datos y almacenamiento. */
async function compress(uri: string) {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return out;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function uploadFile(bucket: string, path: string, uri: string) {
  const res = await fetch(uri);
  const body = await res.arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
}

/** Sube evidencias de un movimiento: evidence/{group}/{txn}/{uuid}.jpg */
export async function uploadEvidence(groupId: string, transactionId: string, images: PickedImage[]) {
  for (const img of images) {
    const c = await compress(img.uri);
    const path = `${groupId}/${transactionId}/${uuid()}.jpg`;
    await uploadFile('fin_evidence', path, c.uri);
    const { error } = await supabase.from('transaction_attachments').insert({
      transaction_id: transactionId,
      group_id: groupId,
      storage_path: path,
      width: c.width,
      height: c.height,
    });
    if (error) throw new Error(error.message);
  }
}

export async function deleteEvidence(id: string, path: string) {
  await supabase.storage.from('fin_evidence').remove([path]);
  await supabase.from('transaction_attachments').delete().eq('id', id);
}

/** URLs firmadas temporales (el bucket es privado). */
export async function signedUrls(paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from('fin_evidence').createSignedUrls(paths, 3600);
  const map: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  return map;
}

export async function uploadAvatar(userId: string, uri: string) {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 400 } }], {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  await uploadFile('fin_avatars', path, out.uri);
  const { data } = supabase.storage.from('fin_avatars').getPublicUrl(path);
  return data.publicUrl;
}
