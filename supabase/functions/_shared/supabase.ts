import { SupabaseClient, User, createClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

/** Service-role client — bypasses RLS. Only for catalog upserts + pipeline writes. */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/** Auth check first, every function (handoff §11). */
export async function requireUser(req: Request): Promise<User> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new HttpError(401, 'Missing Authorization header');
  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'Not authenticated');
  return data.user;
}
