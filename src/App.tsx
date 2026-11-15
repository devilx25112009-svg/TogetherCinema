import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';

const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const AuthPage = lazy(() => import('./pages/AuthPages').then((m) => ({ default: m.AuthPage })));
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const LobbyPage = lazy(() => import('./pages/LobbyPage').then((m) => ({ default: m.LobbyPage })));
const MoviesPage = lazy(() => import('./pages/MoviesPages').then((m) => ({ default: m.MoviesPage })));
const MovieDetailPage = lazy(() => import('./pages/MoviesPages').then((m) => ({ default: m.MovieDetailPage })));
const UploadPage = lazy(() => import('./pages/UploadPage').then((m) => ({ default: m.UploadPage })));
const RoomsPage = lazy(() => import('./pages/RoomsPages').then((m) => ({ default: m.RoomsPage })));
const CreateRoomPage = lazy(() => import('./pages/RoomsPages').then((m) => ({ default: m.CreateRoomPage })));
const JoinRoomPage = lazy(() => import('./pages/RoomsPages').then((m) => ({ default: m.JoinRoomPage })));
const JoinByLinkPage = lazy(() => import('./pages/RoomsPages').then((m) => ({ default: m.JoinByLinkPage })));
const CinemaPlayerPage = lazy(() => import('./pages/CinemaPlayerPage').then((m) => ({ default: m.CinemaPlayerPage })));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const MemoriesPage = lazy(() => import('./pages/MemoriesPage'));
const FoodPage = lazy(() => import('./pages/FoodPage'));
const ChatHistoryPage = lazy(() => import('./pages/ChatHistoryPage'));
const ProfilePage = lazy(() => import('./pages/ProfileAndSettingsPages').then((m) => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import('./pages/ProfileAndSettingsPages').then((m) => ({ default: m.SettingsPage })));
const SettingsStoragePage = lazy(() =>
  import('./pages/ProfileAndSettingsPages').then((m) => ({ default: m.SettingsStoragePage }))
);
const SettingsPrivacyPage = lazy(() =>
  import('./pages/ProfileAndSettingsPages').then((m) => ({ default: m.SettingsPrivacyPage }))
);
const SettingsSubscriptionPage = lazy(() =>
  import('./pages/ProfileAndSettingsPages').then((m) => ({ default: m.SettingsSubscriptionPage }))
);

function CinemaRouteFallback() {
  return (
    <div className="min-h-screen bg-[#080810] text-[#C4B5FD] flex items-center justify-center">
      <div className="text-center space-y-2">
        <p className="font-display text-lg font-semibold text-white">Together Cinema</p>
        <p className="text-xs tracking-[0.2em] uppercase text-[#C4B5FD]/80">Preparing Auditorium...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<CinemaRouteFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/lobby" element={<LobbyPage />} />
            <Route path="/movies" element={<MoviesPage />} />
            <Route path="/movies/:id" element={<MovieDetailPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/rooms" element={<RoomsPage />} />
            <Route path="/rooms/create" element={<CreateRoomPage />} />
            <Route path="/rooms/join" element={<JoinRoomPage />} />
            <Route path="/join/:inviteCode" element={<JoinByLinkPage />} />
            <Route path="/cinema/:roomId" element={<CinemaPlayerPage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/memories" element={<MemoriesPage />} />
            <Route path="/food" element={<FoodPage />} />
            <Route path="/chat" element={<ChatHistoryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/storage" element={<SettingsStoragePage />} />
            <Route path="/settings/privacy" element={<SettingsPrivacyPage />} />
            <Route path="/settings/subscription" element={<SettingsSubscriptionPage />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
