import { useCallback, useEffect, useRef, useState } from 'react';

// ─── SVG Icons ───
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
}) {
    const containerRef = useRef(null);
    const internalVideoRef = useRef(null);
    const videoRef = externalVideoRef || internalVideoRef;
    const progressRef = useRef(null);
    const hideControlsTimeout = useRef(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const [isEnded, setIsEnded] = useState(false);

    // ─── Reset ended state on new stream ───
    useEffect(() => {
        setIsEnded(false);
        setHasStarted(false);
        setCurrentTime(0);
        setDuration(0);
    }, [streamUrl]);

    // ─── Video event listeners ───
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onPlay = () => { setIsPlaying(true); setIsEnded(false); };
        const onPause = () => setIsPlaying(false);
        const onTimeUpdate = () => setCurrentTime(video.currentTime);
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
        };

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('durationchange', onDurationChange);
        video.addEventListener('progress', onProgress);
        video.addEventListener('volumechange', onVolumeChange);
        video.addEventListener('ended', onEnded);

        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('durationchange', onDurationChange);
            video.removeEventListener('progress', onProgress);
            video.removeEventListener('volumechange', onVolumeChange);
            video.removeEventListener('ended', onEnded);
        };
    }, [videoRef]);

    // ─── Keyboard shortcuts ───
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
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [videoRef, onTheaterToggle]);

    // ─── Auto-hide controls ───
    const scheduleHide = useCallback(() => {
        clearTimeout(hideControlsTimeout.current);
        setShowControls(true);
        if (isPlaying) {
            hideControlsTimeout.current = setTimeout(() => {
                setShowControls(false);
                setShowSettings(false);
            }, 3000);
        }
    }, [isPlaying]);

    useEffect(() => {
        if (!isPlaying) {
            setShowControls(true);
            clearTimeout(hideControlsTimeout.current);
        } else {
            scheduleHide();
        }
        return () => clearTimeout(hideControlsTimeout.current);
    }, [isPlaying, scheduleHide]);

    // ─── Fullscreen change listener ───
    useEffect(() => {
        function onFullscreenChange() {
            setIsFullscreen(!!document.fullscreenElement);
        }
        document.addEventListener('fullscreenchange', onFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
    }, []);

    // ─── Actions ───
    function togglePlay() {
        const video = videoRef.current;
        if (!video) return;
        if (isEnded) {
            video.currentTime = 0;
            video.play();
            setIsEnded(false);
            return;
        }
        video.paused ? video.play() : video.pause();
        setHasStarted(true);
    }

    function toggleFullscreen() {
        const container = containerRef.current;
        if (!container) return;
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            container.requestFullscreen();
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

    function handleProgressClick(e) {
        const video = videoRef.current;
        const bar = progressRef.current;
        if (!video || !bar) return;
        const rect = bar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        video.currentTime = percent * video.duration;
    }

    function skip(seconds) {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
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

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

    const VolumeIcon = isMuted || volume === 0
        ? VolumeMuteIcon
        : volume < 0.5
            ? VolumeLowIcon
            : VolumeHighIcon;

    return (
        <div
            ref={containerRef}
            className={`video-player-container ${isTheaterMode ? 'theater-mode' : ''}`}
            onMouseMove={scheduleHide}
            onMouseLeave={() => isPlaying && setShowControls(false)}
        >
            <video
                ref={videoRef}
                playsInline
                poster={posterUrl || undefined}
                onClick={togglePlay}
            />

            {/* Big center play button */}
            {(!hasStarted || isEnded) && !isPlaying && (
                <button className="big-play-button" onClick={togglePlay} aria-label={isEnded ? 'Replay' : 'Play'}>
                    {isEnded ? <ReplayIcon /> : <PlayIcon />}
                </button>
            )}

            {/* Controls overlay */}
            <div className={`video-controls-overlay ${showControls ? 'visible' : ''}`} onClick={(e) => {
                if (e.target === e.currentTarget) togglePlay();
            }}>
                {/* Title */}
                {title && <div className="video-title-overlay">{title}</div>}

                <div onClick={(e) => e.stopPropagation()}>
                    {/* Progress bar */}
                    <div
                        ref={progressRef}
                        className="video-progress-container"
                        onClick={handleProgressClick}
                    >
                        <div className="video-progress-buffered" style={{ width: `${bufferedProgress}%` }} />
                        <div className="video-progress-filled" style={{ width: `${progress}%` }} />
                        <div className="video-progress-thumb" style={{ left: `${progress}%` }} />
                    </div>

                    {/* Control bar */}
                    <div className="video-control-bar">
                        <button onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
                            {isEnded ? <ReplayIcon /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
                        </button>

                        <button onClick={() => skip(-10)} aria-label="Rewind 10s" style={{ transform: 'scaleX(-1)' }}>
                            <ForwardIcon />
                        </button>

                        <button onClick={() => skip(10)} aria-label="Forward 10s">
                            <ForwardIcon />
                        </button>

                        {/* Volume */}
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

                        {/* Time display */}
                        <span className="video-time-display">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </span>

                        {/* Spacer pushes right controls */}
                        <div className="flex-1" />

                        {/* Settings */}
                        <div className="relative">
                            <button onClick={() => setShowSettings(!showSettings)} aria-label="Settings">
                                <SettingsIcon />
                            </button>
                            {showSettings && (
                                <div className="settings-popup" id="settings-popup">
                                    <div className="settings-popup-item" style={{ cursor: 'default', fontWeight: 600 }}>
                                        Playback Speed
                                    </div>
                                    {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
                                        <div
                                            key={speed}
                                            className={`settings-popup-item ${videoRef.current?.playbackRate === speed ? 'active' : ''}`}
                                            onClick={() => {
                                                if (videoRef.current) videoRef.current.playbackRate = speed;
                                                setShowSettings(false);
                                            }}
                                        >
                                            {speed === 1 ? 'Normal' : `${speed}x`}
                                            {videoRef.current?.playbackRate === speed && (
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* PiP */}
                        <button onClick={togglePip} aria-label="Picture in Picture">
                            <PipIcon />
                        </button>

                        {/* Theater */}
                        {onTheaterToggle && (
                            <button onClick={onTheaterToggle} aria-label="Theater Mode">
                                <TheaterIcon />
                            </button>
                        )}

                        {/* Fullscreen */}
                        <button onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
                            {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
