import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'radar' },
  {
    path: 'radar',
    canActivate: [authGuard],
    loadComponent: () => import('./features/radar/radar-page').then((m) => m.RadarPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./features/auth/auth-callback').then((m) => m.AuthCallback),
  },
  {
    path: 'onboarding',
    canActivate: [authGuard],
    loadComponent: () => import('./features/onboarding/onboarding-page').then((m) => m.OnboardingPage),
  },
  // Library-as-a-page is gone (Radar is home, history lives in You) — the
  // /library/:id detail route survives because links point there.
  { path: 'library', pathMatch: 'full', redirectTo: 'radar' },
  {
    path: 'library/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/library/activity-detail-page').then((m) => m.ActivityDetailPage),
  },
  {
    path: 'explore',
    canActivate: [authGuard],
    loadComponent: () => import('./features/explore/explore-page').then((m) => m.ExplorePage),
  },
  {
    path: 'friends',
    canActivate: [authGuard],
    loadComponent: () => import('./features/friends/friends-page').then((m) => m.FriendsPage),
  },
  {
    path: 'friends/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/friends/friend-profile-page').then((m) => m.FriendProfilePage),
  },
  {
    path: 'party',
    canActivate: [authGuard],
    loadChildren: () => import('./features/party/party.routes').then((m) => m.PARTY_ROUTES),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  { path: '**', redirectTo: 'radar' },
];
