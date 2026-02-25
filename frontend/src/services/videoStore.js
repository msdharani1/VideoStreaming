import { onValue, ref, get } from 'firebase/database';
import { db } from '../firebase';

function normalizeVideo([id, value]) {
  if (!value || typeof value !== 'object') {
    return { id };
  }
  return { id, ...value };
}

export function subscribeToVideos(callback, onError) {
  const videosRef = ref(db, 'videos');
  return onValue(
    videosRef,
    (snapshot) => {
      const data = snapshot.val() || {};
      const videos = Object.entries(data).map(normalizeVideo);
      callback(videos);
    },
    onError
  );
}

export async function fetchVideosOnce() {
  const snapshot = await get(ref(db, 'videos'));
  const data = snapshot.val() || {};
  return Object.entries(data).map(normalizeVideo);
}

export function subscribeToVideo(videoId, callback, onError) {
  const videoRef = ref(db, `videos/${videoId}`);
  return onValue(
    videoRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      callback({ id: videoId, ...(snapshot.val() || {}) });
    },
    onError
  );
}

export async function fetchVideoOnce(videoId) {
  const snapshot = await get(ref(db, `videos/${videoId}`));
  if (!snapshot.exists()) return null;
  return { id: videoId, ...(snapshot.val() || {}) };
}
