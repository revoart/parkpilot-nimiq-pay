import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { OfflineNotice } from '@/components/layout/OfflineNotice'
import { Skeleton } from '@/components/ui/Skeleton'
import { ToastProvider } from '@/components/ui/Toast'
import { AppModeProvider } from '@/hooks/useAppMode'
import { NimPriceProvider } from '@/hooks/useNimPrice'
import { ProfileProvider } from '@/hooks/useProfile'
import { ThemeProvider } from '@/hooks/useTheme'
import { WalletProvider } from '@/hooks/useWallet'
import { isDevelopmentMode } from '@/utils/env'

/**
 * Screens are code-split so the mini app boots with only what the first view
 * needs. Named exports are adapted to the default-export shape `lazy` expects.
 */
const HomeScreen = lazy(() =>
  import('@/screens/HomeScreen').then((m) => ({ default: m.HomeScreen })),
)
const SearchScreen = lazy(() =>
  import('@/screens/SearchScreen').then((m) => ({ default: m.SearchScreen })),
)
const ParkingDetailScreen = lazy(() =>
  import('@/screens/ParkingDetailScreen').then((m) => ({
    default: m.ParkingDetailScreen,
  })),
)
const NavigationScreen = lazy(() =>
  import('@/screens/NavigationScreen').then((m) => ({
    default: m.NavigationScreen,
  })),
)
const ReserveScreen = lazy(() =>
  import('@/screens/ReserveScreen').then((m) => ({ default: m.ReserveScreen })),
)
const PaymentScreen = lazy(() =>
  import('@/screens/PaymentScreen').then((m) => ({ default: m.PaymentScreen })),
)
const ParkingPassScreen = lazy(() =>
  import('@/screens/ParkingPassScreen').then((m) => ({
    default: m.ParkingPassScreen,
  })),
)
const SessionScreen = lazy(() =>
  import('@/screens/SessionScreen').then((m) => ({ default: m.SessionScreen })),
)
const MyParkingScreen = lazy(() =>
  import('@/screens/MyParkingScreen').then((m) => ({ default: m.MyParkingScreen })),
)
const SavedScreen = lazy(() =>
  import('@/screens/SavedScreen').then((m) => ({ default: m.SavedScreen })),
)
const ProfileScreen = lazy(() =>
  import('@/screens/ProfileScreen').then((m) => ({ default: m.ProfileScreen })),
)
const NotificationsScreen = lazy(() =>
  import('@/screens/NotificationsScreen').then((m) => ({
    default: m.NotificationsScreen,
  })),
)
const SettingsScreen = lazy(() =>
  import('@/screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
)
const FindMyCarScreen = lazy(() =>
  import('@/screens/FindMyCarScreen').then((m) => ({ default: m.FindMyCarScreen })),
)
const PrivacyScreen = lazy(() =>
  import('@/screens/PrivacyScreen').then((m) => ({ default: m.PrivacyScreen })),
)
const HostDashboardScreen = lazy(() =>
  import('@/screens/HostDashboardScreen').then((m) => ({
    default: m.HostDashboardScreen,
  })),
)
const HostAddScreen = lazy(() =>
  import('@/screens/HostAddScreen').then((m) => ({ default: m.HostAddScreen })),
)
const HostSpaceScreen = lazy(() =>
  import('@/screens/HostSpaceScreen').then((m) => ({ default: m.HostSpaceScreen })),
)
const HostBookingsScreen = lazy(() =>
  import('@/screens/HostBookingsScreen').then((m) => ({
    default: m.HostBookingsScreen,
  })),
)
const HostWalletScreen = lazy(() =>
  import('@/screens/HostWalletScreen').then((m) => ({
    default: m.HostWalletScreen,
  })),
)
const MessagesScreen = lazy(() =>
  import('@/screens/MessagesScreen').then((m) => ({ default: m.MessagesScreen })),
)
const ChatScreen = lazy(() =>
  import('@/screens/ChatScreen').then((m) => ({ default: m.ChatScreen })),
)

function ScreenFallback() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
        <ThemeProvider>
          <AppModeProvider>
            <WalletProvider>
              <NimPriceProvider>
                <ProfileProvider>
                  <ToastProvider>
                <OfflineNotice />
                {isDevelopmentMode ? (
                  <div className="safe-top sticky top-0 z-50 bg-warning px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-on-ink">
                    Development mode — not real payments
                  </div>
                ) : null}
                <Suspense fallback={<ScreenFallback />}>
                  <Routes>
                    <Route path="/" element={<HomeScreen />} />
                    <Route path="/search" element={<SearchScreen />} />
                    <Route path="/parking/:id" element={<ParkingDetailScreen />} />
                    <Route path="/navigate" element={<NavigationScreen />} />
                    <Route path="/navigate/:id" element={<NavigationScreen />} />
                    <Route path="/reserve/:id" element={<ReserveScreen />} />
                    <Route path="/payment/:id" element={<PaymentScreen />} />
                    <Route path="/pass/:id" element={<ParkingPassScreen />} />
                    <Route path="/session/:id" element={<SessionScreen />} />
                    <Route path="/my-parking" element={<MyParkingScreen />} />
                    <Route path="/messages" element={<MessagesScreen />} />
                    <Route path="/messages/:id" element={<ChatScreen />} />
                    <Route path="/saved" element={<SavedScreen />} />
                    <Route path="/profile" element={<ProfileScreen />} />
                    <Route
                      path="/notifications"
                      element={<NotificationsScreen />}
                    />
                    <Route path="/settings" element={<SettingsScreen />} />
                    <Route path="/find-my-car" element={<FindMyCarScreen />} />
                    <Route path="/privacy" element={<PrivacyScreen />} />

                    <Route path="/host" element={<HostDashboardScreen />} />
                    <Route path="/host/add" element={<HostAddScreen />} />
                    <Route path="/host/space/:id" element={<HostSpaceScreen />} />
                    <Route path="/host/bookings" element={<HostBookingsScreen />} />
                    <Route path="/host/earnings" element={<HostWalletScreen />} />

                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
                  </ToastProvider>
                </ProfileProvider>
              </NimPriceProvider>
            </WalletProvider>
          </AppModeProvider>
        </ThemeProvider>
    </ErrorBoundary>
  )
}
