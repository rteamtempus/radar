import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { ENV } from '../../environments/env.generated';
import { Database } from './types/database.types';
// Regenerate types after schema changes:
//   supabase gen types typescript --linked > src/app/core/types/database.types.ts

let client: SupabaseClient<Database> | undefined;

export function getSupabase(): SupabaseClient<Database> {
  if (!client) {
    if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) {
      throw new Error(
        'Supabase is not configured. Set NG_APP_SUPABASE_URL / NG_APP_SUPABASE_ANON_KEY (see .env.example).',
      );
    }
    client = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey);
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  return !!(ENV.supabaseUrl && ENV.supabaseAnonKey);
}
