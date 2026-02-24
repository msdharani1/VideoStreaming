import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listVideos } from '../api';
import { useAuth } from '../context/AuthContext';

function formatCreatedAt(value) {
  if (!value) return 'Unknown time';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function statusLabel(status) {
  if (status === 'ready') return 'Ready';
  if (status === 'failed') return 'Failed';
  return 'Processing';
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!total) return 'Duration unavailable';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function VideosPage() {
  const { isAdmin } = useAuth();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [thumbErrors, setThumbErrors] = useState({});
  const [error, setError] = useState('');

  const fetchVideos = useCallback(async (manual = false) => {
    try {
      if (manual) setRefreshing(true);
      const allVideos = await listVideos();
      setVideos(allVideos);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Could not load videos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
    const timer = window.setInterval(() => fetchVideos(), 2500);
    return () => window.clearInterval(timer);
  }, [fetchVideos]);

  const adaptiveVideos = videos.filter((video) => (video.playbackType || 'adaptive') !== 'normal');

  if (!isAdmin) {
    const readyVideos = adaptiveVideos.filter((video) => video.status === 'ready');

    return (
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <section className="animate-rise">
          <div className="rounded-2xl bg-bg-card border border-border p-6 md:p-8">
            <div className="flex items-center justify-between gap-3 mb-5">
              <h1 className="text-2xl font-black text-text-primary">Videos</h1>
              <div className="flex items-center gap-2">
                <Link
                  to="/videos/normal"
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-border rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors no-underline"
                >
                  Normal Demo
                </Link>
                <button
                  type="button"
                  onClick={() => fetchVideos(true)}
                  disabled={refreshing}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-border rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>

            {error ? <p className="text-sm text-red font-semibold mb-4">{error}</p> : null}
            {loading ? <p className="text-sm text-text-muted">Loading videos...</p> : null}
            {!loading && readyVideos.length === 0 ? (
              <p className="text-sm text-text-muted">No ready videos available.</p>
            ) : null}

            <div className="space-y-3">
              {readyVideos.map((video) => (
                <article
                  key={video.id}
                  className="rounded-xl bg-bg-tertiary/50 border border-border overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row">
                    <div className="relative sm:w-48 md:w-56 shrink-0 aspect-video bg-gradient-to-br from-bg-secondary via-bg-tertiary to-bg-primary overflow-hidden">
                      {!thumbErrors[video.id] && video.thumbnailUrl ? (
                        <img
                          src={video.thumbnailUrl}
                          alt={`${video.title} thumbnail`}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={() => setThumbErrors((current) => ({ ...current, [video.id]: true }))}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">No thumbnail</div>
                      )}
                    </div>

                    <div className="flex-1 px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-bold text-text-primary truncate">{video.title || 'Untitled Video'}</h2>
                        <p className="text-xs text-text-muted mt-1">Duration: {formatDuration(video.durationSec)}</p>
                      </div>
                      <Link
                        to={`/watch/${video.id}`}
                        className="inline-flex items-center justify-center px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-lg transition-colors no-underline sm:w-auto w-full"
                      >
                        Watch
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <section className="animate-rise">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/10 via-bg-secondary to-bg-tertiary border border-border p-8 md:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent mb-2">Video Library</p>
          <h1 className="text-3xl md:text-4xl font-black text-text-primary mb-2">Browse and Watch</h1>
          <p className="text-text-secondary max-w-2xl">
            Discover all processed videos. Playback is secured and adaptive by quality.
          </p>
        </div>
      </section>

      <section className="animate-rise-delay-1">
        <div className="rounded-2xl bg-bg-card border border-border p-6 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-text-primary">Available Videos</h2>
              <p className="text-sm text-text-secondary mt-1">Ready and processing videos for all users.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/videos/normal"
                className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-border rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors no-underline"
              >
                Normal Demo
              </Link>
              <button
                type="button"
                onClick={() => fetchVideos(true)}
                disabled={refreshing}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-border rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {error ? <p className="text-sm text-red font-semibold mb-4">{error}</p> : null}
          {loading ? <p className="text-sm text-text-muted">Loading videos...</p> : null}
          {!loading && adaptiveVideos.length === 0 ? (
            <p className="text-sm text-text-muted">No videos available.</p>
          ) : null}

          <div className="grid gap-4">
            {adaptiveVideos.map((video) => {
              const isReady = video.status === 'ready';
              const progress = Math.max(0, Math.min(100, Number(video.progress) || 0));
              return (
                <article
                  key={video.id}
                  className="rounded-xl bg-bg-tertiary/50 border border-border hover:border-border-strong transition-colors overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row">
                    <div className="relative sm:w-52 md:w-64 shrink-0 aspect-video bg-gradient-to-br from-bg-secondary via-bg-tertiary to-bg-primary overflow-hidden">
                      {!thumbErrors[video.id] && video.thumbnailUrl ? (
                        <>
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.18),transparent_62%)]" />
                          <img
                            src={video.thumbnailUrl}
                            alt={`${video.title} thumbnail`}
                            loading="lazy"
                            className="relative z-[1] w-full h-full object-contain p-1.5"
                            onError={() => setThumbErrors((current) => ({ ...current, [video.id]: true }))}
                          />
                          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">No thumbnail</div>
                      )}
                    </div>

                    <div className="flex-1 p-4 sm:p-5 space-y-3">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="font-bold text-text-primary">{video.title || 'Untitled Video'}</h3>
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-white/10 text-text-secondary">
                            {statusLabel(video.status)}
                          </span>
                        </div>
                        <p className="text-xs text-text-muted mt-1">{video.originalName || 'Unknown source'}</p>
                        <p className="text-xs text-text-muted">{formatCreatedAt(video.createdAt)}</p>
                      </div>

                      {video.status === 'processing' ? (
                        <div className="space-y-1">
                          <p className="text-xs text-text-muted">{video.processStep || 'Processing'}</p>
                          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-accent to-blue transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      ) : null}

                      <div className="flex items-center gap-2">
                        {isReady ? (
                          <Link
                            to={`/watch/${video.id}`}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-lg transition-colors no-underline"
                          >
                            Watch
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-border text-text-secondary text-sm font-semibold rounded-lg">
                            Processing
                          </span>
                        )}
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

export default VideosPage;
