import { Injectable, signal } from '@angular/core';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../supabase.config';

/**
 * Optional sign-in, by emailed magic link.
 *
 * Accounts add one thing: saved history. Everything else works signed out, so
 * a failure here (offline, blocked network, Supabase down) must never stop
 * the app. Every call catches and reports instead of throwing into the UI.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  /** Shared with HistoryService so both use the same session. */
  readonly client: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  /** The signed-in user, or null. Undefined until the stored session is read. */
  readonly user = signal<User | null | undefined>(undefined);

  constructor() {
    this.client.auth
      .getSession()
      .then(({ data }) => this.user.set(data.session?.user ?? null))
      .catch(() => this.user.set(null));

    this.client.auth.onAuthStateChange((_event, session) => {
      this.user.set(session?.user ?? null);
      // The magic link lands with tokens in the URL hash; drop them once read.
      if (session && location.hash.includes('access_token')) {
        history.replaceState(null, '', location.pathname + location.search);
      }
    });
  }

  /**
   * Emails a sign-in link that returns to this exact page, so it works the same
   * from the desktop app, the local server and the hosted demo.
   */
  async sendMagicLink(email: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw new Error(AuthService.friendly(error.message));
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw new Error(AuthService.friendly(error.message));
  }

  private static friendly(message: string): string {
    if (/rate limit/i.test(message)) {
      return 'Too many sign-in emails were sent recently. Wait a few minutes and try again.';
    }
    if (/fetch|network/i.test(message)) {
      return 'Could not reach the sign-in service. Check your connection; everything else still works offline.';
    }
    return message;
  }
}
