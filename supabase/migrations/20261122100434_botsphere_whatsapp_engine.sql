alter table public.messages
  add column wa_message_id text,
  add column duration_sec  integer check (duration_sec is null or duration_sec >= 0);
alter table public.messages add constraint messages_workspace_wa_id_key unique (workspace_id, wa_message_id);
alter table public.contacts add column wa_jid text;
alter table public.conversations
  add column last_message_preview text,
  add column last_message_sender  public.sender_type;
alter table public.channels
  add column profile_name text,
  add column connected_at timestamptz;
create unique index channels_one_whatsapp_per_workspace on public.channels (workspace_id) where type = 'whatsapp_qr';

create table public.channel_secrets (
  channel_id      uuid primary key references public.channels (id) on delete cascade,
  webhook_secret  text not null,
  created_at      timestamptz not null default now()
);
alter table public.channel_secrets enable row level security;
revoke all on public.channel_secrets from anon, authenticated;

create or replace function public.wa_prepare_channel(p_workspace uuid)
returns table (channel_id uuid, instance_name text, webhook_secret text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_channel uuid;
  v_instance text := 'bs_' || replace(p_workspace::text, '-', '');
  v_secret text;
begin
  if not public.has_workspace_role(p_workspace, array['owner','admin']::public.member_role[]) then
    raise exception 'Only owners and admins can manage WhatsApp' using errcode = '42501';
  end if;
  select c.id into v_channel from public.channels c where c.workspace_id = p_workspace and c.type = 'whatsapp_qr';
  if v_channel is null then
    insert into public.channels (workspace_id, type, instance_id, status)
    values (p_workspace, 'whatsapp_qr', v_instance, 'disconnected')
    returning id into v_channel;
  end if;
  select s.webhook_secret into v_secret from public.channel_secrets s where s.channel_id = v_channel;
  if v_secret is null then
    v_secret := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.channel_secrets (channel_id, webhook_secret) values (v_channel, v_secret);
  end if;
  return query select v_channel, (select c.instance_id from public.channels c where c.id = v_channel), v_secret;
end;
$$;

-- _wa_ingest: superseded by 20261122163056_botsphere_ai_echo_guard.sql (same signature).

create or replace function public._wa_channel_for(p_instance text, p_secret text)
returns table (workspace_id uuid, channel_id uuid)
language sql stable security definer set search_path = ''
as $$
  select c.workspace_id, c.id
  from public.channels c
  join public.channel_secrets s on s.channel_id = c.id
  where c.instance_id = p_instance and s.webhook_secret = p_secret;
$$;

create or replace function public.wa_webhook_message(
  p_instance text, p_secret text, p_wa_id text, p_phone text, p_jid text, p_push_name text,
  p_from_me boolean, p_text text, p_media text, p_duration integer, p_ts timestamptz)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_ws uuid;
  v_ch uuid;
begin
  select f.workspace_id, f.channel_id into v_ws, v_ch from public._wa_channel_for(p_instance, p_secret) f;
  if v_ws is null then
    raise exception 'Invalid webhook credentials' using errcode = '42501';
  end if;
  if p_phone is null or p_phone !~ '^\+[0-9]{6,20}$' then
    raise exception 'Invalid phone' using errcode = '22023';
  end if;
  return public._wa_ingest(v_ws, v_ch, p_wa_id, p_phone, p_jid, left(p_push_name, 120), p_from_me,
                           left(p_text, 8000),
                           case when p_media in ('text','audio','image') then p_media else 'text' end::public.media_type,
                           p_duration, p_ts);
end;
$$;

create or replace function public.wa_webhook_connection(p_instance text, p_secret text, p_state text, p_phone text, p_profile_name text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_ch uuid;
  v_status public.channel_status := case p_state when 'open' then 'connected' when 'connecting' then 'qr_pending' else 'disconnected' end;
begin
  select f.channel_id into v_ch from public._wa_channel_for(p_instance, p_secret) f;
  if v_ch is null then
    raise exception 'Invalid webhook credentials' using errcode = '42501';
  end if;
  update public.channels
     set status = v_status,
         phone_number = coalesce(p_phone, phone_number),
         profile_name = coalesce(p_profile_name, profile_name),
         connected_at = case when v_status = 'connected' and status <> 'connected' then now() else connected_at end
   where id = v_ch;
end;
$$;

create or replace function public.wa_simulate_inbound(p_workspace uuid, p_phone text, p_name text, p_text text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_ch uuid;
begin
  select pc.channel_id into v_ch from public.wa_prepare_channel(p_workspace) pc;
  if p_phone is null or p_phone !~ '^\+[0-9]{6,20}$' then
    raise exception 'Use international format, e.g. +971501234567' using errcode = '22023';
  end if;
  if coalesce(btrim(p_text), '') = '' then
    raise exception 'Message text is required' using errcode = '22023';
  end if;
  return public._wa_ingest(p_workspace, v_ch, 'sim_' || gen_random_uuid()::text, p_phone, null,
                           left(p_name, 120), false, left(p_text, 8000), 'text', null, now());
end;
$$;

revoke execute on function public._wa_channel_for(text, text) from public, anon, authenticated;
revoke execute on function public.wa_prepare_channel(uuid) from public, anon;
revoke execute on function public.wa_simulate_inbound(uuid, text, text, text) from public, anon;
revoke execute on function public.wa_webhook_message(text, text, text, text, text, text, boolean, text, text, integer, timestamptz) from public;
revoke execute on function public.wa_webhook_connection(text, text, text, text, text) from public;
grant execute on function public.wa_prepare_channel(uuid) to authenticated;
grant execute on function public.wa_simulate_inbound(uuid, text, text, text) to authenticated;
grant execute on function public.wa_webhook_message(text, text, text, text, text, text, boolean, text, text, integer, timestamptz) to anon, authenticated;
grant execute on function public.wa_webhook_connection(text, text, text, text, text) to anon, authenticated;

alter publication supabase_realtime add table public.conversations, public.messages, public.contacts, public.channels;
