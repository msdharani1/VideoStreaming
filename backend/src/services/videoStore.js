const { getDatabase } = require('./firebaseAdmin');

function videosRef() {
  return getDatabase().ref('videos');
}

function videoRef(videoId) {
  return videosRef().child(videoId);
}

async function createVideo(videoId, payload) {
  await videoRef(videoId).set(payload);
}

async function updateVideo(videoId, payload) {
  await videoRef(videoId).update(payload);
}

async function getVideo(videoId) {
  const snapshot = await videoRef(videoId).once('value');
  return snapshot.exists() ? snapshot.val() : null;
}

async function deleteVideo(videoId) {
  await videoRef(videoId).remove();
}

async function listVideos() {
  const snapshot = await videosRef().once('value');
  if (!snapshot.exists()) return [];
  const data = snapshot.val();
  return Object.values(data || {});
}

module.exports = {
  createVideo,
  updateVideo,
  getVideo,
  deleteVideo,
  listVideos
};
