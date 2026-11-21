create table public.briefings (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  data jsonb not null
);
create index briefings_created_at_idx on public.briefings (created_at desc);

create table public.agent_requests (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  client text not null,
  path text not null
);
create index agent_requests_client_created_idx on public.agent_requests (client, created_at desc);

-- Server-only tables: RLS on with no policies, so the public anon/publishable key can read nothing.
-- The agent server uses the secret (service role) key, which bypasses RLS.
alter table public.briefings enable row level security;
alter table public.agent_requests enable row level security;

create or replace function public.prune_agent_data() returns void
language sql
set search_path = ''
as $$
  delete from public.agent_requests where created_at < now() - interval '2 days';
  delete from public.briefings where created_at < now() - interval '2 days';
$$;
revoke all on function public.prune_agent_data() from public, anon, authenticated;
