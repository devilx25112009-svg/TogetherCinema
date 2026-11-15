import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  Copy,
  CreditCard,
  HardDrive,
  Heart,
  Link2,
  LogOut,
  Shield,
  Sliders,
  Trash2,
  UserCheck,
  UserMinus,
} from 'lucide-react';
import { CinemaLayout } from '../components/layout/CinemaLayout';
import { useAuth } from '../context/AuthContext';
import { cinemaApi, type HealthResponse } from '../lib/api';
import type { UploadSessionRecord } from '../types/cinema';
import { formatBytes } from '../utils/uploadLogic';

function SettingsSubNav({ current }: { current: 'general' | 'storage' | 'privacy' | 'subscription' }) {
  const tabs = [
    { id: 'general', label: 'Playback & Theatre', to: '/settings', icon: Sliders },
    { id: 'storage', label: 'Storage & Processing', to: '/settings/storage', icon: HardDrive },
    { id: 'privacy', label: 'Privacy & Security', to: '/settings/privacy', icon: Shield },
    { id: 'subscription', label: 'Storage Plans', to: '/settings/subscription', icon: CreditCard },
  ] as const;

  return (
    <nav aria-label="Settings sections" className="flex flex-wrap gap-2 border-b border-[#C4B5FD]/10 pb-4">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.id === current;
        return (
          <Link
            key={tab.id}
            to={tab.to}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              active ? 'bg-[#8B5CF6] text-white' : 'bg-[#151126] text-slate-300 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ProfilePage() {
  const {
    user,
    isDemoSession,
    firestoreReady,
    updateDisplayName,
    refreshPartnerStatus,
    enterDemoCoupleMode,
    logout,
  } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [inviteCode, setInviteCode] = useState(user?.inviteCode || '');
  const [acceptCode, setAcceptCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setDisplayName(user?.displayName || '');
    if (user?.inviteCode) setInviteCode(user.inviteCode);
  }, [user]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    await updateDisplayName(displayName.trim());
    setFeedback('Display name updated.');
    setError('');
  };

  const handleGenerateInvite = async () => {
    setError('');
    try {
      const { invitation } = await cinemaApi.createPartnerInvite(user);
      setInviteCode(invitation.code);
      setFeedback(`Partner invitation code ${invitation.code} is active.`);
      await refreshPartnerStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate invite code.');
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptCode.trim()) return;
    setError('');
    try {
      const { connection } = await cinemaApi.acceptPartnerInvite(acceptCode.trim(), user);
      setAcceptCode('');
      await refreshPartnerStatus();
      setFeedback(`Connected permanently with ${connection.partnerName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link partner code.');
    }
  };

  const handleDisconnect = async () => {
    await cinemaApi.disconnectPartner(user);
    setConfirmDisconnect(false);
    await refreshPartnerStatus();
    setFeedback('Partner connection removed.');
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <CinemaLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="border-b border-[#C4B5FD]/10 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#C4B5FD] mb-2">Private Identity</p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">Profile &amp; Partner Link</h1>
            <p className="text-sm text-slate-300 mt-1">
              {user ? `${user.email || user.uid} · ${isDemoSession ? 'Demo Couple Session' : 'Firebase Authenticated'}` : 'Guest Viewer'}
              {firestoreReady ? ' · Firestore Sync Active' : ''}
            </p>
          </div>
          {user && (
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#151126] border border-[#C4B5FD]/20 text-xs font-medium text-slate-200 hover:text-white cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          )}
        </div>

        {feedback && (
          <div className="rounded-xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/40 px-4 py-3 text-sm text-[#C4B5FD]">
            {feedback}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-[#F472B6]/15 border border-[#F472B6]/40 px-4 py-3 text-sm text-[#F472B6]">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Account Details */}
          <section className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-6 space-y-5">
            <h2 className="font-display text-lg font-semibold text-white">Your Cinema Profile</h2>
            <form onSubmit={handleSaveName} className="space-y-4">
              <div>
                <label htmlFor="prof-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Display Name
                </label>
                <input
                  id="prof-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-white text-xs font-semibold cursor-pointer"
              >
                Save Display Name
              </button>
            </form>

            {isDemoSession && (
              <div className="pt-4 border-t border-[#C4B5FD]/10 space-y-2">
                <p className="text-xs text-slate-400">Preview Demo Couple Perspective</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => enterDemoCoupleMode('a')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                      user?.uid === 'demo-partner-a' ? 'bg-[#8B5CF6] text-white' : 'bg-[#0B1020] text-slate-300'
                    }`}
                  >
                    Aayush (Host)
                  </button>
                  <button
                    type="button"
                    onClick={() => enterDemoCoupleMode('b')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                      user?.uid === 'demo-partner-b' ? 'bg-[#F472B6] text-white' : 'bg-[#0B1020] text-slate-300'
                    }`}
                  >
                    Maya (Partner)
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Partner Connection Manager */}
          <section className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-6 space-y-5">
            <h2 className="font-display text-lg font-semibold text-white flex items-center gap-2">
              <Heart className="w-5 h-5 text-[#F472B6]" />
              Partner Connection
            </h2>

            {user?.connectionStatus === 'connected' ? (
              <div className="rounded-xl bg-[#0B1020] border border-[#8B5CF6]/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-300 text-sm font-medium">
                  <UserCheck className="w-4 h-4" />
                  <span>Connected with {user.partnerName}</span>
                </div>
                <p className="text-xs text-slate-400">
                  Your private library, watchlist, memories, and partner-only rooms sync directly with{' '}
                  {user.partnerName}.
                </p>
                {!confirmDisconnect ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#F472B6] cursor-pointer"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    Disconnect Partner
                  </button>
                ) : (
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="px-3 py-1.5 rounded-lg bg-[#F472B6] text-[#080810] text-xs font-semibold cursor-pointer"
                    >
                      Confirm Disconnect
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDisconnect(false)}
                      className="px-3 py-1.5 rounded-lg bg-[#1C1930] text-xs text-slate-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-300">
                No partner linked yet. Generate an invitation code or enter the code your partner shared.
              </p>
            )}

            <div className="space-y-3 pt-2 border-t border-[#C4B5FD]/10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-400">Your Partner Invite Code</p>
                  <p className="font-mono text-base font-semibold text-white">
                    {inviteCode || 'Not generated'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {inviteCode && (
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-xs text-white cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleGenerateInvite}
                    className="px-3 py-2 rounded-lg bg-[#8B5CF6] hover:bg-[#9167FF] text-xs font-semibold text-white cursor-pointer"
                  >
                    Generate Code
                  </button>
                </div>
              </div>

              <form onSubmit={handleAcceptInvite} className="flex gap-2">
                <input
                  type="text"
                  aria-label="Enter partner invitation code"
                  value={acceptCode}
                  onChange={(e) => setAcceptCode(e.target.value.toUpperCase())}
                  placeholder="Enter DUET-XXXX"
                  className="flex-1 px-3 py-2 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-[#8B5CF6]"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1C1930] hover:bg-[#211B32] border border-[#C4B5FD]/20 text-xs font-semibold text-white cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5 text-[#83A9FF]" />
                  Connect
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </CinemaLayout>
  );
}

const PREFS_KEY = 'together_cinema_preferences';

export function SettingsPage() {
  const [prefs, setPrefs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      return {
        defaultScreenMode: saved.defaultScreenMode || 'IMAX',
        defaultCamera: saved.defaultCamera || 'Front Row',
        autoSyncPlayback: saved.autoSyncPlayback ?? true,
        reducedMotion: saved.reducedMotion ?? false,
        ambientScreenGlow: saved.ambientScreenGlow ?? true,
      };
    } catch {
      return {
        defaultScreenMode: 'IMAX',
        defaultCamera: 'Front Row',
        autoSyncPlayback: true,
        reducedMotion: false,
        ambientScreenGlow: true,
      };
    }
  });
  const [savedBanner, setSavedBanner] = useState(false);

  const savePrefs = (next: typeof prefs) => {
    setPrefs(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 1800);
  };

  return (
    <CinemaLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#C4B5FD] mb-2">Auditorium Preferences</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">Application Settings</h1>
        </div>

        <SettingsSubNav current="general" />

        {savedBanner && (
          <p className="text-xs text-emerald-300">Preferences saved locally for your next screening.</p>
        )}

        <section className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="set-screen" className="block text-xs font-medium text-slate-300 mb-1.5">
                Default Cinema Screen Format
              </label>
              <select
                id="set-screen"
                value={prefs.defaultScreenMode}
                onChange={(e) => savePrefs({ ...prefs, defaultScreenMode: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white"
              >
                <option value="Normal Cinema">Normal Cinema</option>
                <option value="IMAX">IMAX (Front-Row Curved)</option>
                <option value="IMAX 3D">IMAX 3D</option>
                <option value="Dolby Cinema">Dolby Cinema</option>
                <option value="Screen X">Screen X (270° Walls)</option>
                <option value="4DX">4DX (Motion &amp; Wind)</option>
                <option value="3D">3D Stereoscopic</option>
              </select>
            </div>

            <div>
              <label htmlFor="set-camera" className="block text-xs font-medium text-slate-300 mb-1.5">
                Default Seat Camera
              </label>
              <select
                id="set-camera"
                value={prefs.defaultCamera}
                onChange={(e) => savePrefs({ ...prefs, defaultCamera: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1020] border border-[#C4B5FD]/20 text-sm text-white"
              >
                <option value="Front Row">Front Row (Massive Screen)</option>
                <option value="Centre Seating">Centre Seating</option>
                <option value="Back Row">Back Row</option>
                <option value="Wide View">Wide View</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-[#C4B5FD]/10">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Real-Time Drift Auto-Correction</p>
                <p className="text-xs text-slate-400">Smoothly align playback timestamps with your partner</p>
              </div>
              <input
                type="checkbox"
                checked={prefs.autoSyncPlayback}
                onChange={(e) => savePrefs({ ...prefs, autoSyncPlayback: e.target.checked })}
                className="w-4 h-4 accent-[#8B5CF6]"
              />
            </label>

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Dynamic Screen Illumination</p>
                <p className="text-xs text-slate-400">Cast ambient cinema light onto velvet seats in 3D view</p>
              </div>
              <input
                type="checkbox"
                checked={prefs.ambientScreenGlow}
                onChange={(e) => savePrefs({ ...prefs, ambientScreenGlow: e.target.checked })}
                className="w-4 h-4 accent-[#8B5CF6]"
              />
            </label>

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Reduced Motion Camera Transitions</p>
                <p className="text-xs text-slate-400">Minimize camera swoops when entering the lobby or auditorium</p>
              </div>
              <input
                type="checkbox"
                checked={prefs.reducedMotion}
                onChange={(e) => savePrefs({ ...prefs, reducedMotion: e.target.checked })}
                className="w-4 h-4 accent-[#8B5CF6]"
              />
            </label>
          </div>
        </section>
      </div>
    </CinemaLayout>
  );
}

export function SettingsStoragePage() {
  const { user } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [sessions, setSessions] = useState<UploadSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    try {
      const [h, s] = await Promise.all([cinemaApi.getHealth(), cinemaApi.listUploadSessions(user)]);
      setHealth(h);
      setSessions(s.sessions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [user?.uid]);

  const handleAbortSession = async (sessionId: string) => {
    await cinemaApi.abortUploadSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    const h = await cinemaApi.getHealth();
    setHealth(h);
  };

  const usedPct =
    health && health.storage.quotaBytes > 0
      ? Math.min(100, Math.round((health.storage.usedBytes / health.storage.quotaBytes) * 100))
      : 0;

  return (
    <CinemaLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#C4B5FD] mb-2">Media Vault</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">Storage &amp; Processing</h1>
        </div>

        <SettingsSubNav current="storage" />

        {loading ? (
          <p className="text-sm text-slate-400 py-8">Inspecting storage adapter...</p>
        ) : (
          <div className="space-y-6">
            {health && (
              <section className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-white">
                      Active Storage Adapter:{' '}
                      {health.storage.provider === 's3'
                        ? 'MINIO (S3)'
                        : health.storage.provider === 'local'
                        ? 'ZERO-CONFIG VAULT'
                        : health.storage.provider.toUpperCase()}
                      <span className={`ml-2 text-xs font-mono ${health.storage.configured ? 'text-emerald-300' : 'text-amber-300'}`}>
                        [{health.storage.configured ? 'READY' : 'SETUP REQUIRED'}]
                      </span>
                    </h2>
                    <p className="text-xs text-slate-300 mt-1">{health.storage.message}</p>
                    {health.storage.provider === 's3' && health.storage.endpoint && (
                      <p className="text-xs font-mono text-slate-400 mt-1">
                        Endpoint: {health.storage.endpoint} · Bucket: {health.storage.bucket || 'together-cinema-media'}
                      </p>
                    )}
                  </div>
                  <div className="text-right font-mono text-xs text-[#C4B5FD]">
                    {formatBytes(health.storage.usedBytes)} / {formatBytes(health.storage.quotaBytes)} ({usedPct}%)
                  </div>
                </div>

                <div className="w-full h-2.5 rounded-full bg-[#0B1020] overflow-hidden">
                  <div className="h-full bg-[#8B5CF6]" style={{ width: `${Math.max(2, usedPct)}%` }} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs">
                  <div className="rounded-xl bg-[#0B1020] p-3.5 border border-[#C4B5FD]/10">
                    <p className="text-slate-400">FFmpeg Transcoding</p>
                    <p className="font-semibold text-white mt-1">
                      {health.processing.ffmpegAvailable ? 'Available' : 'Not installed (Original Passthrough)'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#0B1020] p-3.5 border border-[#C4B5FD]/10">
                    <p className="text-slate-400">FFprobe Metadata</p>
                    <p className="font-semibold text-white mt-1">
                      {health.processing.ffprobeAvailable ? 'Available' : 'Fallback Inspection'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#0B1020] p-3.5 border border-[#C4B5FD]/10">
                    <p className="text-slate-400">CDN / Playback Origin</p>
                    <p className="font-semibold text-white mt-1 truncate">
                      {health.storage.cdnBaseUrl || 'Signed Byte-Range Stream Proxy'}
                    </p>
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-white">Multipart Upload Sessions</h2>
                <Link to="/upload" className="text-xs font-semibold text-[#C4B5FD] hover:underline">
                  Open Upload Center
                </Link>
              </div>
              {sessions.length === 0 ? (
                <p className="text-xs text-slate-400">No active or incomplete chunked upload sessions.</p>
              ) : (
                <div className="space-y-2.5">
                  {sessions.map((s) => (
                    <div
                      key={s.sessionId}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-[#0B1020] border border-[#C4B5FD]/10 p-4 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-white">{s.fileName}</p>
                        <p className="font-mono text-slate-400 mt-0.5">
                          {formatBytes(s.uploadedBytes)} / {formatBytes(s.fileSizeBytes)} · {s.status} ·{' '}
                          {s.uploadedParts.length}/{s.totalChunks} chunks
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAbortSession(s.sessionId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1C1930] text-slate-300 hover:text-[#F472B6] cursor-pointer self-start"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove Session
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </CinemaLayout>
  );
}

export function SettingsPrivacyPage() {
  const { user, logout } = useAuth();

  return (
    <CinemaLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#C4B5FD] mb-2">Security &amp; Access</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">Privacy &amp; Security</h1>
        </div>

        <SettingsSubNav current="privacy" />

        <section className="rounded-2xl bg-[#151126] border border-[#C4B5FD]/15 p-6 space-y-5">
          <div className="rounded-xl bg-[#0B1020] border border-[#C4B5FD]/10 p-4">
            <h2 className="font-display text-base font-semibold text-white">Signed Media &amp; Room Isolation</h2>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              Every uploaded film streams through HMAC-signed byte-range URLs rather than public directory listings.
              Partner-only rooms validate host and connected partner IDs before granting playback state or chat access.
            </p>
          </div>

          <div className="rounded-xl bg-[#0B1020] border border-[#C4B5FD]/10 p-4">
            <h2 className="font-display text-base font-semibold text-white">Firestore Rule Protection</h2>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              User emails and private credentials are isolated under owner-only Firestore subcollections while public
              display profiles remain readable only to authenticated sessions.
            </p>
          </div>

          {user && (
            <div className="pt-2 flex items-center justify-between border-t border-[#C4B5FD]/10">
              <span className="text-xs text-slate-400">Signed in as {user.displayName}</span>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1C1930] hover:bg-[#211B32] text-xs font-semibold text-[#F472B6] cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out Everywhere
              </button>
            </div>
          )}
        </section>
      </div>
    </CinemaLayout>
  );
}

export function SettingsSubscriptionPage() {
  const plans = [
    {
      id: 'free',
      name: 'Private Screening',
      quota: '50 GB Vault',
      price: '$0 / month',
      features: ['Chunked uploads up to 20 GB', 'Standard & IMAX 3D rooms', 'Shared watchlist & memories'],
    },
    {
      id: 'duet_plus',
      name: 'Duet Plus',
      quota: '200 GB Vault',
      price: '$12 / month',
      features: ['50 GB+ lossless film uploads', 'All 10 screen modes incl. Screen X & 4DX', 'Priority HLS processing'],
      recommended: true,
    },
    {
      id: 'imax_vault',
      name: 'IMAX Archive',
      quota: '2 TB Vault',
      price: '$29 / month',
      features: ['2 TB S3/GCS private archive', 'Multi-track Dolby Atmos passthrough', 'Dedicated CDN edge delivery'],
    },
  ];

  return (
    <CinemaLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#C4B5FD] mb-2">Vault Capacity</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">Storage &amp; Plans</h1>
        </div>

        <SettingsSubNav current="subscription" />

        <div className="rounded-xl bg-[#0B1020] border border-[#83A9FF]/25 px-4 py-3 text-xs text-slate-300">
          Billing checkout is not connected in this self-hosted environment. Storage capacity scales directly with your
          configured local volume, AWS S3 bucket, or Google Cloud Storage bucket.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className={`rounded-2xl p-6 border flex flex-col justify-between gap-6 ${
                plan.recommended
                  ? 'bg-[#1C1930] border-[#8B5CF6]'
                  : 'bg-[#151126] border-[#C4B5FD]/15'
              }`}
            >
              <div>
                <p className="text-xs font-mono text-[#C4B5FD]">{plan.quota}</p>
                <h2 className="font-display text-xl font-bold text-white mt-1">{plan.name}</h2>
                <p className="font-mono text-2xl font-bold text-white mt-3">{plan.price}</p>
                <ul className="mt-5 space-y-2.5 text-xs text-slate-300">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-[#8B5CF6] shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Link
                to="/settings/storage"
                className={`text-center py-2.5 px-4 rounded-lg text-xs font-semibold ${
                  plan.recommended
                    ? 'bg-[#8B5CF6] hover:bg-[#9167FF] text-white'
                    : 'bg-[#0B1020] hover:bg-[#1C1930] text-slate-200 border border-[#C4B5FD]/20'
                }`}
              >
                Inspect Active Storage
              </Link>
            </article>
          ))}
        </div>
      </div>
    </CinemaLayout>
  );
}
