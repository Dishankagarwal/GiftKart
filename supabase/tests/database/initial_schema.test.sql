begin;

select plan(36);

select ok(
  (select count(*) = 13
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  'all 13 Phase 1 tables exist'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'gifts'
      and column_name = 'gift_type'
  ),
  'guests choose the gifting method; gifts have no fixed type'
);

select ok(
  (select count(*) = 13
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
  'RLS is enabled on every application table'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'reservations_one_active_per_gift'
      and indexdef ilike '%where (status = ''reserved''%'
  ),
  'only one active reservation can exist per gift'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'registries_one_per_owner'
      and indexdef ilike '%unique%owner_id%'
  ),
  'each account can own only one registry'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'gift_categories_name_unique'
      and indexdef ilike '%lower(name)%'
  ),
  'category names are unique without case sensitivity per registry'
);

select ok(not has_table_privilege('anon', 'public.guests', 'select'),
  'anonymous users cannot read guest contact information');
select ok(has_table_privilege('authenticated', 'public.guests', 'select'),
  'authenticated registry members can read their guests subject to RLS');
select ok(not has_table_privilege('authenticated', 'public.guests', 'insert'),
  'authenticated users cannot directly create guest records');
select ok(not has_table_privilege('anon', 'public.reservations', 'select'),
  'anonymous users cannot read reservation records');
select ok(not has_table_privilege('anon', 'public.contributions', 'select'),
  'anonymous users cannot read contribution records');
select ok(not has_table_privilege('authenticated', 'public.contributions', 'update'),
  'authenticated users cannot bypass contribution state transitions');
select ok(not has_table_privilege('anon', 'public.payment_settings', 'select'),
  'anonymous users cannot query payment settings directly');
select ok(not has_table_privilege('anon', 'public.guest_access_tokens', 'select'),
  'anonymous users cannot read guest token hashes');
select ok(not has_table_privilege('anon', 'private.public_api_rate_limits', 'select'),
  'anonymous users cannot read public endpoint rate-limit keys');
select ok(not has_table_privilege('service_role', 'private.public_api_rate_limits', 'select'),
  'service role cannot directly read public endpoint rate-limit keys');
select ok(
  (select c.relrowsecurity
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relname = 'public_api_rate_limits'),
  'rate-limit counters also have row-level security enabled'
);
select ok(not has_table_privilege('anon', 'public.registry_members', 'select'),
  'anonymous users cannot read registry membership');
select ok(not has_table_privilege('anon', 'public.audit_logs', 'select'),
  'anonymous users cannot read audit history');
select ok(not has_column_privilege('anon', 'public.registries', 'owner_id', 'select'),
  'anonymous registry reads do not expose owner IDs');
select ok(has_column_privilege('anon', 'public.registries', 'public_slug', 'select'),
  'anonymous users can read the public registry slug');

select ok(has_function_privilege(
  'anon', 'public.get_public_registry(text)', 'execute'
), 'anonymous guests can fetch a published registry through the safe RPC');
select ok(not has_function_privilege(
  'anon', 'public.create_guest_reservation(uuid,text,text,text)', 'execute'
), 'guest reservation writes are restricted to the trusted Edge Function role');
select ok(not has_function_privilege(
  'anon', 'public.create_group_pledge(uuid,numeric,text,text,text)', 'execute'
), 'group pledge writes are restricted to the trusted Edge Function role');
select ok(has_function_privilege(
  'service_role', 'public.create_guest_reservation(uuid,text,text,text)', 'execute'
), 'trusted Edge Functions can create reservations');
select ok(has_function_privilege(
  'service_role', 'public.create_group_pledge(uuid,numeric,text,text,text)', 'execute'
), 'trusted Edge Functions can create group pledges');
select ok(not has_function_privilege(
  'anon', 'public.get_guest_activity(text)', 'execute'
), 'guest status reads are mediated by a rate-limited Edge Function');
select ok(has_function_privilege(
  'service_role', 'public.get_guest_activity(text)', 'execute'
), 'trusted Edge Functions can retrieve guest status');
select ok(not has_function_privilege(
  'anon', 'public.cancel_guest_reservation(text)', 'execute'
), 'guest cancellation is mediated by a trusted Edge Function');
select ok(not has_function_privilege(
  'anon', 'public.report_guest_payment(text)', 'execute'
), 'payment reports are mediated by a trusted Edge Function');
select ok(not has_function_privilege(
  'anon', 'public.consume_public_rate_limit(text,text,integer,integer)', 'execute'
), 'anonymous guests cannot alter rate-limit counters');
select ok(has_function_privilege(
  'service_role', 'public.consume_public_rate_limit(text,text,integer,integer)', 'execute'
), 'trusted Edge Functions can atomically consume rate limits');
select ok(has_function_privilege(
  'authenticated', 'public.review_contribution(uuid,text,text)', 'execute'
), 'signed-in registry members can request a contribution decision');
select ok(not has_function_privilege(
  'anon', 'public.review_contribution(uuid,text,text)', 'execute'
), 'anonymous guests cannot verify or reject contributions');
select ok(has_function_privilege(
  'service_role', 'public.expire_stale_pledges()', 'execute'
), 'a trusted scheduled worker can expire stale pledges');
select ok(
  (select count(*) = 2
   from cron.job
   where jobname in ('expire-stale-pledges', 'cleanup-public-api-rate-limits')),
  'pledge expiry and rate-limit cleanup are scheduled'
);

select * from finish();

rollback;
