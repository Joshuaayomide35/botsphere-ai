-- BotSphere AI · Phase 2 · Core multi-tenant schema (spec §5)
create type public.member_role         as enum ('owner', 'admin', 'agent');
create type public.channel_type        as enum ('whatsapp_qr', 'web_call');
create type public.channel_status      as enum ('connected', 'disconnected', 'qr_pending');
create type public.pipeline_stage      as enum ('new_lead', 'qualified', 'booked', 'closed');
create type public.conversation_status as enum ('open', 'needs_human', 'closed');
create type public.sender_type         as enum ('contact', 'ai', 'human', 'system');
create type public.media_type          as enum ('text', 'audio', 'image', 'call_summary');
create type public.voice_note_mode     as enum ('never', 'mirror_user', 'always');
create type public.knowledge_type      as enum ('text', 'pdf', 'url');
create type public.knowledge_status    as enum ('processing', 'ready', 'failed');

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

create table public.member_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text, email text, avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  industry text,
  timezone text not null default 'UTC',
  office_hours_json jsonb not null default '{}'::jsonb,
  global_ai_paused boolean not null default false,
  owner_alert_phone text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'agent',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type public.channel_type not null default 'whatsapp_qr',
  instance_id text unique,
  phone_number text,
  status public.channel_status not null default 'disconnected',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index channels_workspace_idx on public.channels (workspace_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  phone text not null check (char_length(phone) between 4 and 32),
  name text check (char_length(name) <= 120),
  email text check (char_length(email) <= 200),
  avatar_url text,
  pipeline_stage public.pipeline_stage not null default 'new_lead',
  tags text[] not null default '{}',
  notes text not null default '',
  ai_summary text,
  source text,
  deal_value numeric(12, 2) not null default 0 check (deal_value >= 0),
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, phone),
  unique (workspace_id, id)
);
create index contacts_workspace_stage_idx on public.contacts (workspace_id, pipeline_stage);
create index contacts_workspace_active_idx on public.contacts (workspace_id, last_active_at desc);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null,
  channel_id uuid,
  ai_enabled boolean not null default true,
  status public.conversation_status not null default 'open',
  unread_count integer not null default 0 check (unread_count >= 0),
  assigned_to uuid references auth.users (id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, channel_id) references public.channels (workspace_id, id) on delete set null (channel_id)
);
create index conversations_workspace_recent_idx on public.conversations (workspace_id, last_message_at desc);
create index conversations_contact_idx on public.conversations (contact_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid not null,
  sender_type public.sender_type not null,
  content_text text,
  media_url text,
  media_type public.media_type not null default 'text',
  transcript_text text,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, conversation_id) references public.conversations (workspace_id, id) on delete cascade
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_workspace_idx on public.messages (workspace_id);

create table public.agent_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,
  bot_name text not null default 'Assistant' check (char_length(bot_name) between 1 and 40),
  system_prompt text not null default '' check (char_length(system_prompt) <= 20000),
  tone text not null default 'warm',
  llm_model text not null default 'openai/gpt-4o-mini',
  voice_id text,
  voice_note_mode public.voice_note_mode not null default 'mirror_user',
  handover_rules jsonb not null default '[]'::jsonb,
  typing_delay_ms integer not null default 2500 check (typing_delay_ms between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type public.knowledge_type not null,
  title text not null check (char_length(title) between 1 and 200),
  content_extracted text,
  file_url text,
  size_bytes bigint,
  status public.knowledge_status not null default 'ready',
  error text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_items_workspace_idx on public.knowledge_items (workspace_id, created_at desc);

create table public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  shortcut text not null check (shortcut ~ '^/[a-z0-9_-]{1,30}$'),
  content_text text not null,
  media_url text,
  created_at timestamptz not null default now(),
  unique (workspace_id, shortcut)
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid,
  conversation_id uuid,
  retell_call_id text unique,
  duration_sec integer,
  recording_url text,
  transcript_text text,
  ai_summary text,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete set null (contact_id),
  foreign key (workspace_id, conversation_id) references public.conversations (workspace_id, id) on delete set null (conversation_id)
);
create index calls_workspace_idx on public.calls (workspace_id);

create trigger member_profiles_updated_at before update on public.member_profiles for each row execute function public.set_updated_at();
create trigger workspaces_updated_at before update on public.workspaces for each row execute function public.set_updated_at();
create trigger channels_updated_at before update on public.channels for each row execute function public.set_updated_at();
create trigger contacts_updated_at before update on public.contacts for each row execute function public.set_updated_at();
create trigger agent_configs_updated_at before update on public.agent_configs for each row execute function public.set_updated_at();
create trigger knowledge_items_updated_at before update on public.knowledge_items for each row execute function public.set_updated_at();
