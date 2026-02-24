import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getNormalVideoStream, listVideos } from '../api';

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!total) return 'Duration unavailable';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function NormalWatchPage() {
  const { id } = useParams();

  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Preparing direct video stream...');
  const [title, setTitle] = useState('');
  const [durationSec, setDurationSec] = useState(0);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [relatedVideos, setRelatedVideos] = useState([]);
  const [relatedError, setRelatedError] = useState('');
  const [thumbErrors, setThumbErrors] = useState({});

  const fetchVideo = useCallback(async ({ silent = false } = {}) => {
    if (!id) return;
    if (!silent) {
      setStatus('loading');
      setMessage('Preparing direct video stream...');
    }

    try {
      const { statusCode, payload } = await getNormalVideoStream(id);
      if (statusCode === 202) {
        setStatus('processing');
        setMessage(payload?.processStep || 'Video is still processing.');
        return;
      }

      setTitle(payload.title || `Video ${id}`);
      setDurationSec(Number(payload.durationSec) || 0);
      setThumbnailUrl(payload.thumbnailUrl || '');
      setSourceUrl(payload.sourceUrl || '');
      setStatus('ready');
      setMessage('');
    } catch (error) {
      setStatus('error');
      setMessage(error.message || 'Could not prepare normal video stream.');
    }
  }, [id]);

  const fetchRelated = useCallback(async () => {
    if (!id) return;
    try {
      const allVideos = await listVideos();
      const next = allVideos
        .filter(
          (video) => video.id !== id && video.status === 'ready' && (video.playbackType || 'adaptive') === 'normal'
        )
        .slice(0, 20);
      setRelatedVideos(next);
      setRelatedError('');
      setThumbErrors({});
    } catch (error) {
      setRelatedError(error.message || 'Could not load more videos.');
    }
  }, [id]);

  useEffect(() => {
    fetchVideo();
    fetchRelated();
  }, [fetchVideo, fetchRelated]);

  useEffect(() => {
    if (status !== 'processing') return undefined;
    const timer = window.setInterval(() => {
      fetchVideo({ silent: true });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [status, fetchVideo]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="space-y-5">
          <div className="rounded-2xl bg-bg-card border border-border overflow-hidden">
            {status === 'loading' ? (
              <div className="aspect-video bg-bg-secondary flex items-center justify-center text-sm text-text-muted">
                {message}
              </div>
            ) : null}

            {status === 'processing' ? (
              <div className="aspect-video bg-bg-secondary flex items-center justify-center px-4">
                <p className="text-sm text-text-secondary">{message}</p>
              </div>
            ) : null}

            {status === 'error' ? (
              <div className="aspect-video bg-bg-secondary flex flex-col items-center justify-center gap-3 px-4">
                <p className="text-sm text-red font-semibold">{message}</p>
                <button
                  type="button"
                  onClick={fetchVideo}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-lg transition-colors border-none cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : null}

            {status === 'ready' ? (
              <video
                key={sourceUrl}
                src={sourceUrl}
                poster={thumbnailUrl || undefined}
                controls
                playsInline
                preload="metadata"
                className="w-full aspect-video bg-black"
                onCanPlay={() => setMessage('')}
                onError={() => setMessage('Playback failed. Check video format/browser support.')}
              />
            ) : null}
          </div>

          <div className="rounded-2xl bg-bg-card border border-border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black text-text-primary">{title || `Video ${id}`}</h1>
                <p className="text-sm text-text-secondary mt-1">Duration: {formatDuration(durationSec)}</p>
                <p className="text-xs text-text-muted font-mono mt-1 break-all">ID: {id}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-blue/15 text-blue">
                  Normal
                </span>
                <Link
                  to="/videos/normal"
                  className="inline-flex items-center px-3 py-2 bg-white/5 hover:bg-white/10 border border-border text-text-secondary text-sm font-semibold rounded-lg transition-colors no-underline"
                >
                  Back to List
                </Link>
              </div>
            </div>
            {message && status === 'ready' ? (
              <p className="mt-3 text-xs text-text-muted">{message}</p>
            ) : null}
          </div>
        </section>

        <aside>
          <div className="rounded-2xl bg-bg-card border border-border p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">More Normal Videos</h2>
              <button
                type="button"
                onClick={fetchRelated}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/5 hover:bg-white/10 border border-border text-text-secondary cursor-pointer"
              >
                Refresh
              </button>
            </div>

            {relatedError ? <p className="text-sm text-red font-semibold mb-3">{relatedError}</p> : null}
            {!relatedError && relatedVideos.length === 0 ? (
              <p className="text-sm text-text-muted">No other normal videos available.</p>
            ) : null}

            <div className="space-y-3">
              {relatedVideos.map((video) => (
                <article
                  key={video.id}
                  className="rounded-xl bg-bg-tertiary/50 border border-border/70 hover:border-border-strong transition-all overflow-hidden"
                >
                  <div className="flex gap-3 p-2">
                    <div className="w-32 sm:w-40 aspect-video rounded-lg overflow-hidden bg-bg-secondary shrink-0">
                      {!thumbErrors[video.id] && video.thumbnailUrl ? (
                        <img
                          src={video.thumbnailUrl}
                          alt={`${video.title} thumbnail`}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={() => setThumbErrors((current) => ({ ...current, [video.id]: true }))}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-text-muted">No thumbnail</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 flex flex-col justify-between gap-2 py-0.5">
                      <div>
                        <p className="text-sm font-semibold text-text-primary line-clamp-2">
                          {video.title || 'Untitled Video'}
                        </p>
                        <p className="mt-1 text-xs text-text-muted">Duration: {formatDuration(video.durationSec)}</p>
                      </div>
                      <Link
                        to={`/watch-normal/${video.id}`}
                        className="inline-flex w-fit items-center justify-center px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-lg transition-colors no-underline"
                      >
                        Watch
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default NormalWatchPage;
