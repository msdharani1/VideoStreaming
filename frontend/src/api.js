import { fetchVideoOnce } from './services/videoStore';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

async function parseJsonOrThrow(response) {
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = payload?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function buildAuthHeaders(token) {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function request(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error('API base URL is not configured');
  }
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  return parseJsonOrThrow(response);
}

export async function uploadVideo({ file, title, token }) {
  const formData = new FormData();
  formData.append('video', file);
  if (title) {
    formData.append('title', title);
  }

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(token)
    },
    body: formData
  });

  return parseJsonOrThrow(response);
}

export async function uploadNormalVideo({ file, title, token }) {
  const formData = new FormData();
  formData.append('video', file);
  if (title) {
    formData.append('title', title);
  }

  const response = await fetch(`${API_BASE_URL}/upload/normal`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(token)
    },
    body: formData
  });

  return parseJsonOrThrow(response);
}

export async function listNormalImportFiles(token) {
  const response = await fetch(`${API_BASE_URL}/upload/normal/import/files`, {
    headers: {
      ...buildAuthHeaders(token)
    }
  });
  const payload = await parseJsonOrThrow(response);
  return payload.files || [];
}

export async function importNormalVideoFromStorage({ fileName, title, token }) {
  const response = await fetch(`${API_BASE_URL}/upload/normal/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(token)
    },
    body: JSON.stringify({ fileName, title })
  });
  return parseJsonOrThrow(response);
}

export async function getVideoStream(videoId) {
  const video = await fetchVideoOnce(videoId);
  if (!video) {
    throw new Error('video not found');
  }

  if (video.status !== 'ready') {
    return {
      statusCode: 202,
      payload: {
        id: video.id,
        title: video.title,
        playbackType: video.playbackType || 'adaptive',
        status: video.status,
        progress: video.progress || 0,
        processStep: video.processStep || 'Processing',
        error: video.error || null,
        durationSec: Number(video.durationSec) || 0,
        thumbnailUrl: video.thumbnailUrl || ''
      }
    };
  }

  return {
    statusCode: 200,
    payload: {
      id: video.id,
      title: video.title,
      playbackType: video.playbackType || 'adaptive',
      status: video.status,
      durationSec: Number(video.durationSec) || 0,
      mimeType: video.mimeType || null,
      thumbnailUrl: video.thumbnailUrl || '',
      streamUrl: video.streamUrl || '',
      timeline: video.timeline || null
    }
  };
}

export async function getNormalVideoStream(videoId) {
  const video = await fetchVideoOnce(videoId);
  if (!video) {
    throw new Error('video not found');
  }

  if ((video.playbackType || 'adaptive') !== 'normal') {
    throw new Error('video is not configured for normal playback');
  }

  if (video.status !== 'ready') {
    return {
      statusCode: 202,
      payload: {
        id: video.id,
        title: video.title,
        playbackType: video.playbackType || 'normal',
        status: video.status,
        progress: video.progress || 0,
        processStep: video.processStep || 'Processing',
        error: video.error || null,
        durationSec: Number(video.durationSec) || 0,
        thumbnailUrl: video.thumbnailUrl || ''
      }
    };
  }

  return {
    statusCode: 200,
    payload: {
      id: video.id,
      title: video.title,
      status: video.status,
      durationSec: Number(video.durationSec) || 0,
      mimeType: video.mimeType || null,
      thumbnailUrl: video.thumbnailUrl || '',
      sourceUrl: video.sourceUrl || ''
    }
  };
}

export async function getUploadStatus(videoId) {
  const video = await fetchVideoOnce(videoId);
  if (!video) {
    throw new Error('upload not found');
  }
  return {
    id: video.id,
    title: video.title,
    playbackType: video.playbackType || 'adaptive',
    status: video.status,
    progress: video.progress || 0,
    processStep: video.processStep || 'Processing',
    error: video.error || null,
    durationSec: Number(video.durationSec) || 0,
    thumbnailUrl: video.thumbnailUrl || ''
  };
}

export async function deleteVideoById(videoId, token) {
  return request(`/video/${videoId}`, {
    method: 'DELETE',
    headers: {
      ...buildAuthHeaders(token)
    }
  });
}

export async function updateVideoTitle(videoId, title, token) {
  return request(`/video/${videoId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(token)
    },
    body: JSON.stringify({ title })
  });
}

export async function syncVideoDuration(videoId, token) {
  return request(`/video/${videoId}/duration/sync`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(token)
    }
  });
}

export async function generateTimelineForVideo(videoId, token) {
  return request(`/video/${videoId}/timeline/generate`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(token)
    }
  });
}
