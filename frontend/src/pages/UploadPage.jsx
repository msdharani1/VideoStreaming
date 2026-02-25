import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  deleteVideoById,
  generateTimelineForVideo,
  importNormalVideoFromStorage,
  listNormalImportFiles,
  syncVideoDuration,
  updateVideoTitle,
  uploadVideo
} from '../api';
import { fetchVideosOnce, subscribeToVideos } from '../services/videoStore';
import { useAuth } from '../context/AuthContext';

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatCreatedAt(value) {
  if (!value) return 'Unknown time';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!total) return 'Duration unavailable';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function statusLabel(status) {
  if (status === 'ready') return 'Ready';
  if (status === 'failed') return 'Failed';
  return 'Processing';
}

function sortByNewest(a, b) {
  return (b.createdAtMs || 0) - (a.createdAtMs || 0);
}

const UploadCloudIcon = () => (
  <svg className="w-12 h-12 text-accent/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

const PlayCircleIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const TimelineIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8m-8 5h6m-6 5h8M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
  </svg>
);

function UploadPage() {
  const { token } = useAuth();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [uploadMode, setUploadMode] = useState('adaptive');
  const [uploading, setUploading] = useState(false);
  const [importFiles, setImportFiles] = useState([]);
  const [loadingImportFiles, setLoadingImportFiles] = useState(false);
  const [selectedImportFile, setSelectedImportFile] = useState('');
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [refreshingVideos, setRefreshingVideos] = useState(false);
  const [videos, setVideos] = useState([]);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [generatingTimelineId, setGeneratingTimelineId] = useState('');
  const [syncingDurationId, setSyncingDurationId] = useState('');
  const [thumbErrors, setThumbErrors] = useState({});
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const fileInfo = useMemo(() => {
    if (!file) return null;
    return {
      name: file.name,
      type: file.type || 'video/*',
      size: formatSize(file.size)
    };
  }, [file]);

  const fetchVideos = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshingVideos(true);
      const allVideos = await fetchVideosOnce();
      setVideos(allVideos.sort(sortByNewest));
      setThumbErrors({});
      setDeleteError('');
    } catch (requestError) {
      setDeleteError(requestError.message || 'Could not load videos');
    } finally {
      setLoadingVideos(false);
      setRefreshingVideos(false);
    }
  }, []);

  const fetchImportFiles = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoadingImportFiles(true);
      const files = await listNormalImportFiles(token);
      setImportFiles(files);
      setSelectedImportFile((current) => {
        if (current && files.some((fileItem) => fileItem.name === current)) {
          return current;
        }
        return files[0]?.name || '';
      });
    } catch (requestError) {
      setError(requestError.message || 'Could not load import files');
    } finally {
      setLoadingImportFiles(false);
    }
  }, [token]);

  useEffect(() => {
    const unsubscribe = subscribeToVideos(
      (allVideos) => {
        setVideos(allVideos.sort(sortByNewest));
        setThumbErrors({});
        setDeleteError('');
        setLoadingVideos(false);
      },
      (err) => {
        setDeleteError(err?.message || 'Could not load videos');
        setLoadingVideos(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (uploadMode !== 'normal') return;
    fetchImportFiles(true);
  }, [uploadMode, fetchImportFiles]);

  async function onSubmit(event) {
    event.preventDefault();
    if (uploadMode === 'adaptive' && !file) {
      setError('Select a video file before uploading.');
      return;
    }
    if (uploadMode === 'normal' && !selectedImportFile) {
      setError('Select a file from storage/normal-import before importing.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      if (uploadMode === 'normal') {
        await importNormalVideoFromStorage({
          fileName: selectedImportFile,
          title: title.trim(),
          token
        });
      } else {
        await uploadVideo({ file, title: title.trim(), token });
      }
      setTitle('');
      setFile(null);
      setSelectedImportFile('');
      await fetchVideos(true);
      if (uploadMode === 'normal') {
        await fetchImportFiles(true);
      }
      document.getElementById('videos-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (uploadError) {
      setError(uploadError.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(videoId) {
    const confirmed = window.confirm('Delete this video and all generated files?');
    if (!confirmed) return;
    setDeletingId(videoId);
    setDeleteError('');
    try {
      await deleteVideoById(videoId, token);
      await fetchVideos(true);
    } catch (requestError) {
      setDeleteError(requestError.message || 'Could not delete video');
    } finally {
      setDeletingId('');
    }
  }

  async function onSaveTitle(videoId) {
    const nextTitle = editingTitle.trim();
    if (!nextTitle) {
      setDeleteError('Title is required');
      return;
    }

    setSavingTitle(true);
    setDeleteError('');
    try {
      await updateVideoTitle(videoId, nextTitle, token);
      setEditingId('');
      setEditingTitle('');
      await fetchVideos(true);
    } catch (requestError) {
      setDeleteError(requestError.message || 'Could not update title');
    } finally {
      setSavingTitle(false);
    }
  }

  async function onGenerateTimeline(videoId) {
    setGeneratingTimelineId(videoId);
    setDeleteError('');
    try {
      await generateTimelineForVideo(videoId, token);
      await fetchVideos(true);
    } catch (requestError) {
      setDeleteError(requestError.message || 'Could not start timeline generation');
    } finally {
      setGeneratingTimelineId('');
    }
  }

  async function onSyncDuration(videoId) {
    setSyncingDurationId(videoId);
    setDeleteError('');
    try {
      await syncVideoDuration(videoId, token);
      await fetchVideos(true);
    } catch (requestError) {
      setDeleteError(requestError.message || 'Could not fetch duration');
    } finally {
      setSyncingDurationId('');
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type.startsWith('video/')) {
      setFile(droppedFile);
    }
  }

  const readyCount = videos.filter(v => v.status === 'ready').length;
  const processingCount = videos.filter(v => v.status === 'processing').length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hero Section */}
      <section className="animate-rise" id="upload-section">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/10 via-bg-secondary to-bg-tertiary border border-border p-8 md:p-12">
          {/* Decorative blobs */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-blue/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent mb-2">Admin Control Panel</p>
            <h1 className="text-3xl md:text-4xl font-black text-text-primary mb-3">
              Upload and Manage Videos
            </h1>
            <p className="text-text-secondary max-w-2xl text-base leading-relaxed">
              Upload either adaptive HLS videos (360p/720p/1080p) or normal direct-play videos for demo playback.
              For normal mode, place files in <code className="text-accent">storage/normal-import</code> and import instantly.
            </p>

            {/* Stats */}
            <div className="flex flex-wrap gap-4 mt-6">
              <div className="flex items-center gap-3 bg-white/5 border border-border rounded-xl px-4 py-3">
                <div className="w-10 h-10 rounded-lg bg-green/15 flex items-center justify-center">
                  <PlayCircleIcon />
                </div>
                <div>
                  <p className="text-2xl font-bold text-text-primary">{readyCount}</p>
                  <p className="text-xs text-text-muted">Ready</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white/5 border border-border rounded-xl px-4 py-3">
                <div className="w-10 h-10 rounded-lg bg-blue/15 flex items-center justify-center">
                  <ChartIcon />
                </div>
                <div>
                  <p className="text-2xl font-bold text-text-primary">{processingCount}</p>
                  <p className="text-xs text-text-muted">Processing</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white/5 border border-border rounded-xl px-4 py-3">
                <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-text-primary">{videos.length}</p>
                  <p className="text-xs text-text-muted">Total</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Upload Form */}
      <section className="animate-rise-delay-1">
        <div className="rounded-2xl bg-bg-card border border-border p-6 md:p-8">
          <h2 className="text-xl font-bold text-text-primary mb-1">Upload Video</h2>
          <p className="text-sm text-text-secondary mb-6">
            Adaptive mode uploads from browser. Normal mode imports files already copied to storage.
          </p>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-text-secondary">Upload Type</label>
              <div className="inline-flex rounded-xl border border-border bg-bg-tertiary/70 p-1">
                <button
                  type="button"
                  onClick={() => setUploadMode('adaptive')}
                  disabled={uploading}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border-none cursor-pointer transition-colors ${
                    uploadMode === 'adaptive'
                      ? 'bg-accent text-white'
                      : 'bg-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Adaptive HLS
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('normal')}
                  disabled={uploading}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border-none cursor-pointer transition-colors ${
                    uploadMode === 'normal'
                      ? 'bg-accent text-white'
                      : 'bg-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Normal Video
                </button>
              </div>
              <p className="text-xs text-text-muted">
                {uploadMode === 'adaptive'
                  ? 'Adaptive HLS transcodes in background and supports quality switching.'
                  : 'Normal upload keeps the source file and plays with standard browser loading.'}
              </p>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <label htmlFor="videoTitle" className="block text-sm font-semibold text-text-secondary">
                Title
              </label>
              <input
                id="videoTitle"
                type="text"
                placeholder="Give your video a name..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={uploading}
                className="w-full bg-bg-tertiary border border-border rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50 transition-all duration-200 disabled:opacity-50"
              />
            </div>

            {uploadMode === 'adaptive' ? (
              <>
                {/* Drop zone */}
                <div
                  className={`drop-zone relative ${isDragOver ? 'drag-over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    disabled={uploading}
                    id="videoFile"
                  />
                  <div className="flex flex-col items-center gap-3">
                    <UploadCloudIcon />
                    <div>
                      <p className="text-text-primary font-semibold">
                        {isDragOver ? 'Drop your video here' : 'Drag & drop your video here'}
                      </p>
                      <p className="text-sm text-text-muted mt-1">or click to browse • MP4, MOV, AVI, MKV</p>
                    </div>
                  </div>
                </div>

                {/* File info chip */}
                {fileInfo && (
                  <div className="flex items-center gap-4 bg-accent/5 border border-accent/20 rounded-xl p-4 animate-fade-in">
                    <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{fileInfo.name}</p>
                      <p className="text-xs text-text-muted">{fileInfo.type} • {fileInfo.size}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                      className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-red transition-colors"
                      aria-label="Remove file"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl bg-bg-tertiary/50 border border-border p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                  <p className="text-sm text-text-secondary">
                    Copy video files to <span className="font-mono text-accent">storage/normal-import/</span>, then import.
                  </p>
                  <button
                    type="button"
                    onClick={() => fetchImportFiles(true)}
                    disabled={loadingImportFiles || uploading}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-border rounded-lg text-xs font-semibold text-text-secondary disabled:opacity-50"
                  >
                    {loadingImportFiles ? 'Refreshing...' : 'Refresh Files'}
                  </button>
                </div>
                <select
                  value={selectedImportFile}
                  onChange={(event) => setSelectedImportFile(event.target.value)}
                  disabled={loadingImportFiles || uploading || importFiles.length === 0}
                  className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  {importFiles.length === 0 ? (
                    <option value="">No files found in storage/normal-import</option>
                  ) : null}
                  {importFiles.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name} ({formatSize(item.size)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={uploading || (uploadMode === 'adaptive' ? !file : !selectedImportFile)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent hover:shadow-lg hover:shadow-accent/20 active:scale-[0.98]"
              id="upload-button"
            >
              {uploading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {uploadMode === 'normal' ? 'Importing...' : 'Uploading...'}
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {uploadMode === 'normal' ? 'Import from Storage' : 'Upload & Process'}
                </>
              )}
            </button>
          </form>

          {uploading && (
            <p className="mt-4 text-sm text-accent font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              {uploadMode === 'normal'
                ? 'Importing file from storage...'
                : 'Upload accepted. Transcoding job started.'}
            </p>
          )}
          {error && (
            <p className="mt-4 text-sm text-red font-semibold flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </p>
          )}
        </div>
      </section>

      {/* Videos List */}
      <section className="animate-rise-delay-2" id="videos-section">
        <div className="rounded-2xl bg-bg-card border border-border p-6 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-text-primary">Your Videos</h2>
              <p className="text-sm text-text-secondary mt-1">
                All uploaded videos with live processing status and actions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchVideos(true)}
              disabled={refreshingVideos}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-border rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary transition-all duration-200 disabled:opacity-50"
              id="refresh-button"
            >
              <RefreshIcon />
              {refreshingVideos ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {loadingVideos && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl bg-bg-tertiary border border-border p-4 shimmer-bg h-28" />
              ))}
            </div>
          )}
          {deleteError && (
            <p className="text-sm text-red font-semibold mb-4">{deleteError}</p>
          )}
          {!loadingVideos && !videos.length && (
            <div className="text-center py-16">
              <svg className="w-16 h-16 mx-auto text-text-muted/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="text-text-muted font-semibold">No videos yet</p>
              <p className="text-sm text-text-muted/70 mt-1">Upload your first video to get started.</p>
            </div>
          )}

          <div className="grid gap-4">
            {videos.map((video) => {
              const progress = Math.max(0, Math.min(100, Number(video.progress) || 0));
              const isProcessing = video.status === 'processing';
              const isReady = video.status === 'ready';
              const isFailed = video.status === 'failed';
              const isNormalPlayback = (video.playbackType || 'adaptive') === 'normal';
              const isTimelineReady = Boolean(video.timeline?.available);
              const isTimelineGenerating = Boolean(video.timeline?.generating) || generatingTimelineId === video.id;

              return (
                <article
                  key={video.id}
                  className="group rounded-xl bg-bg-tertiary/50 border border-border hover:border-border-strong hover:bg-bg-hover transition-all duration-300 overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row">
                    {/* Thumbnail */}
                    <div className="relative sm:w-52 md:w-64 shrink-0 aspect-video sm:aspect-auto">
                      <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-blue/10 to-transparent" />
                      {!thumbErrors[video.id] && video.thumbnailUrl ? (
                        <img
                          src={video.thumbnailUrl}
                          alt={`${video.title} thumbnail`}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={() => setThumbErrors((c) => ({ ...c, [video.id]: true }))}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-10 h-10 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
                          </svg>
                        </div>
                      )}
                      {/* Status badge on thumb */}
                      {isReady && (
                        <div className="absolute bottom-2 right-2 bg-green/90 text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded-md">
                          Ready
                        </div>
                      )}
                      {isProcessing && (
                        <div className="absolute bottom-2 right-2 bg-blue/90 text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded-md flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          {progress}%
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {editingId === video.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  value={editingTitle}
                                  onChange={(event) => setEditingTitle(event.target.value)}
                                  className="w-full bg-bg-secondary border border-border rounded-lg px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
                                />
                                <button
                                  type="button"
                                  onClick={() => onSaveTitle(video.id)}
                                  disabled={savingTitle}
                                  className="px-2 py-1 text-xs rounded bg-accent text-white disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingId('');
                                    setEditingTitle('');
                                  }}
                                  className="px-2 py-1 text-xs rounded bg-white/10 text-text-secondary"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <h3 className="font-bold text-text-primary text-base leading-snug line-clamp-2">
                                {video.title || 'Untitled Video'}
                              </h3>
                            )}
                          </div>
                          <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${isReady ? 'bg-green/15 text-green' :
                              isProcessing ? 'bg-blue/15 text-blue' :
                                'bg-red/15 text-red'
                            }`}>
                            {statusLabel(video.status)}
                          </span>
                        </div>
                        <p className="text-xs text-text-muted">{video.originalName || 'Unknown source'}</p>
                        <p className="text-xs text-text-muted">
                          Playback: {isNormalPlayback ? 'Normal' : 'Adaptive HLS'}
                        </p>
                        <p className="text-xs text-text-muted">Duration: {formatDuration(video.durationSec)}</p>
                        <p className="text-xs text-text-muted/70 font-mono">{video.id}</p>
                        <p className="text-xs text-text-muted">{formatCreatedAt(video.createdAt)}</p>
                        {isReady && !isNormalPlayback ? (
                          <p className={`text-xs font-semibold ${isTimelineReady ? 'text-green' : isTimelineGenerating ? 'text-blue' : 'text-text-muted'}`}>
                            {isTimelineReady
                              ? `Timeline ready (${video.timeline?.frameCount || 0} frames)`
                              : isTimelineGenerating
                                ? 'Timeline generation running...'
                                : 'Timeline not generated'}
                          </p>
                        ) : null}
                      </div>

                      {/* Progress bar for processing */}
                      {isProcessing && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-text-secondary font-semibold">{progress}%</span>
                            <span className="text-text-muted">{video.processStep || 'Processing'}</span>
                          </div>
                          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-accent to-blue transition-all duration-500 ease-out"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {isFailed && (
                        <p className="text-xs text-red font-medium">{video.error || 'Transcoding failed'}</p>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {isReady ? (
                          <Link
                            to={isNormalPlayback ? `/watch-normal/${video.id}` : `/watch/${video.id}`}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-lg transition-all duration-200 no-underline hover:shadow-lg hover:shadow-accent/20"
                          >
                            <PlayCircleIcon />
                            {isNormalPlayback ? 'Watch Normal' : 'Watch'}
                          </Link>
                        ) : (
                          <Link
                            to={`/process/${video.id}`}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-border text-text-secondary text-sm font-semibold rounded-lg transition-all duration-200 no-underline"
                          >
                            View Progress
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(video.id);
                            setEditingTitle(video.title || '');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue/10 hover:bg-blue/20 text-blue text-sm font-semibold rounded-lg transition-all duration-200 border-none cursor-pointer"
                        >
                          Edit
                        </button>
                        {isReady && !isNormalPlayback ? (
                          <button
                            type="button"
                            onClick={() => onGenerateTimeline(video.id)}
                            disabled={isTimelineGenerating}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 text-text-secondary text-sm font-semibold rounded-lg transition-all duration-200 disabled:opacity-40 border-none cursor-pointer"
                          >
                            <TimelineIcon />
                            {isTimelineGenerating ? 'Generating...' : isTimelineReady ? 'Regenerate Timeline' : 'Generate Timeline'}
                          </button>
                        ) : null}
                        {isReady ? (
                          <button
                            type="button"
                            onClick={() => onSyncDuration(video.id)}
                            disabled={syncingDurationId === video.id}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 text-text-secondary text-sm font-semibold rounded-lg transition-all duration-200 disabled:opacity-40 border-none cursor-pointer"
                          >
                            {syncingDurationId === video.id ? 'Getting Duration...' : video.durationSec > 0 ? 'Refresh Duration' : 'Get Duration'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onDelete(video.id)}
                          disabled={deletingId === video.id}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-red/10 hover:bg-red/20 text-red text-sm font-semibold rounded-lg transition-all duration-200 disabled:opacity-40 border-none cursor-pointer"
                        >
                          <TrashIcon />
                          {deletingId === video.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

export default UploadPage;
