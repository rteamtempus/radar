import { Routes } from '@angular/router';

/**
 * Quest flow:
 *   /party        → start a quest (pick a domain) + your adventures
 *   /party/join   → enter a code (?code=XXXXXX deeplink); tries adventures first
 *   /party/:id    → the live quest: lobby + slot picking → swipe → vote →
 *                   reveal, driven by parties.status over Supabase Realtime.
 * Adventures live at /adventure/:id (registered in app.routes.ts).
 */
export const PARTY_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./party-start-page').then((m) => m.PartyStartPage) },
  { path: 'join', loadComponent: () => import('./party-join-page').then((m) => m.PartyJoinPage) },
  { path: ':id', loadComponent: () => import('./party-shell-page').then((m) => m.PartyShellPage) },
];
