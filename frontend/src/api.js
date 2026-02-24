const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

async function parseJsonOrThrow(response) {
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = payload?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export async function uploadVideo({ file, title }) {
  const formData = new FormData();
  formData.append('video', file);
  if (title) {
    formData.append('title', title);
  }

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData
  });

  return parseJsonOrThrow(response);
}

export async function getVideoStream(videoId) {
  const response = await fetch(`${API_BASE_URL}/video/${videoId}`);

  if (response.status === 202) {
    const payload = await response.json();
    return {
      statusCode: response.status,
      payload
    };
  }

  const payload = await parseJsonOrThrow(response);
  return {
    statusCode: response.status,
    payload
  };
}

export async function getUploadStatus(videoId) {
  const response = await fetch(`${API_BASE_URL}/upload/${videoId}`);
  const payload = await parseJsonOrThrow(response);
  return payload;
}

export async function listVideos() {
  const response = await fetch(`${API_BASE_URL}/videos`);
  const payload = await parseJsonOrThrow(response);
  return payload.videos || [];
}

export async function deleteVideoById(videoId) {
  const response = await fetch(`${API_BASE_URL}/video/${videoId}`, {
    method: 'DELETE'
  });
  return parseJsonOrThrow(response);
}
