// Literal process.env references so Next.js inlines them into the browser bundle.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
/** Accepts either name: Vercel's Supabase integration uses NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. */
export const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!;
