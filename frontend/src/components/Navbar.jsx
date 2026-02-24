import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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

const MenuIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

function NavItem({ to, active, children, mobile = false, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`${mobile ? 'block w-full px-4 py-3 rounded-xl' : 'px-4 py-2 rounded-lg'} text-sm font-semibold transition-all duration-200 no-underline ${
        active ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
      }`}
    >
      {children}
    </Link>
  );
}

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin, isGuest, user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;

    const onEscape = (event) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onEscape);
    };
  }, [mobileOpen]);

  function handleLogout() {
    setMobileOpen(false);
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <nav className="sticky top-0 z-50 glass-panel border-b border-white/5" id="main-navbar">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to={isAuthenticated ? (isAdmin ? '/admin' : '/videos') : '/login'} className="flex items-center gap-3 group no-underline">
              <div className="transition-transform duration-300 group-hover:scale-110">
                <Logo />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight text-text-primary">PrimeView</span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Video Platform</span>
              </div>
            </Link>

            <div className="hidden md:flex items-center gap-2">
              {isAuthenticated ? (
                <>
                  <NavItem
                    to="/videos"
                    active={
                      (location.pathname.startsWith('/videos') && !location.pathname.startsWith('/videos/normal'))
                      || (location.pathname.startsWith('/watch') && !location.pathname.startsWith('/watch-normal'))
                    }
                  >
                    Videos
                  </NavItem>
                  <NavItem to="/videos/normal" active={location.pathname.startsWith('/videos/normal') || location.pathname.startsWith('/watch-normal')}>
                    Normal Demo
                  </NavItem>
                  <NavItem to="/help" active={location.pathname.startsWith('/help')}>
                    Help
                  </NavItem>
                  {isAdmin ? (
                    <NavItem to="/admin" active={location.pathname.startsWith('/admin') || location.pathname.startsWith('/process')}>
                      Admin
                    </NavItem>
                  ) : null}
                  {isGuest ? (
                    <NavItem to="/login" active={location.pathname.startsWith('/login')}>
                      Sign In
                    </NavItem>
                  ) : null}
                  <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-white/5 text-text-secondary">
                    {user?.role === 'guest' ? 'Guest (watch only)' : `${user?.email} (${user?.role})`}
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-3 py-2 rounded-lg text-sm font-semibold bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary border-none cursor-pointer"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <NavItem to="/login" active={location.pathname.startsWith('/login')}>
                  Login
                </NavItem>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen((current) => !current)}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 text-text-primary border border-border/50 transition-colors cursor-pointer"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
            >
              {mobileOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
      </nav>

      <div
        className={`md:hidden fixed inset-0 z-[60] transition-opacity duration-300 ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/55"
          aria-label="Close menu overlay"
          onClick={() => setMobileOpen(false)}
        />

        <aside
          id="mobile-nav-drawer"
          className={`absolute right-0 top-0 h-full w-[82vw] max-w-[320px] bg-bg-card/95 backdrop-blur-xl border-l border-border shadow-2xl transition-transform duration-300 ease-out ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
          <div className="h-16 px-4 border-b border-border flex items-center justify-between">
            <span className="text-sm font-bold text-text-primary">Menu</span>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-text-primary border border-border/50 transition-colors cursor-pointer"
              aria-label="Close menu"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="h-[calc(100%-4rem)] flex flex-col justify-between">
            <div className="p-4 space-y-2">
              {isAuthenticated ? (
                <>
                  <NavItem
                    to="/videos"
                    mobile
                    onClick={() => setMobileOpen(false)}
                    active={
                      (location.pathname.startsWith('/videos') && !location.pathname.startsWith('/videos/normal'))
                      || (location.pathname.startsWith('/watch') && !location.pathname.startsWith('/watch-normal'))
                    }
                  >
                    Videos
                  </NavItem>
                  <NavItem
                    to="/videos/normal"
                    mobile
                    onClick={() => setMobileOpen(false)}
                    active={location.pathname.startsWith('/videos/normal') || location.pathname.startsWith('/watch-normal')}
                  >
                    Normal Demo
                  </NavItem>
                  <NavItem
                    to="/help"
                    mobile
                    onClick={() => setMobileOpen(false)}
                    active={location.pathname.startsWith('/help')}
                  >
                    Help
                  </NavItem>
                  {isAdmin ? (
                    <NavItem
                      to="/admin"
                      mobile
                      onClick={() => setMobileOpen(false)}
                      active={location.pathname.startsWith('/admin') || location.pathname.startsWith('/process')}
                    >
                      Admin
                    </NavItem>
                  ) : null}
                  {isGuest ? (
                    <NavItem
                      to="/login"
                      mobile
                      onClick={() => setMobileOpen(false)}
                      active={location.pathname.startsWith('/login')}
                    >
                      Sign In
                    </NavItem>
                  ) : null}
                </>
              ) : (
                <NavItem
                  to="/login"
                  mobile
                  onClick={() => setMobileOpen(false)}
                  active={location.pathname.startsWith('/login')}
                >
                  Login
                </NavItem>
              )}
            </div>

            {isAuthenticated ? (
              <div className="p-4 border-t border-border space-y-3">
                <div className="px-3 py-2 rounded-lg text-xs font-semibold bg-white/5 text-text-secondary">
                  {user?.role === 'guest' ? 'Guest (watch only)' : `${user?.email} (${user?.role})`}
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary border border-border/70 transition-colors cursor-pointer"
                >
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}
