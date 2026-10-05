/**
 * Supabase project used for optional accounts and saved history.
 *
 * Both values are public by design: the publishable key identifies the project
 * and grants nothing on its own. Access to saved remediations is enforced by
 * row-level security in the database (see supabase/migrations), which lets a
 * signed-in user read, save and delete only their own rows.
 */
export const SUPABASE_URL = 'https://cmuktlurjftivtnppsbo.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CY_vgeQFU3tU4vpA0GaLwg_M-2sdMO-';
