const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

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
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  return parseJsonOrThrow(response);
}

export async function loginWithEmailPassword({ email, password }) {
  return request('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
}

export async function signupWithEmailPassword({ email, password }) {
  return request('/auth/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
}

export async function getMe(token) {
  return request('/auth/me', {
    headers: {
      ...buildAuthHeaders(token)
    }
  });
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

export async function deleteVideoById(videoId, token) {
  const response = await fetch(`${API_BASE_URL}/video/${videoId}`, {
    method: 'DELETE',
    headers: {
      ...buildAuthHeaders(token)
    }
  });
  return parseJsonOrThrow(response);
}

export async function updateVideoTitle(videoId, title, token) {
  const response = await fetch(`${API_BASE_URL}/video/${videoId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(token)
    },
    body: JSON.stringify({ title })
  });
  return parseJsonOrThrow(response);
}

export async function syncVideoDuration(videoId, token) {
  const response = await fetch(`${API_BASE_URL}/video/${videoId}/duration/sync`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(token)
    }
  });
  return parseJsonOrThrow(response);
}

export async function generateTimelineForVideo(videoId, token) {
  const response = await fetch(`${API_BASE_URL}/video/${videoId}/timeline/generate`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(token)
    }
  });
  return parseJsonOrThrow(response);
}
