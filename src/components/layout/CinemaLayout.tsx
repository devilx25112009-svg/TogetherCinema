import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bookmark,
  Compass,
  Film,
  Heart,
  Home,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Popcorn,
  Settings,
  UploadCloud,
  User,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface CinemaLayoutProps {
  children: React.ReactNode;
  fullBleed?: boolean;
}

const PRIMARY_NAV = [
  { label: 'Home', to: '/home' },
  { label: '3D Lobby', to: '/lobby' },
  { label: 'Movies', to: '/movies' },
  { label: 'Upload', to: '/upload' },
  { label: 'Rooms', to: '/rooms' },
  { label: 'Memories', to: '/memories' },
];

const SECONDARY_LINKS = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Upload Video', to: '/upload', icon: UploadCloud },
  { label: 'Watchlist', to: '/watchlist', icon: Bookmark },
  { label: 'Food & Snacks', to: '/food', icon: Popcorn },
  { label: 'Chat History', to: '/chat', icon: MessageSquare },
  { label: 'Join Room', to: '/rooms/join', icon: Users },
  { label: 'Profile', to: '/profile', icon: User },
  { label: 'Settings', to: '/settings', icon: Settings },
];

export function CinemaLayout({ children, fullBleed = false }: CinemaLayoutProps) {
  const { user, isDemoSession } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#080810] text-slate-100 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-[#C4B5FD]/10 bg-[#080810]/95">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line brand wordmark */}
          <Link
            to="/home"
            className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6] rounded"
          >
            Together Cinema
          </Link>

          {/* Zone 2: 5 concise single-line text nav links */}
          <nav aria-label="Primary Navigation" className="hidden md:flex items-center gap-6">
            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `text-sm font-medium whitespace-nowrap shrink-0 transition-colors pb-0.5 border-b-2 ${
                    isActive
                      ? 'text-white border-[#8B5CF6]'
                      : 'text-slate-300 border-transparent hover:text-white hover:border-[#C4B5FD]/40'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              className="text-sm font-medium text-slate-300 hover:text-white whitespace-nowrap shrink-0 transition-colors flex items-center gap-1.5 cursor-pointer"
              aria-expanded={drawerOpen}
              aria-label="Open cinema directory menu"
            >
              <span>More</span>
            </button>
          </nav>

          {/* Zone 3: Single primary CTA (+ mobile menu trigger) */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/rooms/create')}
              className="px-4 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-white text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              Start Movie Night
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              className="md:hidden p-2 rounded-lg text-slate-200 hover:bg-[#1C1930] cursor-pointer"
              aria-label={drawerOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
            >
              {drawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Expandable Cinema Directory Drawer */}
        {drawerOpen && (
          <div className="border-t border-[#C4B5FD]/10 bg-[#0B1020]">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-3 text-xs text-[#C4B5FD]">
                <span>
                  {user
                    ? `Signed in as ${user.displayName}${isDemoSession ? ' (Demo Couple Mode)' : ''}`
                    : 'Not signed in'}
                  {user?.partnerName ? ` · Connected with ${user.partnerName}` : ''}
                </span>
                <div className="flex items-center gap-4">
                  {!user ? (
                    <Link
                      to="/login"
                      onClick={() => setDrawerOpen(false)}
                      className="text-white hover:underline font-medium"
                    >
                      Sign In
                    </Link>
                  ) : (
                    <Link
                      to="/profile"
                      onClick={() => setDrawerOpen(false)}
                      className="text-white hover:underline font-medium"
                    >
                      Manage Account
                    </Link>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {SECONDARY_LINKS.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setDrawerOpen(false)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                        active
                          ? 'bg-[#8B5CF6]/20 text-white border border-[#8B5CF6]/40'
                          : 'bg-[#1C1930]/60 text-slate-300 hover:text-white hover:bg-[#1C1930]'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-[#C4B5FD] shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className={fullBleed ? 'flex-1 relative' : 'flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-8 py-8 pb-24 md:pb-12'}>
        {children}
      </main>

      {/* Mobile Bottom Navigation (stays well under 15% viewport height) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0B1020]/95 border-t border-[#C4B5FD]/15 px-2 py-1.5 flex items-center justify-around"
      >
        {[
          { to: '/home', label: 'Home', icon: Home },
          { to: '/lobby', label: 'Lobby', icon: Compass },
          { to: '/movies', label: 'Movies', icon: Film },
          { to: '/rooms', label: 'Rooms', icon: Heart },
          { to: '/food', label: 'Snacks', icon: Popcorn },
        ].map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-[11px] font-medium ${
                active ? 'text-[#C4B5FD]' : 'text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
