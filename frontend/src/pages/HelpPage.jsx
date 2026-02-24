import { Link } from 'react-router-dom';

const SHORTCUTS = [
  ['Space / K', 'Play or pause video'],
  ['F', 'Toggle fullscreen'],
  ['M', 'Mute or unmute'],
  ['J / Left Arrow', 'Rewind 10s / 5s'],
  ['L / Right Arrow', 'Forward 10s / 5s'],
  ['Up / Down Arrow', 'Increase or decrease volume'],
  ['T', 'Toggle theater mode']
];

export default function HelpPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <section className="animate-rise rounded-2xl bg-gradient-to-br from-accent/10 via-bg-secondary to-bg-tertiary border border-border p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent mb-2">Player Help</p>
        <h1 className="text-3xl font-black text-text-primary">Keyboard and Playback Guide</h1>
        <p className="text-sm text-text-secondary mt-2">
          Use this page for shortcuts, quality control location, and playback behavior.
        </p>
      </section>

      <section className="animate-rise-delay-1 rounded-2xl bg-bg-card border border-border p-6">
        <h2 className="text-lg font-bold text-text-primary mb-4">Keyboard Shortcuts</h2>
        <div className="grid gap-2">
          {SHORTCUTS.map(([key, action]) => (
            <div key={key} className="flex items-center justify-between gap-3 rounded-lg bg-bg-tertiary/50 border border-border px-4 py-2.5">
              <kbd className="px-2 py-1 bg-white/5 border border-border rounded text-xs font-mono font-bold text-text-secondary">
                {key}
              </kbd>
              <span className="text-sm text-text-secondary">{action}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="animate-rise-delay-2 rounded-2xl bg-bg-card border border-border p-6 space-y-3">
        <h2 className="text-lg font-bold text-text-primary">Player Notes</h2>
        <p className="text-sm text-text-secondary">
          Video quality selection is available inside the player settings menu.
        </p>
        <p className="text-sm text-text-secondary">
          On mobile, tap once to show controls and tap again to hide controls while video is playing.
        </p>
        <Link
          to="/videos"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-border text-text-secondary text-sm font-semibold rounded-lg transition-all duration-200 no-underline"
        >
          Back to Videos
        </Link>
      </section>
    </main>
  );
}
