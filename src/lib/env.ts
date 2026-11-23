/** Server-only configuration. Values are read lazily so a missing optional key never breaks a build. */
export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  evolutionUrl: () => process.env.EVOLUTION_API_URL?.replace(/\/+$/, "") ?? "",
  evolutionKey: () => process.env.EVOLUTION_API_KEY ?? "",
  /** Public base URL Evolution API uses to reach this app's webhook. */
  webhookBaseUrl: () =>
    (
      process.env.WEBHOOK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
      "http://localhost:3000"
    ).replace(/\/+$/, ""),
  openrouterKey: () => process.env.OPENROUTER_API_KEY ?? "",
  openaiKey: () => process.env.OPENAI_API_KEY ?? "",
  deepgramKey: () => process.env.DEEPGRAM_API_KEY ?? "",
  elevenlabsKey: () => process.env.ELEVENLABS_API_KEY ?? "",
  geminiKey: () => process.env.GEMINI_API_KEY ?? "",
  geminiMediaModel: () => process.env.GEMINI_MEDIA_MODEL || "gemini-2.5-flash",
  geminiTtsModel: () => process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts",
  /** OpenRouter vision model used to read images when no Gemini key is set. */
  openrouterVisionModel: () => process.env.OPENROUTER_VISION_MODEL || "google/gemini-2.5-flash",
};

function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}
