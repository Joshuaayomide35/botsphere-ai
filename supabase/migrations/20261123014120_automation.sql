-- Phase 5 · After-hours mode, ghosting follow-ups, media library, cron.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.bs_in_office_hours(p_hours jsonb, p_tz text, p_at timestamptz default now())
returns boolean language plpgsql stable set search_path = ''
as $$
declare
  v_local timestamp;
  v_t     time;
  d       jsonb;
  f       time;
  e       time;
begin
  begin
    v_local := p_at at time zone coalesce(nullif(p_tz, ''), 'UTC');
  exception when others then
    v_local := p_at at time zone 'UTC';
  end;
  v_t := v_local::time;

  d := p_hours -> to_char(v_local, 'dy');
  if d is not null and coalesce((d ->> 'open')::boolean, false) then
    f := (d ->> 'from')::time;
    e := (d ->> 'to')::time;
    if f < e and v_t >= f and v_t < e then return true; end if;
    if f > e and v_t >= f then return true; end if;
  end if;

  d := p_hours -> to_char(v_local - interval '1 day', 'dy');
  if d is not null and coalesce((d ->> 'open')::boolean, false) then
    f := (d ->> 'from')::time;
    e := (d ->> 'to')::time;
    if f > e and v_t < e then return true; end if;
  end if;
  return false;
exception when others then
  return false;
end;
$$;

create or replace function public.bs_ai_on_duty(p_workspace uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select not w.global_ai_paused
     and not (coalesce((w.office_hours_json ->> 'after_hours_only')::boolean, false)
              and public.bs_in_office_hours(w.office_hours_json, w.timezone))
  from public.workspaces w
  where w.id = p_workspace;
$$;
revoke execute on function public.bs_ai_on_duty(uuid) from public, anon;

alter table public.agent_configs
  add column follow_up_enabled     boolean not null default false,
  add column follow_up_after_hours integer not null default 24 check (follow_up_after_hours between 1 and 168),
  add column follow_up_max         integer not null default 2 check (follow_up_max between 1 and 5),
  add column follow_up_message     text not null default '' check (char_length(follow_up_message) <= 1000);

alter table public.conversations
  add column follow_up_count         integer not null default 0 check (follow_up_count >= 0),
  add column follow_up_claimed_until timestamptz;

create or replace function public._bs_reset_follow_up()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations
     set follow_up_count = 0, follow_up_claimed_until = null
   where id = new.conversation_id and (follow_up_count <> 0 or follow_up_claimed_until is not null);
  return new;
end;
$$;
revoke execute on function public._bs_reset_follow_up() from public, anon, authenticated;

create trigger messages_reset_follow_up
  after insert on public.messages
  for each row when (new.sender_type = 'contact')
  execute function public._bs_reset_follow_up();

create table public.media_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 120),
  description   text not null default '' check (char_length(description) <= 500),
  storage_path  text not null,
  public_url    text not null,
  mime_type     text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes    bigint,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index media_items_workspace_idx on public.media_items (workspace_id, created_at desc);
create trigger media_items_updated_at before update on public.media_items for each row execute function public.set_updated_at();

alter table public.media_items enable row level security;
create policy "media_items: members read" on public.media_items
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy "media_items: owner/admin write" on public.media_items
  for all to authenticated
  using ((select public.has_workspace_role(workspace_id, array['owner','admin']::public.member_role[])))
  with check ((select public.has_workspace_role(workspace_id, array['owner','admin']::public.member_role[])));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "media files: owner/admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media'
    and (select public.has_workspace_role(public.storage_workspace_id(name), array['owner','admin']::public.member_role[])));
create policy "media files: owner/admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media'
    and (select public.has_workspace_role(public.storage_workspace_id(name), array['owner','admin']::public.member_role[])));

create or replace function public._wa_ai_payload(p_ws uuid, p_conv uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'workspace_id', p_ws,
    'conversation_id', c.id,
    'follow_up_count', c.follow_up_count,
    'business', jsonb_build_object('name', w.name, 'timezone', w.timezone, 'owner_alert_phone', w.owner_alert_phone),
    'contact', jsonb_build_object('name', k.name, 'phone', k.phone, 'stage', k.pipeline_stage, 'deal_value', k.deal_value),
    'config', to_jsonb(a) - 'id' - 'workspace_id' - 'created_at' - 'updated_at',
    'knowledge', coalesce((
      select jsonb_agg(jsonb_build_object('title', ki.title, 'content', left(ki.content_extracted, 60000)) order by ki.updated_at desc)
      from public.knowledge_items ki
      where ki.workspace_id = p_ws and ki.is_active and ki.status = 'ready' and coalesce(ki.content_extracted, '') <> ''
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(jsonb_build_object('id', mi.id, 'title', mi.title, 'description', mi.description,
                                          'url', mi.public_url, 'mime', mi.mime_type) order by mi.created_at)
      from (
        select * from public.media_items m
        where m.workspace_id = p_ws and m.is_active
        order by m.created_at desc
        limit 40
      ) mi
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(h order by h.created_at)
      from (
        select m.sender_type, m.media_type, m.content_text, m.transcript_text, m.created_at
        from public.messages m
        where m.conversation_id = c.id and m.sender_type <> 'system'
        order by m.created_at desc
        limit 15
      ) h
    ), '[]'::jsonb)
  )
  from public.conversations c
  join public.workspaces w on w.id = c.workspace_id
  join public.contacts k on k.id = c.contact_id
  left join public.agent_configs a on a.workspace_id = c.workspace_id
  where c.id = p_conv and c.workspace_id = p_ws;
$$;
revoke execute on function public._wa_ai_payload(uuid, uuid) from public, anon, authenticated;

create or replace function public.wa_ai_context(p_instance text, p_secret text, p_message_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ws   uuid;
  v_msg  public.messages;
  v_conv public.conversations;
begin
  select f.workspace_id into v_ws from public._wa_channel_for(p_instance, p_secret) f;
  if v_ws is null then
    raise exception 'Invalid webhook credentials' using errcode = '42501';
  end if;

  select * into v_msg from public.messages m where m.id = p_message_id and m.workspace_id = v_ws;
  if v_msg.id is null or v_msg.sender_type <> 'contact' then return null; end if;

  select * into v_conv from public.conversations c where c.id = v_msg.conversation_id;
  if not v_conv.ai_enabled or v_conv.status = 'needs_human' then return null; end if;
  if not coalesce(public.bs_ai_on_duty(v_ws), false) then return null; end if;
  if exists (
    select 1 from public.messages m
    where m.conversation_id = v_conv.id and m.sender_type = 'contact' and m.created_at > v_msg.created_at
  ) then
    return null;
  end if;

  return public._wa_ai_payload(v_ws, v_conv.id)
      || jsonb_build_object('trigger', jsonb_build_object(
           'id', v_msg.id, 'media_type', v_msg.media_type, 'wa_message_id', v_msg.wa_message_id,
           'text', v_msg.content_text, 'transcript', v_msg.transcript_text));
end;
$$;

create or replace function public._bs_due_follow_ups(p_limit integer)
returns table (conversation_id uuid, workspace_id uuid, instance_name text, webhook_secret text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.workspace_id, ch.instance_id, s.webhook_secret
  from public.conversations c
  join public.agent_configs a on a.workspace_id = c.workspace_id and a.follow_up_enabled
  join public.workspaces w on w.id = c.workspace_id and not w.global_ai_paused
  join public.contacts k on k.id = c.contact_id and k.pipeline_stage <> 'closed'
  join public.channels ch on ch.id = c.channel_id and ch.status = 'connected' and ch.instance_id is not null
  join public.channel_secrets s on s.channel_id = ch.id
  where c.ai_enabled
    and c.status = 'open'
    and c.last_message_sender = 'ai'
    and c.follow_up_count < a.follow_up_max
    and c.last_message_at <= now() - make_interval(hours => a.follow_up_after_hours)
    and c.last_message_at > now() - interval '30 days'
    and (c.follow_up_claimed_until is null or c.follow_up_claimed_until < now())
    and (now() at time zone coalesce(nullif(w.timezone, ''), 'UTC'))::time between time '09:00' and time '20:00'
  order by c.last_message_at
  limit p_limit;
$$;
revoke execute on function public._bs_due_follow_ups(integer) from public, anon, authenticated;

create or replace function public.cron_claim_follow_ups(p_cron_secret text)
returns table (conversation_id uuid, instance_name text, webhook_secret text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_expected text;
begin
  select ds.decrypted_secret into v_expected from vault.decrypted_secrets ds where ds.name = 'botsphere_cron_secret';
  if v_expected is null or p_cron_secret is null or p_cron_secret <> v_expected then
    raise exception 'Invalid cron secret' using errcode = '42501';
  end if;

  return query
  with due as (
    select d.conversation_id, d.instance_name, d.webhook_secret from public._bs_due_follow_ups(5) d
  ), claimed as (
    update public.conversations c
       set follow_up_claimed_until = now() + interval '10 minutes'
      from due
     where c.id = due.conversation_id
       and (c.follow_up_claimed_until is null or c.follow_up_claimed_until < now())
    returning c.id
  )
  select due.conversation_id, due.instance_name, due.webhook_secret
  from due join claimed on claimed.id = due.conversation_id;
end;
$$;
revoke execute on function public.cron_claim_follow_ups(text) from public;
grant execute on function public.cron_claim_follow_ups(text) to anon, authenticated;

create or replace function public.wa_ai_follow_up_context(p_instance text, p_secret text, p_conversation uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ws uuid;
begin
  select f.workspace_id into v_ws from public._wa_channel_for(p_instance, p_secret) f;
  if v_ws is null then
    raise exception 'Invalid webhook credentials' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.conversations c
    join public.agent_configs a on a.workspace_id = c.workspace_id and a.follow_up_enabled
    where c.id = p_conversation and c.workspace_id = v_ws and c.ai_enabled and c.status = 'open'
      and c.last_message_sender = 'ai' and c.follow_up_count < a.follow_up_max
  ) then
    return null;
  end if;
  return public._wa_ai_payload(v_ws, p_conversation);
end;
$$;
revoke execute on function public.wa_ai_follow_up_context(text, text, uuid) from public;
grant execute on function public.wa_ai_follow_up_context(text, text, uuid) to anon, authenticated;

create or replace function public.wa_ai_record(
  p_instance text, p_secret text, p_conversation uuid, p_kind text, p_text text,
  p_media text, p_duration integer, p_wa_id text, p_reason text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_ws   uuid;
  v_conv public.conversations;
  v_now  timestamptz := now();
  v_media public.media_type := case when p_media = 'audio' then 'audio' else 'text' end::public.media_type;
begin
  select f.workspace_id into v_ws from public._wa_channel_for(p_instance, p_secret) f;
  if v_ws is null then
    raise exception 'Invalid webhook credentials' using errcode = '42501';
  end if;
  select * into v_conv from public.conversations c where c.id = p_conversation and c.workspace_id = v_ws;
  if v_conv.id is null then return false; end if;

  if coalesce(btrim(p_text), '') <> '' then
    insert into public.messages (workspace_id, conversation_id, sender_type, content_text, media_type, duration_sec,
                                 transcript_text, wa_message_id, created_at)
    values (v_ws, v_conv.id, 'ai', case when v_media = 'audio' then null else left(p_text, 8000) end, v_media, p_duration,
            case when v_media = 'audio' then left(p_text, 8000) end, p_wa_id, v_now)
    on conflict (workspace_id, wa_message_id) do update
      set sender_type = 'ai',
          duration_sec = coalesce(public.messages.duration_sec, excluded.duration_sec),
          transcript_text = coalesce(public.messages.transcript_text, excluded.transcript_text);
  end if;

  update public.conversations
     set last_message_at = greatest(last_message_at, v_now),
         last_message_preview = case when coalesce(btrim(p_text), '') = '' then last_message_preview
                                     when v_media = 'audio' then '🎤 Voice note' else left(p_text, 200) end,
         last_message_sender = case when coalesce(btrim(p_text), '') = '' then last_message_sender else 'ai' end,
         status = case when p_kind = 'handover' then 'needs_human' else status end,
         ai_enabled = case when p_kind = 'handover' then false else ai_enabled end,
         follow_up_count = case when p_kind = 'follow_up' then follow_up_count + 1 else follow_up_count end,
         follow_up_claimed_until = null,
         ai_sending_until = null
   where id = v_conv.id;

  if p_kind = 'handover' then
    insert into public.messages (workspace_id, conversation_id, sender_type, content_text, created_at)
    values (v_ws, v_conv.id, 'system',
            'AI paused · Handover triggered: ' || coalesce(nullif(btrim(p_reason), ''), 'needs a human'),
            v_now + interval '1 millisecond');
  end if;
  return true;
end;
$$;

create or replace function public.wa_ai_record_media(
  p_instance text, p_secret text, p_conversation uuid, p_media_id uuid, p_wa_id text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_ws   uuid;
  v_item public.media_items;
begin
  select f.workspace_id into v_ws from public._wa_channel_for(p_instance, p_secret) f;
  if v_ws is null then
    raise exception 'Invalid webhook credentials' using errcode = '42501';
  end if;
  select * into v_item from public.media_items m where m.id = p_media_id and m.workspace_id = v_ws;
  if v_item.id is null
     or not exists (select 1 from public.conversations c where c.id = p_conversation and c.workspace_id = v_ws) then
    return false;
  end if;

  insert into public.messages (workspace_id, conversation_id, sender_type, content_text, media_type, media_url, wa_message_id, created_at)
  values (v_ws, p_conversation, 'ai', v_item.title, 'image', v_item.public_url, p_wa_id, now())
  on conflict (workspace_id, wa_message_id) do update
    set sender_type = 'ai',
        media_url = excluded.media_url,
        content_text = coalesce(public.messages.content_text, excluded.content_text);

  update public.conversations
     set last_message_at = greatest(last_message_at, now()),
         last_message_preview = '📷 ' || v_item.title,
         last_message_sender = 'ai'
   where id = p_conversation;
  return true;
end;
$$;
revoke execute on function public.wa_ai_record_media(text, text, uuid, uuid, text) from public;
grant execute on function public.wa_ai_record_media(text, text, uuid, uuid, text) to anon, authenticated;

-- Grants for the webhook-secret-guarded AI RPCs (anon key + channel secret).
revoke execute on function public.wa_ai_context(text, text, uuid) from public;
revoke execute on function public.wa_ai_record(text, text, uuid, text, text, text, integer, text, text) from public;
grant execute on function public.wa_ai_context(text, text, uuid) to anon, authenticated;
grant execute on function public.wa_ai_record(text, text, uuid, text, text, text, integer, text, text) to anon, authenticated;

create or replace function public.bs_cron_tick()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from public._bs_due_follow_ups(1)) then
    return;
  end if;
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'botsphere_app_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'botsphere_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/cron/follow-ups',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;
revoke execute on function public.bs_cron_tick() from public, anon, authenticated;

select cron.schedule('botsphere-follow-ups', '* * * * *', 'select public.bs_cron_tick()');
