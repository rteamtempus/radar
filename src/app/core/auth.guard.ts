import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { getSupabase, isSupabaseConfigured } from './supabase.client';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  if (!isSupabaseConfigured()) return router.parseUrl('/login');
  const { data } = await getSupabase().auth.getSession();
  return data.session ? true : router.parseUrl('/login');
};
