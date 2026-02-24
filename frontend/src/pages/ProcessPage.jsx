import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getUploadStatus } from '../api';

const PIPELINE_STEPS = [
  { label: 'Upload accepted', icon: '📤', minProgress: 0 },
  { label: 'Source inspection', icon: '🔍', minProgress: 5 },
  { label: 'Adaptive transcoding', icon: '⚡', minProgress: 10 },
  { label: 'HLS packaging', icon: '📦', minProgress: 90 },
  { label: 'Ready for playback', icon: '🎬', minProgress: 100 }
];

function ProcessPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const pollTimerRef = useRef(null);
  const redirectScheduledRef = useRef(false);

  const [state, setState] = useState({
    title: '',
    playbackType: 'adaptive',
    status: 'processing',
    progress: 0,
    processStep: 'Initializing',
    error: null
  });
  const [error, setError] = useState('');

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!id) return;
    try {
      const payload = await getUploadStatus(id);
      setState({
        title: payload.title || '',
        playbackType: payload.playbackType || 'adaptive',
        status: payload.status,
        progress: Number(payload.progress) || 0,
        processStep: payload.processStep || 'Processing',
        error: payload.error || null
      });
      setError('');

      if (payload.status === 'ready') {
        stopPolling();
        if (!redirectScheduledRef.current) {
          redirectScheduledRef.current = true;
          const targetPath = (payload.playbackType || 'adaptive') === 'normal' ? `/watch-normal/${id}` : `/watch/${id}`;
          window.setTimeout(() => navigate(targetPath), 1500);
        }
      }
      if (payload.status === 'failed') {
        stopPolling();
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [id, navigate, stopPolling]);

  useEffect(() => {
    fetchStatus();
    pollTimerRef.current = window.setInterval(fetchStatus, 1500);
    return () => stopPolling();
  }, [fetchStatus, stopPolling]);

  const normalizedProgress = Math.max(0, Math.min(100, Math.round(state.progress || 0)));
  const isReady = state.status === 'ready';
  const isFailed = state.status === 'failed';

  return (
    <main className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl animate-rise">
        <div className="rounded-2xl bg-bg-card border border-border p-8 md:p-10">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-accent/10 text-accent text-xs font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-full mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Processing Pipeline
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-text-primary mb-2">
              {state.title || `Video ${id}`}
            </h1>
            <p className="text-sm text-text-secondary">
              Transcoding is running in the background. This page updates automatically.
            </p>
          </div>

          {/* Progress Ring + Bar */}
          <div className="flex flex-col items-center gap-6 mb-8">
            {/* Progress percentage */}
            <div className="relative">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60" cy="60" r="52"
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="8"
                />
                <circle
                  cx="60" cy="60" r="52"
                  fill="none"
                  stroke={isReady ? '#22c55e' : isFailed ? '#ef4444' : '#8b5cf6'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  strokeDashoffset={`${2 * Math.PI * 52 * (1 - normalizedProgress / 100)}`}
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-black ${isReady ? 'text-green' : isFailed ? 'text-red' : 'text-text-primary'
                  }`}>
                  {normalizedProgress}%
                </span>
                <span className="text-[10px] text-text-muted font-semibold uppercase tracking-wider mt-0.5">
                  {isReady ? 'Complete' : isFailed ? 'Failed' : 'Progress'}
                </span>
              </div>
            </div>

            {/* Current step */}
            <div className="text-center">
              <p className="text-sm font-semibold text-text-secondary">{state.processStep}</p>
            </div>

            {/* Linear progress bar */}
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${isReady
                    ? 'bg-gradient-to-r from-green to-green-hover'
                    : isFailed
                      ? 'bg-gradient-to-r from-red to-red-hover'
                      : 'bg-gradient-to-r from-accent to-blue'
                  }`}
                style={{ width: `${normalizedProgress}%` }}
              />
            </div>
          </div>

          {/* Pipeline steps */}
          <div className="space-y-1 mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-text-muted mb-3">Pipeline Steps</p>
            {PIPELINE_STEPS.map((item, idx) => {
              const done = normalizedProgress >= item.minProgress || isReady;
              const isCurrent = !done && (idx === 0 || normalizedProgress >= PIPELINE_STEPS[idx - 1]?.minProgress);

              return (
                <div
                  key={item.label}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 ${done
                      ? 'bg-green/5'
                      : isCurrent
                        ? 'bg-accent/5 border border-accent/20'
                        : 'opacity-40'
                    }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 ${done
                      ? 'bg-green/15'
                      : isCurrent
                        ? 'bg-accent/15'
                        : 'bg-white/5'
                    }`}>
                    {done ? (
                      <svg className="w-4 h-4 text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isCurrent ? (
                      <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    ) : (
                      <span className="text-xs">{item.icon}</span>
                    )}
                  </div>
                  <span className={`text-sm font-semibold ${done ? 'text-green' : isCurrent ? 'text-accent' : 'text-text-muted'
                    }`}>
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Status messages */}
          {isReady && (
            <div className="flex items-center gap-2 bg-green/10 border border-green/20 rounded-xl px-4 py-3 mb-6 animate-fade-in">
              <svg className="w-5 h-5 text-green shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-green font-semibold">Processing complete! Opening player...</p>
            </div>
          )}

          {isFailed && (
            <div className="flex items-center gap-2 bg-red/10 border border-red/20 rounded-xl px-4 py-3 mb-6 animate-fade-in">
              <svg className="w-5 h-5 text-red shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red font-semibold">{state.error || 'Processing failed. Try uploading again.'}</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red/10 border border-red/20 rounded-xl px-4 py-3 mb-6">
              <p className="text-sm text-red font-semibold">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {isReady ? (
              <button
                type="button"
                onClick={() => navigate(state.playbackType === 'normal' ? `/watch-normal/${id}` : `/watch/${id}`)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-accent/20 border-none cursor-pointer"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Go to Player
              </button>
            ) : (
              <button
                type="button"
                onClick={fetchStatus}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-border text-text-secondary font-semibold rounded-xl transition-all duration-200 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Progress
              </button>
            )}
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-border text-text-secondary font-semibold rounded-xl transition-all duration-200 no-underline"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default ProcessPage;
