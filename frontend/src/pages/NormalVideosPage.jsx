import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchVideosOnce, subscribeToVideos } from '../services/videoStore';

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!total) return 'Duration unavailable';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function sortByNewest(a, b) {
  return (b.createdAtMs || 0) - (a.createdAtMs || 0);
}

function NormalVideosPage() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [thumbErrors, setThumbErrors] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeToVideos(
      (allVideos) => {
        const normalVideos = allVideos
          .filter((video) => video.status === 'ready' && (video.playbackType || 'adaptive') === 'normal')
          .sort(sortByNewest);
        setVideos(normalVideos);
        setError('');
        setLoading(false);
      },
      (err) => {
        setError(err?.message || 'Could not load normal videos');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const refreshNow = useCallback(async () => {
    try {
      setRefreshing(true);
      const allVideos = await fetchVideosOnce();
      const normalVideos = allVideos
        .filter((video) => video.status === 'ready' && (video.playbackType || 'adaptive') === 'normal')
        .sort(sortByNewest);
      setVideos(normalVideos);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Could not load normal videos');
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <section className="animate-rise">
        <div className="rounded-2xl bg-bg-card border border-border p-6 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-black text-text-primary">Normal Videos</h1>
              <p className="text-sm text-text-secondary mt-1">
                Browser-native direct video loading without adaptive HLS.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/videos"
                className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-border rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors no-underline"
              >
                Adaptive Videos
              </Link>
              <button
                type="button"
                onClick={refreshNow}
                disabled={refreshing}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-border rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {error ? <p className="text-sm text-red font-semibold mb-4">{error}</p> : null}
          {loading ? <p className="text-sm text-text-muted">Loading videos...</p> : null}
          {!loading && videos.length === 0 ? (
            <p className="text-sm text-text-muted">No normal videos available yet.</p>
          ) : null}

          <div className="space-y-4">
            {videos.map((video) => (
              <article
                key={video.id}
                className="rounded-xl bg-bg-tertiary/50 border border-border overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row">
                  <div className="relative sm:w-52 md:w-64 shrink-0 aspect-video bg-bg-secondary overflow-hidden">
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
                      <h2 className="font-bold text-text-primary">{video.title || 'Untitled Video'}</h2>
                      <p className="text-xs text-text-muted mt-1">{video.originalName || 'Unknown source'}</p>
                      <p className="text-xs text-text-muted mt-1">Duration: {formatDuration(video.durationSec)}</p>
                    </div>
                    <Link
                      to={`/watch-normal/${video.id}`}
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

export default NormalVideosPage;
