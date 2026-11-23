-- Phase 4 · AI brain RPCs. wa_ai_context / wa_ai_record are (re)defined in 20261123014120_automation.sql.

create or replace function public.wa_ai_store_transcript(p_instance text, p_secret text, p_message_id uuid, p_transcript text, p_media_url text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_ws uuid;
begin
  select f.workspace_id into v_ws from public._wa_channel_for(p_instance, p_secret) f;
  if v_ws is null then
    raise exception 'Invalid webhook credentials' using errcode = '42501';
  end if;
  update public.messages
     set transcript_text = left(p_transcript, 8000),
         media_url = coalesce(p_media_url, media_url)
   where id = p_message_id and workspace_id = v_ws;
end;
$$;

-- Temporary helper, dropped by the echo-guard migration.
create or replace function public.wa_ai_still_active(p_instance text, p_secret text, p_conversation uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public._wa_channel_for(p_instance, p_secret) f
    join public.conversations c on c.workspace_id = f.workspace_id and c.id = p_conversation
    join public.workspaces w on w.id = c.workspace_id
    where c.ai_enabled and c.status <> 'needs_human' and not w.global_ai_paused
  );
$$;

revoke execute on function public.wa_ai_store_transcript(text, text, uuid, text, text) from public;
grant execute on function public.wa_ai_store_transcript(text, text, uuid, text, text) to anon, authenticated;
