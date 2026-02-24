import { useCallback, useEffect, useRef, useState } from 'react';

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
);
const VolumeHighIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
);
const VolumeMuteIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
);
const VolumeLowIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" /></svg>
);
const FullscreenIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
);
const FullscreenExitIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
);
const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg>
);
const PipIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.98 2 1.98h18c1.1 0 2-.88 2-1.98V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z" /></svg>
);
const ReplayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
);
const ForwardIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" /></svg>
);
const TheaterIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8z" /></svg>
);
const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" /></svg>
);
const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
);

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VideoPlayer({
  videoRef: externalVideoRef,
  streamUrl,
  title,
  posterUrl,
  onTheaterToggle,
  isTheaterMode = false,
  qualityOptions = [],
  selectedQuality = -1,
  onQualityChange,
  timeline = null
}) {
  const containerRef = useRef(null);
  const internalVideoRef = useRef(null);
  const videoRef = externalVideoRef || internalVideoRef;
  const progressRef = useRef(null);
  const hideControlsTimeout = useRef(null);
  const resumeAfterScrubRef = useRef(false);
  const seekFrameRef = useRef(0);
  const pendingSeekTimeRef = useRef(null);
  const suppressSurfaceTapRef = useRef(false);
  const orientationLockedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState('root');
  const [hasStarted, setHasStarted] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(null);
  const [hoverPreview, setHoverPreview] = useState(null);
  const [isTouchMode, setIsTouchMode] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setIsTouchMode(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    setIsEnded(false);
    setHasStarted(false);
    setIsBuffering(false);
    setCurrentTime(0);
    setDuration(0);
    setIsScrubbing(false);
    setScrubTime(null);
    setHoverPreview(null);
  }, [streamUrl]);

  const scheduleHide = useCallback(
    (forceShow = true) => {
      clearTimeout(hideControlsTimeout.current);
      if (forceShow) {
        setShowControls(true);
      }
      if (!isPlaying || isScrubbing || showSettings) {
        return;
      }

      hideControlsTimeout.current = setTimeout(() => {
        setShowControls(false);
        setShowSettings(false);
      }, isTouchMode ? 1800 : 2800);
    },
    [isPlaying, isScrubbing, showSettings, isTouchMode]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      setHasStarted(true);
      setIsEnded(false);
      setIsBuffering(false);
    };
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      if (!isScrubbing) {
        setCurrentTime(video.currentTime);
      }
    };
    const onDurationChange = () => setDuration(video.duration);
    const onProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setIsEnded(true);
      setShowControls(true);
      setShowSettings(false);
      setIsBuffering(false);
    };
    const onWaiting = () => {
      if (!video.ended) {
        setIsBuffering(true);
      }
    };
    const onCanPlay = () => setIsBuffering(false);
    const onPlaying = () => setIsBuffering(false);
    const onStalled = () => setIsBuffering(true);
    const onSeeking = () => setIsBuffering(true);
    const onSeeked = () => setIsBuffering(false);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('progress', onProgress);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('ended', onEnded);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('stalled', onStalled);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('seeked', onSeeked);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('stalled', onStalled);
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [videoRef, isScrubbing]);

  useEffect(() => {
    function handleKeyDown(e) {
      const video = videoRef.current;
      if (!video) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          video.paused ? video.play() : video.pause();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          video.muted = !video.muted;
          break;
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          break;
        case 'j':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case 'l':
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 10);
          break;
        case 't':
          e.preventDefault();
          onTheaterToggle?.();
          break;
        default:
          break;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [videoRef, onTheaterToggle]);

  useEffect(() => {
    if (!isPlaying) {
      clearTimeout(hideControlsTimeout.current);
      setShowControls(true);
      return;
    }
    scheduleHide(false);
    return () => clearTimeout(hideControlsTimeout.current);
  }, [isPlaying, isScrubbing, showSettings, scheduleHide]);

  useEffect(() => {
    if (!showSettings) {
      setSettingsView('root');
    }
  }, [showSettings]);

  useEffect(() => {
    function onFullscreenChange() {
      const full = !!document.fullscreenElement;
      setIsFullscreen(full);
      if (full) {
        scheduleHide(true);
        void tryLockLandscapeOrientation();
      } else {
        tryUnlockOrientation();
      }
    }

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [scheduleHide]);

  useEffect(() => {
    return () => {
      tryUnlockOrientation();
      clearTimeout(hideControlsTimeout.current);
      if (seekFrameRef.current) {
        cancelAnimationFrame(seekFrameRef.current);
        seekFrameRef.current = 0;
      }
      pendingSeekTimeRef.current = null;
      resumeAfterScrubRef.current = false;
      suppressSurfaceTapRef.current = false;
    };
  }, []);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;

    if (isEnded) {
      video.currentTime = 0;
      video.play();
      setIsEnded(false);
      setHasStarted(true);
      return;
    }

    if (video.paused) {
      video.play();
      setHasStarted(true);
    } else {
      video.pause();
    }
  }

  async function tryLockLandscapeOrientation() {
    if (!isTouchMode) return;
    const orientation = window.screen?.orientation;
    if (!orientation?.lock) return;

    try {
      await orientation.lock('landscape');
      orientationLockedRef.current = true;
    } catch {
      // Ignore unsupported or denied orientation lock.
    }
  }

  function tryUnlockOrientation() {
    if (!orientationLockedRef.current) return;
    orientationLockedRef.current = false;
    const orientation = window.screen?.orientation;
    if (!orientation?.unlock) return;
    try {
      orientation.unlock();
    } catch {
      // Ignore unsupported unlock behavior.
    }
  }

  async function toggleFullscreen() {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container && !video) return;

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore exit failures.
      }
      tryUnlockOrientation();
      return;
    }

    if (container?.requestFullscreen) {
      try {
        await container.requestFullscreen();
      } catch {
        return;
      }
      await tryLockLandscapeOrientation();
      return;
    }

    if (video?.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }

  function handleVolumeChange(e) {
    const video = videoRef.current;
    if (!video) return;
    const val = parseFloat(e.target.value);
    video.volume = val;
    video.muted = val === 0;
  }

  function skip(seconds) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
    scheduleHide(false);
  }

  function togglePip() {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    } else {
      video.requestPictureInPicture?.();
    }
  }

  function getProgressMetricsFromClientX(clientX) {
    const bar = progressRef.current;
    const video = videoRef.current;
    if (!bar || !video) return null;

    const rect = bar.getBoundingClientRect();
    const width = rect.width || 1;
    const clampedX = Math.max(rect.left, Math.min(clientX, rect.right));
    const percent = (clampedX - rect.left) / width;
    const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration;
    const time = Math.max(0, Math.min(total, percent * total));
    return { percent, time };
  }

  function applySeek(clientX) {
    const metrics = getProgressMetricsFromClientX(clientX);
    if (!metrics) return;
    const nextTime = metrics.time;

    pendingSeekTimeRef.current = nextTime;
    if (seekFrameRef.current) return;

    seekFrameRef.current = requestAnimationFrame(() => {
      seekFrameRef.current = 0;
      const value = pendingSeekTimeRef.current;
      pendingSeekTimeRef.current = null;
      if (value == null) return;
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = value;
      setCurrentTime(value);
      setScrubTime(value);
    });
  }

  function updatePreviewFromClientX(clientX) {
    if (!timeline?.available) return;
    const metrics = getProgressMetricsFromClientX(clientX);
    if (!metrics) return;

    const maxSecond = Number.isFinite(timeline.maxSecond) ? timeline.maxSecond : Math.floor(metrics.time);
    const second = Math.max(0, Math.min(maxSecond, Math.floor(metrics.time)));
    const url = buildTimelinePreviewUrl(second);

    setHoverPreview({
      time: metrics.time,
      percent: metrics.percent * 100,
      url
    });
  }

  function beginScrub(pointerId, clientX) {
    const video = videoRef.current;
    if (!video) return;

    setIsScrubbing(true);
    setHoverPreview(null);
    setShowControls(true);
    setShowSettings(false);
    suppressSurfaceTapRef.current = true;
    resumeAfterScrubRef.current = !video.paused && !video.ended;
    if (resumeAfterScrubRef.current) {
      video.pause();
    }
    progressRef.current?.setPointerCapture?.(pointerId);
    updatePreviewFromClientX(clientX);
    applySeek(clientX);
  }

  function endScrub(pointerId, clientX) {
    const video = videoRef.current;
    if (!video) return;

    applySeek(clientX);
    setIsScrubbing(false);
    setScrubTime(null);
    setHoverPreview(null);
    progressRef.current?.releasePointerCapture?.(pointerId);

    if (resumeAfterScrubRef.current) {
      video.play().catch(() => { });
    }
    resumeAfterScrubRef.current = false;
    setTimeout(() => {
      suppressSurfaceTapRef.current = false;
    }, 0);
    scheduleHide(false);
  }

  function handleProgressPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    beginScrub(e.pointerId, e.clientX);
  }

  function handleProgressPointerMove(e) {
    if (!isScrubbing) return;
    e.preventDefault();
    e.stopPropagation();
    updatePreviewFromClientX(e.clientX);
    applySeek(e.clientX);
  }

  function handleProgressPointerUp(e) {
    if (!isScrubbing) return;
    e.preventDefault();
    e.stopPropagation();
    endScrub(e.pointerId, e.clientX);
  }

  function handleProgressPointerCancel(e) {
    if (!isScrubbing) return;
    e.preventDefault();
    e.stopPropagation();
    endScrub(e.pointerId, e.clientX);
  }

  function buildTimelinePreviewUrl(second) {
    if (!timeline?.available || !timeline?.frameUrlPattern) return '';
    const maxSecond = Number.isFinite(timeline.maxSecond) ? timeline.maxSecond : second;
    const clampedSecond = Math.max(0, Math.min(second, maxSecond));
    return timeline.frameUrlPattern.replace('{second}', String(clampedSecond));
  }

  function handleProgressMouseMove(e) {
    if (isTouchMode || isScrubbing || !timeline?.available) return;
    updatePreviewFromClientX(e.clientX);
  }

  function handleProgressMouseLeave() {
    setHoverPreview(null);
  }

  function handleSurfaceTap(e) {
    if (suppressSurfaceTapRef.current) {
      return;
    }

    const target = e.target;
    if (target instanceof HTMLElement) {
      if (
        target.closest('.video-control-bar') ||
        target.closest('.settings-popup') ||
        target.closest('.video-progress-container') ||
        target.closest('.big-play-button')
      ) {
        return;
      }
    }

    if (isTouchMode && isPlaying) {
      if (showControls) {
        setShowControls(false);
        setShowSettings(false);
      } else {
        scheduleHide(true);
      }
      return;
    }

    togglePlay();
  }

  const onUserActivity = useCallback(() => {
    if (isPlaying) {
      scheduleHide(true);
    }
  }, [isPlaying, scheduleHide]);

  const displayedTime = isScrubbing && scrubTime != null ? scrubTime : currentTime;
  const progress = duration > 0 ? (displayedTime / duration) * 100 : 0;
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;
  const playbackSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const currentPlaybackRate = videoRef.current?.playbackRate || 1;
  const currentQualityLabel =
    selectedQuality === -1
      ? 'Auto'
      : qualityOptions.find((option) => option.value === selectedQuality)?.label || 'Auto';
  const speedLabel = currentPlaybackRate === 1 ? 'Normal' : `${currentPlaybackRate}x`;

  const VolumeIcon =
    isMuted || volume === 0 ? VolumeMuteIcon : volume < 0.5 ? VolumeLowIcon : VolumeHighIcon;

  return (
    <div
      ref={containerRef}
      className={`video-player-container ${isTheaterMode ? 'theater-mode' : ''}`}
      onClick={handleSurfaceTap}
      onMouseMove={() => {
        if (!isTouchMode) onUserActivity();
      }}
      onMouseLeave={() => {
        if (!isTouchMode && isPlaying && !isScrubbing && !showSettings) {
          setShowControls(false);
        }
      }}
      onDoubleClick={toggleFullscreen}
    >
      <video
        ref={videoRef}
        playsInline
        poster={posterUrl || undefined}
      />

      {isBuffering && hasStarted && !isEnded ? (
        <div className="video-buffering-indicator" aria-label="Buffering">
          <div className="video-buffering-spinner" />
        </div>
      ) : null}

      {(!hasStarted || isEnded) && !isPlaying && (
        <button
          className="big-play-button"
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          aria-label={isEnded ? 'Replay' : 'Play'}
        >
          {isEnded ? <ReplayIcon /> : <PlayIcon />}
        </button>
      )}

      <div className={`video-controls-overlay ${showControls ? 'visible' : ''}`}>
        {title && <div className="video-title-overlay">{title}</div>}

        <div onClick={(e) => e.stopPropagation()}>
          <div
            ref={progressRef}
            className={`video-progress-container ${isScrubbing ? 'scrubbing' : ''}`}
            onPointerDown={handleProgressPointerDown}
            onPointerMove={handleProgressPointerMove}
            onPointerUp={handleProgressPointerUp}
            onPointerCancel={handleProgressPointerCancel}
            onMouseMove={handleProgressMouseMove}
            onMouseLeave={handleProgressMouseLeave}
          >
            {hoverPreview?.url ? (
              <div className="video-progress-preview" style={{ left: `${hoverPreview.percent}%` }}>
                <img src={hoverPreview.url} alt="Timeline preview" className="video-progress-preview-image" />
                <span className="video-progress-preview-time">{formatTime(hoverPreview.time)}</span>
              </div>
            ) : null}
            <div className="video-progress-buffered" style={{ width: `${bufferedProgress}%` }} />
            <div className="video-progress-filled" style={{ width: `${progress}%` }} />
            <div className="video-progress-thumb" style={{ left: `${progress}%` }} />
          </div>

          <div className="video-control-bar">
            <button onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isEnded ? <ReplayIcon /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>

            <button className="video-skip-button" onClick={() => skip(-10)} aria-label="Rewind 10s" style={{ transform: 'scaleX(-1)' }}>
              <ForwardIcon />
            </button>

            <button className="video-skip-button" onClick={() => skip(10)} aria-label="Forward 10s">
              <ForwardIcon />
            </button>

            <div className="volume-group flex items-center">
              <button onClick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>
                <VolumeIcon />
              </button>
              <div className="volume-slider-wrapper">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  aria-label="Volume"
                />
              </div>
            </div>

            <span className="video-time-display">
              {formatTime(displayedTime)} / {formatTime(duration)}
            </span>

            <div className="flex-1" />

            <div className="relative">
              <button
                onClick={() => {
                  setShowSettings((prev) => {
                    if (prev) {
                      return false;
                    }
                    setSettingsView('root');
                    return true;
                  });
                }}
                aria-label="Settings"
              >
                <SettingsIcon />
              </button>
              {showSettings && (
                <div className="settings-popup" id="settings-popup">
                  {settingsView === 'root' ? (
                    <>
                      <div
                        className={`settings-popup-item ${qualityOptions.length > 0 ? '' : 'disabled'}`}
                        onClick={() => {
                          if (qualityOptions.length > 0) {
                            setSettingsView('quality');
                          }
                        }}
                      >
                        <span>Quality</span>
                        <span className="settings-item-value">
                          {currentQualityLabel}
                          <ChevronRightIcon />
                        </span>
                      </div>
                      <div
                        className="settings-popup-item"
                        onClick={() => {
                          setSettingsView('speed');
                        }}
                      >
                        <span>Playback Speed</span>
                        <span className="settings-item-value">
                          {speedLabel}
                          <ChevronRightIcon />
                        </span>
                      </div>
                    </>
                  ) : null}

                  {settingsView === 'speed' ? (
                    <>
                      <div className="settings-popup-item" onClick={() => setSettingsView('root')}>
                        <span className="settings-item-value">
                          <ChevronLeftIcon />
                          Back
                        </span>
                      </div>
                      {playbackSpeeds.map((speed) => (
                        <div
                          key={speed}
                          className={`settings-popup-item ${currentPlaybackRate === speed ? 'active' : ''}`}
                          onClick={() => {
                            if (videoRef.current) videoRef.current.playbackRate = speed;
                            setShowSettings(false);
                            scheduleHide(false);
                          }}
                        >
                          {speed === 1 ? 'Normal' : `${speed}x`}
                          {currentPlaybackRate === speed ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                          ) : null}
                        </div>
                      ))}
                    </>
                  ) : null}

                  {settingsView === 'quality' && qualityOptions.length > 0 ? (
                    <>
                      <div className="settings-popup-item" onClick={() => setSettingsView('root')}>
                        <span className="settings-item-value">
                          <ChevronLeftIcon />
                          Back
                        </span>
                      </div>
                      {qualityOptions.map((option) => (
                        <div
                          key={`quality-${option.value}`}
                          className={`settings-popup-item ${selectedQuality === option.value ? 'active' : ''}`}
                          onClick={() => {
                            onQualityChange?.(option.value);
                            setShowSettings(false);
                            scheduleHide(false);
                          }}
                        >
                          {option.label}
                          {selectedQuality === option.value ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                          ) : null}
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
              )}
            </div>

            <button className="desktop-only" onClick={togglePip} aria-label="Picture in Picture">
              <PipIcon />
            </button>

            {onTheaterToggle && (
              <button className="desktop-only" onClick={onTheaterToggle} aria-label="Theater Mode">
                <TheaterIcon />
              </button>
            )}

            <button onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
              {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
