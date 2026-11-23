export type MemberRole = "owner" | "admin" | "agent";
export type ChannelStatus = "connected" | "disconnected" | "qr_pending";
export type PipelineStage = "new_lead" | "qualified" | "booked" | "closed";
export type ConversationStatus = "open" | "needs_human" | "closed";
export type SenderType = "contact" | "ai" | "human" | "system";
export type MediaType = "text" | "audio" | "image" | "call_summary";
export type VoiceNoteMode = "never" | "mirror_user" | "always";

export interface DayHours {
  open: boolean;
  from: string;
  to: string;
}
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type OfficeHours = Partial<Record<Weekday, DayHours>> & { after_hours_only?: boolean };

export interface Workspace {
  id: string;
  name: string;
  industry: string | null;
  timezone: string;
  office_hours_json: OfficeHours;
  global_ai_paused: boolean;
  owner_alert_phone: string | null;
  created_at: string;
}

export interface Channel {
  id: string;
  workspace_id: string;
  type: "whatsapp_qr" | "web_call";
  instance_id: string | null;
  phone_number: string | null;
  status: ChannelStatus;
  profile_name: string | null;
  connected_at: string | null;
}

export interface Contact {
  id: string;
  workspace_id: string;
  phone: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  pipeline_stage: PipelineStage;
  tags: string[];
  notes: string;
  ai_summary: string | null;
  source: string | null;
  deal_value: number;
  last_active_at: string;
  created_at: string;
  wa_jid: string | null;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  contact_id: string;
  channel_id: string | null;
  ai_enabled: boolean;
  status: ConversationStatus;
  unread_count: number;
  last_message_at: string;
  last_message_preview: string | null;
  last_message_sender: SenderType | null;
  created_at: string;
}

export interface ConversationWithContact extends Conversation {
  contact: Contact;
}

export interface Message {
  id: string;
  workspace_id: string;
  conversation_id: string;
  sender_type: SenderType;
  content_text: string | null;
  media_url: string | null;
  media_type: MediaType;
  transcript_text: string | null;
  duration_sec: number | null;
  wa_message_id: string | null;
  created_at: string;
}

export interface HandoverRule {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export interface AgentConfig {
  id: string;
  workspace_id: string;
  bot_name: string;
  system_prompt: string;
  tone: string;
  llm_model: string;
  voice_id: string | null;
  voice_note_mode: VoiceNoteMode;
  handover_rules: HandoverRule[];
  typing_delay_ms: number;
  follow_up_enabled: boolean;
  follow_up_after_hours: number;
  follow_up_max: number;
  follow_up_message: string;
}

export interface KnowledgeItem {
  id: string;
  workspace_id: string;
  type: "text" | "pdf" | "url";
  title: string;
  content_extracted: string | null;
  file_url: string | null;
  size_bytes: number | null;
  status: "processing" | "ready" | "failed";
  error: string | null;
  is_active: boolean;
  created_at: string;
}

export interface QuickReply {
  id: string;
  workspace_id: string;
  shortcut: string;
  content_text: string;
  media_url: string | null;
}

export interface MediaItem {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  storage_path: string;
  public_url: string;
  mime_type: string;
  size_bytes: number | null;
  is_active: boolean;
  created_at: string;
}

export const STAGES: { id: PipelineStage; label: string; color: string }[] = [
  { id: "new_lead", label: "New Lead", color: "#38BDF8" },
  { id: "qualified", label: "Qualified", color: "#2563EB" },
  { id: "booked", label: "Booked", color: "#F59E0B" },
  { id: "closed", label: "Closed", color: "#10B981" },
];

export const LLM_MODELS = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini · fast & cheap" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
];

export const VOICES = [
  { id: "aria", label: "Aria", hint: "Warm · female", openai: "nova" },
  { id: "marcus", label: "Marcus", hint: "Calm · male", openai: "onyx" },
  { id: "layla", label: "Layla", hint: "Bright · female", openai: "shimmer" },
  { id: "noah", label: "Noah", hint: "Friendly · male", openai: "echo" },
  { id: "sage", label: "Sage", hint: "Neutral", openai: "alloy" },
];
