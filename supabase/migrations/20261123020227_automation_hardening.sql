drop extension if exists pg_net;
create extension pg_net schema extensions;
revoke execute on function public.bs_ai_on_duty(uuid) from authenticated;
