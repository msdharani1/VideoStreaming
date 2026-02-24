import Hls from 'hls.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getVideoStream } from '../api';
import VideoPlayer from '../components/VideoPlayer';

function extractToken(streamUrl) {
  try {
    const parsed = new URL(streamUrl);
    return parsed.searchParams.get('token') || '';
  } catch {
    return '';
  }
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
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [levels, setLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [isTheaterMode, setIsTheaterMode] = useState(false);

  const currentToken = useMemo(() => extractToken(streamUrl), [streamUrl]);

  const destroyPlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

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

        setTitle(payload.title || `Video ${id}`);
        setThumbnailUrl(payload.thumbnailUrl || '');
        setStatus('ready');
        setMessage('');
        setStreamUrl(payload.streamUrl);
      } catch (error) {
        setStatus('error');
        setMessage(error.message || 'Could not fetch stream URL.');
      }
    },
    [id, navigate]
  );

  useEffect(() => {
    fetchStream();
    return () => destroyPlayer();
  }, [fetchStream, destroyPlayer]);

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
          setMessage('Refreshing token...');
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
    <main className={`transition-all duration-300 ${isTheaterMode ? 'px-0' : 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8'} py-6`}>
      <div className="animate-rise space-y-6">
        {/* Player */}
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

          {status === 'ready' && (
            <VideoPlayer
              videoRef={videoRef}
              streamUrl={streamUrl}
              title={title}
              posterUrl={thumbnailUrl}
              isTheaterMode={isTheaterMode}
              onTheaterToggle={() => setIsTheaterMode(!isTheaterMode)}
            />
          )}
        </div>

        {/* Video Info */}
        <div className={`${isTheaterMode ? 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8' : ''}`}>
          <div className="rounded-2xl bg-bg-card border border-border p-6">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="space-y-2">
                <h1 className="text-2xl font-black text-text-primary">{title || `Video ${id}`}</h1>
                <p className="text-xs text-text-muted font-mono">ID: {id}</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Quality selector */}
                {levels.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Quality</label>
                    <div className="flex gap-1">
                      <button
                        onClick={() => onLevelChange(-1)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${selectedLevel === -1
                            ? 'bg-accent/15 text-accent border-accent/30'
                            : 'bg-white/5 text-text-secondary border-border hover:bg-white/10'
                          }`}
                      >
                        Auto
                      </button>
                      {levels.map((level) => (
                        <button
                          key={level.index}
                          onClick={() => onLevelChange(level.index)}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${selectedLevel === level.index
                              ? 'bg-accent/15 text-accent border-accent/30'
                              : 'bg-white/5 text-text-secondary border-border hover:bg-white/10'
                            }`}
                        >
                          {level.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => fetchStream({ preservePosition: true })}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-border text-text-secondary text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh Token
                </button>

                <Link
                  to="/"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-border text-text-secondary text-sm font-semibold rounded-lg transition-all duration-200 no-underline"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  Back to Home
                </Link>
              </div>
            </div>

            {/* Keyboard shortcuts */}
            <div className="mt-6 pt-4 border-t border-border">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Keyboard Shortcuts</p>
              <div className="flex flex-wrap gap-3">
                {[
                  ['Space/K', 'Play/Pause'],
                  ['F', 'Fullscreen'],
                  ['M', 'Mute'],
                  ['J/←', 'Rewind'],
                  ['L/→', 'Forward'],
                  ['↑/↓', 'Volume'],
                  ['T', 'Theater'],
                ].map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1.5 text-xs text-text-muted">
                    <kbd className="px-1.5 py-0.5 bg-white/5 border border-border rounded text-[10px] font-mono font-bold text-text-secondary">
                      {key}
                    </kbd>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default WatchPage;
