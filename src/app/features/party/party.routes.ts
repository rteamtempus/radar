import { Routes } from '@angular/router';

/**
 * Party flow (milestones 5–7):
 *   /party        → start a party (constraints, join code)
 *   /party/join   → enter a join code (?code=XXXXXX deeplink)
 *   /party/:id    → the live party: lobby → mood → swipe → vote → reveal,
 *                   driven by parties.status over Supabase Realtime.
 */
export const PARTY_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./party-start-page').then((m) => m.PartyStartPage) },
  { path: 'join', loadComponent: () => import('./party-join-page').then((m) => m.PartyJoinPage) },
  { path: ':id', loadComponent: () => import('./party-shell-page').then((m) => m.PartyShellPage) },
];
