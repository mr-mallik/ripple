-- Only people with a Ripple account can report. Anonymous sessions can still
-- read heads-ups, but can't add reports.
-- "Send anonymously" still hides who reported from staff: reports only ever
-- store the account id, and staff screens never show it.
create policy "only account holders can report" on public.reports
  as restrictive
  for insert to authenticated
  with check (coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false);
