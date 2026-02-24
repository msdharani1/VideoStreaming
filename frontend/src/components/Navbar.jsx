import { Link, useLocation } from 'react-router-dom';

const Logo = () => (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <defs>
            <linearGradient id="logoGrad" x1="0" y1="0" x2="32" y2="32">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#6d28d9" />
            </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#logoGrad)" />
        <path d="M12 9l10 7-10 7V9z" fill="white" />
    </svg>
);

export default function Navbar() {
    const location = useLocation();
    const isHome = location.pathname === '/';

    return (
        <nav className="sticky top-0 z-50 glass-panel border-b border-white/5" id="main-navbar">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo & Brand */}
                    <Link to="/" className="flex items-center gap-3 group no-underline">
                        <div className="transition-transform duration-300 group-hover:scale-110">
                            <Logo />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-lg font-bold tracking-tight text-text-primary">
                                PrimeView
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                                Video Platform
                            </span>
                        </div>
                    </Link>

                    {/* Nav Links */}
                    <div className="flex items-center gap-2">
                        <Link
                            to="/"
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 no-underline ${isHome
                                    ? 'bg-accent/15 text-accent'
                                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                                }`}
                            id="nav-home"
                        >
                            <span className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                </svg>
                                Home
                            </span>
                        </Link>
                        <Link
                            to="/#upload-section"
                            className="px-4 py-2 rounded-lg text-sm font-semibold text-bg-primary bg-accent hover:bg-accent-hover transition-all duration-200 no-underline"
                            id="nav-upload"
                        >
                            <span className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                Upload
                            </span>
                        </Link>
                    </div>
                </div>
            </div>
        </nav>
    );
}
