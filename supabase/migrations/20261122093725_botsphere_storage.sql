insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge', 'knowledge', false, 20971520, array['application/pdf', 'text/plain', 'text/markdown'])
on conflict (id) do nothing;

create or replace function public.storage_workspace_id(object_name text)
returns uuid language plpgsql immutable set search_path = ''
as $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception when others then
  return null;
end;
$$;

create policy "knowledge files: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'knowledge' and (select public.is_workspace_member(public.storage_workspace_id(name))));

create policy "knowledge files: owner/admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'knowledge'
    and (select public.has_workspace_role(public.storage_workspace_id(name), array['owner','admin']::public.member_role[])));

create policy "knowledge files: owner/admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'knowledge'
    and (select public.has_workspace_role(public.storage_workspace_id(name), array['owner','admin']::public.member_role[])));

create policy "knowledge files: owner/admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'knowledge'
    and (select public.has_workspace_role(public.storage_workspace_id(name), array['owner','admin']::public.member_role[])));
