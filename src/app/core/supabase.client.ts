import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { ENV } from '../../environments/env.generated';
// TODO(milestone 2): generate DB types with `supabase gen types typescript`
// into core/types/database.types.ts and type this client with them.

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
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
