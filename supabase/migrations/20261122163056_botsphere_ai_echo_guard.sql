alter table public.conversations add column ai_sending_until timestamptz;

create or replace function public.wa_ai_claim_send(p_instance text, p_secret text, p_conversation uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_ok boolean;
begin
  update public.conversations c
     set ai_sending_until = now() + interval '30 seconds'
    from public._wa_channel_for(p_instance, p_secret) f, public.workspaces w
   where c.id = p_conversation and c.workspace_id = f.workspace_id and w.id = c.workspace_id
     and c.ai_enabled and c.status <> 'needs_human' and not w.global_ai_paused
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;
revoke execute on function public.wa_ai_claim_send(text, text, uuid) from public;
grant execute on function public.wa_ai_claim_send(text, text, uuid) to anon, authenticated;

-- Ingest one WhatsApp message. fromMe echoes that arrive while the AI holds the send claim are
-- recorded as AI messages; any other fromMe message is a human takeover and pauses the AI.
create or replace function public._wa_ingest(
  p_workspace uuid, p_channel uuid, p_wa_id text, p_phone text, p_jid text, p_push_name text,
  p_from_me boolean, p_text text, p_media public.media_type, p_duration integer, p_ts timestamptz)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_contact uuid;
  v_conv    uuid;
  v_ai      boolean;
  v_ai_echo boolean := false;
  v_msg     uuid;
  v_ts      timestamptz := coalesce(p_ts, now());
  v_preview text := coalesce(nullif(btrim(p_text), ''),
                     case p_media when 'audio' then '🎤 Voice note' when 'image' then '📷 Photo' else '' end);
begin
  insert into public.contacts (workspace_id, phone, name, wa_jid, source, last_active_at)
  values (p_workspace, p_phone,
          case when p_from_me then null else nullif(btrim(p_push_name), '') end,
          p_jid, 'WhatsApp', v_ts)
  on conflict (workspace_id, phone) do update
    set wa_jid = coalesce(excluded.wa_jid, public.contacts.wa_jid),
        name = coalesce(public.contacts.name, excluded.name),
        last_active_at = case when p_from_me then public.contacts.last_active_at
                              else greatest(public.contacts.last_active_at, excluded.last_active_at) end
  returning id into v_contact;

  select c.id, c.ai_enabled, (c.ai_sending_until is not null and c.ai_sending_until > now())
    into v_conv, v_ai, v_ai_echo
  from public.conversations c
  where c.workspace_id = p_workspace and c.contact_id = v_contact
  order by c.last_message_at desc
  limit 1;

  if v_conv is null then
    insert into public.conversations (workspace_id, contact_id, channel_id, last_message_at)
    values (p_workspace, v_contact, p_channel, v_ts)
    returning id, ai_enabled into v_conv, v_ai;
    v_ai_echo := false;
  end if;

  insert into public.messages (workspace_id, conversation_id, sender_type, content_text, media_type, duration_sec, wa_message_id, created_at)
  values (p_workspace, v_conv,
          case when p_from_me and v_ai_echo then 'ai' when p_from_me then 'human' else 'contact' end::public.sender_type,
          case when p_from_me and v_ai_echo and p_media = 'audio' then null else nullif(p_text, '') end,
          coalesce(p_media, 'text'), p_duration, p_wa_id, v_ts)
  on conflict (workspace_id, wa_message_id) do nothing
  returning id into v_msg;

  if v_msg is null then
    return null;
  end if;

  if p_from_me and v_ai_echo then
    update public.conversations
       set last_message_at = greatest(last_message_at, v_ts),
           last_message_preview = v_preview,
           last_message_sender = 'ai'
     where id = v_conv;
  elsif p_from_me then
    update public.conversations
       set last_message_at = greatest(last_message_at, v_ts),
           last_message_preview = v_preview,
           last_message_sender = 'human',
           ai_enabled = false,
           status = case when status = 'needs_human' then 'open' else status end
     where id = v_conv;
    if v_ai then
      insert into public.messages (workspace_id, conversation_id, sender_type, content_text, created_at)
      values (p_workspace, v_conv, 'system', 'A human replied · AI paused for this chat', v_ts + interval '1 millisecond');
    end if;
  else
    update public.conversations
       set last_message_at = greatest(last_message_at, v_ts),
           last_message_preview = v_preview,
           last_message_sender = 'contact',
           unread_count = unread_count + 1,
           status = case when status = 'closed' then 'open' else status end
     where id = v_conv;
  end if;

  return v_msg;
end;
$$;
revoke execute on function public._wa_ingest(uuid, uuid, text, text, text, text, boolean, text, public.media_type, integer, timestamptz) from public, anon, authenticated;

drop function public.wa_ai_still_active(text, text, uuid);
