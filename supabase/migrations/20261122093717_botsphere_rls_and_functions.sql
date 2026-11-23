create or replace function public.is_workspace_member(ws uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = (select auth.uid()));
$$;

create or replace function public.has_workspace_role(ws uuid, roles public.member_role[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role = any (roles));
$$;

create or replace function public.bs_handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.member_profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_botsphere
  after insert on auth.users
  for each row execute function public.bs_handle_new_user();

create or replace function public.create_workspace(p_name text, p_industry text default null, p_timezone text default 'UTC')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ws  uuid;
  nm  text := btrim(p_name);
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if nm is null or char_length(nm) = 0 then
    raise exception 'Workspace name is required' using errcode = '22023';
  end if;
  if (select count(*) from public.workspace_members where user_id = uid and role = 'owner') >= 10 then
    raise exception 'Workspace limit reached' using errcode = '54000';
  end if;

  insert into public.workspaces (name, industry, timezone, created_by, office_hours_json)
  values (
    nm, nullif(btrim(p_industry), ''), coalesce(nullif(btrim(p_timezone), ''), 'UTC'), uid,
    '{"sat":{"open":true,"from":"09:00","to":"21:00"},"sun":{"open":true,"from":"09:00","to":"21:00"},
      "mon":{"open":true,"from":"09:00","to":"21:00"},"tue":{"open":true,"from":"09:00","to":"21:00"},
      "wed":{"open":true,"from":"09:00","to":"21:00"},"thu":{"open":true,"from":"09:00","to":"21:00"},
      "fri":{"open":false,"from":"14:00","to":"22:00"}}'::jsonb
  )
  returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, role) values (ws, uid, 'owner');

  insert into public.member_profiles (id, email, full_name)
  select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))
  from auth.users u where u.id = uid
  on conflict (id) do nothing;

  insert into public.agent_configs (workspace_id, bot_name, system_prompt, voice_id, handover_rules)
  values (
    ws,
    'Assistant',
    format(
      E'You are the friendly WhatsApp assistant for %s.\n\nGoals:\n1. Answer questions using the Knowledge Base only.\n2. Qualify the lead (need, timeline, budget).\n3. Offer 2 concrete time slots to book.\n\nRules:\n- Keep replies under 60 words, warm and professional.\n- Never invent prices or policies.\n- Reply in the customer''s language.',
      nm
    ),
    'aria',
    '[
      {"id":"emergency","label":"Emergency or urgent keywords","description":"urgent, emergency, pain, broken","enabled":true},
      {"id":"medical","label":"Medical or legal advice requests","description":"Questions only a qualified professional should answer","enabled":true},
      {"id":"high_value","label":"High-value lead","description":"Estimated deal value above 30,000","enabled":true},
      {"id":"asks_human","label":"Customer asks for a human","description":"\"talk to a person\", \"real agent\", \"call me\"","enabled":true},
      {"id":"negative","label":"Negative sentiment detected","description":"Angry or frustrated tone for 2+ messages","enabled":false}
    ]'::jsonb
  );

  insert into public.quick_replies (workspace_id, shortcut, content_text) values
    (ws, '/hours',    'Our opening hours are Sat–Thu 09:00–21:00.'),
    (ws, '/book',     'I''d be happy to book you in! Which day and time works best for you?'),
    (ws, '/location', 'Here is our location: (add your address and map link)');

  return ws;
end;
$$;

create or replace function public.seed_demo_contacts(p_workspace uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if not public.has_workspace_role(p_workspace, array['owner','admin']::public.member_role[]) then
    raise exception 'Only owners and admins can load sample data' using errcode = '42501';
  end if;

  insert into public.contacts (workspace_id, name, phone, email, pipeline_stage, tags, source, deal_value, ai_summary, notes, last_active_at, created_at)
  select p_workspace, d.name, d.phone, d.email, d.stage::public.pipeline_stage, d.tags, d.source, d.value, d.summary, '',
         now() - make_interval(mins => d.active_mins), now() - make_interval(mins => d.created_mins)
  from (values
    ('Omar Haddad',       '+971 55 214 9083', 'omar.haddad@gmail.com',   'qualified', array['Invisalign','High intent'], 'WhatsApp',      14500, 'Interested in Invisalign; asked about monthly payment plans. Prefers weekday evenings.', 2, 1560),
    ('Priya Raman',       '+971 52 771 3402', 'priya.r@outlook.com',     'new_lead',  array['Whitening','Price shopper'], 'Instagram ad', 1800,  'Asked about whitening price and how long results last.', 6, 45),
    ('James Whitfield',   '+44 7700 900 418', 'j.whitfield@protonmail.com','booked',  array['Implant','Tourist'],        'Google',       22000, 'Visiting in December; booked implant consultation for Dec 3 at 11:00.', 18, 4320),
    ('Fatima Al Zarooni', '+971 50 118 6620', null,                      'new_lead',  array['Emergency'],                'WhatsApp',      650,   'Severe tooth pain; escalated to a human for a same-day slot.', 9, 30),
    ('Daniel Costa',      '+351 912 334 870', 'dcosta@me.com',           'qualified', array['Veneers'],                  'Website chat', 18000, 'Wants veneer before/after photos; deciding between 8 and 10 veneers.', 41, 3000),
    ('Aisha Siddiqui',    '+92 300 552 1188', 'aisha.sid@gmail.com',     'booked',    array['Cleaning','Family'],        'Referral',      900,   'Booked a family cleaning for 3 on Saturday 10:30.', 63, 7200),
    ('Mark Jensen',       '+1 415 555 0193',  'mark.j@jensenco.com',     'closed',    array['Invisalign','VIP'],         'Referral',     16200, 'Paid in full. Next aligner check in 6 weeks.', 300, 43200),
    ('Rahul Mehta',       '+971 54 440 7612', null,                      'qualified', array['Root canal','Insurance'],   'WhatsApp',      3200, 'Has insurance; asking about coverage for root canal + crown.', 130, 480),
    ('Elena Petrova',     '+7 916 204 55 81', 'elena.petrova@yandex.ru', 'booked',    array['Veneers','Tourist'],        'Instagram ad', 24000, 'Booked consultation; prefers a Russian-speaking coordinator.', 240, 5760),
    ('Khalid Rahman',     '+971 50 667 1290', 'khalid@rahmanholdings.ae','qualified', array['Smile makeover','VIP'],     'Referral',     38000, 'Considering a full smile makeover; wants a private evening slot.', 240, 1800),
    ('Lucia Fernández',   '+34 612 448 903',  'lucia.fz@gmail.com',      'new_lead',  array['Braces','Teen'],            'Instagram ad',  7500, 'Parent asking about braces for a 14-year-old: ceramic vs metal.', 180, 180),
    ('Grace Okafor',      '+234 803 221 7765','grace.okafor@yahoo.com',  'closed',    array['Whitening'],                'TikTok',        1800, 'Whitening completed; left a 5-star review.', 8640, 28800)
  ) as d(name, phone, email, stage, tags, source, value, summary, active_mins, created_mins)
  on conflict (workspace_id, phone) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.is_workspace_member(uuid)                       from public, anon;
revoke execute on function public.has_workspace_role(uuid, public.member_role[])  from public, anon;
revoke execute on function public.create_workspace(text, text, text)              from public, anon;
revoke execute on function public.seed_demo_contacts(uuid)                        from public, anon;
revoke execute on function public.bs_handle_new_user()                            from public, anon, authenticated;
grant  execute on function public.is_workspace_member(uuid)                       to authenticated;
grant  execute on function public.has_workspace_role(uuid, public.member_role[])  to authenticated;
grant  execute on function public.create_workspace(text, text, text)              to authenticated;
grant  execute on function public.seed_demo_contacts(uuid)                        to authenticated;

alter table public.member_profiles   enable row level security;
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.channels          enable row level security;
alter table public.contacts          enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;
alter table public.agent_configs     enable row level security;
alter table public.knowledge_items   enable row level security;
alter table public.quick_replies     enable row level security;
alter table public.calls             enable row level security;

create policy "member_profiles: read self and teammates" on public.member_profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.workspace_members mine
      join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = member_profiles.id
    )
  );
create policy "member_profiles: update self" on public.member_profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "workspaces: members read" on public.workspaces
  for select to authenticated using ((select public.is_workspace_member(id)));
create policy "workspaces: owner/admin update" on public.workspaces
  for update to authenticated
  using ((select public.has_workspace_role(id, array['owner','admin']::public.member_role[])))
  with check ((select public.has_workspace_role(id, array['owner','admin']::public.member_role[])));
create policy "workspaces: owner delete" on public.workspaces
  for delete to authenticated using ((select public.has_workspace_role(id, array['owner']::public.member_role[])));

create policy "members: read own workspaces" on public.workspace_members
  for select to authenticated using ((select public.is_workspace_member(workspace_id)));
create policy "members: owner/admin manage" on public.workspace_members
  for all to authenticated
  using ((select public.has_workspace_role(workspace_id, array['owner','admin']::public.member_role[])))
  with check ((select public.has_workspace_role(workspace_id, array['owner','admin']::public.member_role[])));

do $$
declare t text;
begin
  foreach t in array array['contacts', 'conversations', 'messages', 'quick_replies', 'calls'] loop
    execute format(
      'create policy "%1$s: members all" on public.%1$I for all to authenticated
         using ((select public.is_workspace_member(workspace_id)))
         with check ((select public.is_workspace_member(workspace_id)))', t);
  end loop;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['channels', 'agent_configs', 'knowledge_items'] loop
    execute format(
      'create policy "%1$s: members read" on public.%1$I for select to authenticated
         using ((select public.is_workspace_member(workspace_id)))', t);
    execute format(
      'create policy "%1$s: owner/admin write" on public.%1$I for all to authenticated
         using ((select public.has_workspace_role(workspace_id, array[''owner'',''admin'']::public.member_role[])))
         with check ((select public.has_workspace_role(workspace_id, array[''owner'',''admin'']::public.member_role[])))', t);
  end loop;
end;
$$;
