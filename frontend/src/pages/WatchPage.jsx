import Hls from 'hls.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getVideoStream, listVideos } from '../api';
import VideoPlayer from '../components/VideoPlayer';

function extractToken(streamUrl) {
  try {
    const parsed = new URL(streamUrl);
    return parsed.searchParams.get('token') || '';
  } catch {
    return '';
  }
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

function WatchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const resumeAtRef = useRef(0);

  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Preparing secure stream URL...');
  const [streamUrl, setStreamUrl] = useState('');
  const [title, setTitle] = useState('');
  const [durationSec, setDurationSec] = useState(0);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [levels, setLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [relatedVideos, setRelatedVideos] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(true);
  const [relatedError, setRelatedError] = useState('');
  const [thumbErrors, setThumbErrors] = useState({});
  const [timeline, setTimeline] = useState({
    available: false,
    generating: false,
    frameCount: 0,
    maxSecond: 0,
    frameUrlPattern: null
  });

  const currentToken = useMemo(() => extractToken(streamUrl), [streamUrl]);

  const qualityOptions = useMemo(
    () => (levels.length > 0
      ? [{ value: -1, label: 'Auto' }, ...levels.map((level) => ({ value: level.index, label: level.label }))]
      : []),
    [levels]
  );

  const destroyPlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  const fetchRelatedVideos = useCallback(async () => {
    if (!id) return;
    setRelatedLoading(true);
    try {
      const allVideos = await listVideos();
      const nextVideos = allVideos
        .filter((video) => video.status === 'ready' && video.id !== id && (video.playbackType || 'adaptive') !== 'normal')
        .slice(0, 20);
      setRelatedVideos(nextVideos);
      setRelatedError('');
      setThumbErrors({});
    } catch (error) {
      setRelatedError(error.message || 'Could not load more videos.');
    } finally {
      setRelatedLoading(false);
    }
  }, [id]);

  const fetchStream = useCallback(
    async ({ preservePosition = false } = {}) => {
      if (!id) return;

      if (preservePosition && videoRef.current) {
        resumeAtRef.current = videoRef.current.currentTime || 0;
      }

      try {
        const { statusCode, payload } = await getVideoStream(id);

        if (statusCode === 202) {
          navigate(`/process/${id}`, { replace: true });
          return;
        }

        if ((payload.playbackType || 'adaptive') === 'normal') {
          navigate(`/watch-normal/${id}`, { replace: true });
          return;
        }

        setTitle(payload.title || `Video ${id}`);
        setDurationSec(Number(payload.durationSec) || 0);
        setThumbnailUrl(payload.thumbnailUrl || '');
        setStatus('ready');
        setMessage('');
        setStreamUrl(payload.streamUrl);
        setTimeline(payload.timeline || {
          available: false,
          generating: false,
          frameCount: 0,
          maxSecond: 0,
          frameUrlPattern: null
        });
      } catch (error) {
        setStatus('error');
        setMessage(error.message || 'Could not fetch stream URL.');
      }
    },
    [id, navigate]
  );

  useEffect(() => {
    fetchStream();
    fetchRelatedVideos();
    return () => destroyPlayer();
  }, [fetchStream, fetchRelatedVideos, destroyPlayer]);

  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;

    const videoEl = videoRef.current;
    destroyPlayer();

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        xhrSetup: (xhr) => {
          if (currentToken) {
            xhr.setRequestHeader('Authorization', `Bearer ${currentToken}`);
          }
        }
      });

      hlsRef.current = hls;
      setSelectedLevel(-1);
      hls.loadSource(streamUrl);
      hls.attachMedia(videoEl);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const nextLevels = hls.levels.map((level, index) => ({
          index,
          label: level.height ? `${level.height}p` : `Level ${index + 1}`
        }));
        setLevels(nextLevels);

        if (resumeAtRef.current > 0) {
          videoEl.currentTime = resumeAtRef.current;
          resumeAtRef.current = 0;
        }
        videoEl.play().catch(() => { });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        setSelectedLevel(data.level);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        const statusCode = data?.response?.code || data?.networkDetails?.status;
        if (statusCode === 401 || statusCode === 403) {
          fetchStream({ preservePosition: true });
          return;
        }
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        setStatus('error');
        setMessage('Playback failed. Refreshing stream...');
        fetchStream({ preservePosition: true });
      });

      return () => hls.destroy();
    }

    setLevels([]);
    videoEl.src = streamUrl;
    videoEl.play().catch(() => { });
    return undefined;
  }, [streamUrl, currentToken, fetchStream, destroyPlayer]);

  function onLevelChange(level) {
    setSelectedLevel(level);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = level;
    }
  }

  return (
    <main className={`transition-all duration-300 overflow-x-hidden ${isTheaterMode ? 'px-0' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'} py-6`}>
      <div className={`animate-rise min-w-0 ${isTheaterMode ? 'space-y-6' : 'grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'}`}>
        <section className="space-y-6 min-w-0">
          <div className={`${isTheaterMode ? '' : 'rounded-2xl overflow-hidden'}`}>
            {status === 'loading' && (
              <div className="aspect-video bg-bg-secondary rounded-2xl flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <svg className="w-10 h-10 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="text-sm text-text-muted">{message}</p>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="aspect-video bg-bg-secondary rounded-2xl flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-center px-4">
                  <svg className="w-12 h-12 text-red/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <p className="text-sm text-red font-semibold">{message}</p>
                  <button
                    onClick={() => fetchStream()}
                    className="mt-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-lg transition-all border-none cursor-pointer"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {status === 'ready' ? (
              <VideoPlayer
                videoRef={videoRef}
                streamUrl={streamUrl}
                title={title}
                posterUrl={thumbnailUrl}
                isTheaterMode={isTheaterMode}
                onTheaterToggle={() => setIsTheaterMode(!isTheaterMode)}
                qualityOptions={qualityOptions}
                selectedQuality={selectedLevel}
                onQualityChange={onLevelChange}
                timeline={timeline}
              />
            ) : null}
          </div>

          <div className={`${isTheaterMode ? 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8' : ''}`}>
            <div className="rounded-2xl bg-bg-card border border-border p-6">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2">
                  <h1 className="text-2xl font-black text-text-primary">{title || `Video ${id}`}</h1>
                  <p className="text-sm text-text-secondary">Duration: {formatDuration(durationSec)}</p>
                  <p className="text-xs text-text-muted font-mono break-all">ID: {id}</p>
                </div>

                <Link
                  to="/help"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-border text-text-secondary text-sm font-semibold rounded-lg transition-all duration-200 no-underline"
                >
                  Player Help
                </Link>
              </div>
            </div>
          </div>
        </section>

        <aside className={`min-w-0 ${isTheaterMode ? 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8' : ''}`}>
          <div className="rounded-2xl bg-bg-card border border-border p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">More Videos</h2>
              <button
                type="button"
                onClick={fetchRelatedVideos}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/5 hover:bg-white/10 border border-border text-text-secondary cursor-pointer"
              >
                Refresh
              </button>
            </div>

            {relatedError ? <p className="text-sm text-red font-semibold mb-3">{relatedError}</p> : null}
            {relatedLoading ? <p className="text-sm text-text-muted">Loading videos...</p> : null}
            {!relatedLoading && relatedVideos.length === 0 ? (
              <p className="text-sm text-text-muted">No other videos available.</p>
            ) : null}

            <div className="space-y-3">
              {relatedVideos.map((video) => (
                <article
                  key={video.id}
                  className="rounded-xl bg-bg-tertiary/50 border border-border/70 hover:border-border-strong transition-all overflow-hidden"
                >
                  <div className="flex gap-3 p-2 min-w-0">
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
                        to={`/watch/${video.id}`}
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

export default WatchPage;
