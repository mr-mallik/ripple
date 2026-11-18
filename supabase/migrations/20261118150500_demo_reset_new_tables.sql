-- Demo reset also clears the new walk and request data.
create or replace function public.demo_reset()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Only staff can reset the demo.' using errcode = '42501';
  end if;
  delete from public.alerts where true;
  delete from public.cluster_events where true;
  delete from public.formal_requests where true;
  delete from public.reports where true;
  delete from public.clusters where true;
  delete from public.walks where true;
  delete from public.walk_requests where true;
  delete from public.walk_offers where true;
  delete from public.student_concerns where true;
end;
$$;
