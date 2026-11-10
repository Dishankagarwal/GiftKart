create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.registries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete restrict,
  couple_names text not null check (char_length(btrim(couple_names)) between 1 and 160),
  wedding_date date,
  city text check (city is null or char_length(city) <= 120),
  welcome_message text not null default '' check (char_length(welcome_message) <= 2000),
  public_slug text not null unique
    check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
    check (char_length(public_slug) between 3 and 80),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.registry_members (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.registries (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  invited_email text,
  role text not null check (role in ('owner', 'partner')),
  status text not null check (status in ('invited', 'active', 'revoked')),
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (role = 'owner' and user_id is not null and status = 'active')
    or (role = 'partner' and (user_id is not null or invited_email is not null))
  ),
  unique (registry_id, user_id)
);

create unique index registry_members_one_owner
  on public.registry_members (registry_id)
  where role = 'owner';

create unique index registry_members_email_unique
  on public.registry_members (registry_id, lower(invited_email))
  where invited_email is not null and status <> 'revoked';

create table public.gift_categories (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.registries (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (registry_id, id)
);

create unique index gift_categories_name_unique
  on public.gift_categories (registry_id, lower(name));

create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.registries (id) on delete cascade,
  category_id uuid,
  gift_type text not null check (gift_type in ('individual', 'group')),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  target_amount numeric(12, 2) not null check (target_amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  external_url text check (
    external_url is null
    or (char_length(external_url) <= 2048 and external_url ~* '^https?://')
  ),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registry_id, id),
  foreign key (registry_id, category_id)
    references public.gift_categories (registry_id, id)
    on delete set null (category_id)
);

create table public.gift_images (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null,
  gift_id uuid not null,
  storage_path text not null unique,
  alt_text text not null default '' check (char_length(alt_text) <= 240),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (storage_path like registry_id::text || '/%'),
  foreign key (registry_id, gift_id)
    references public.gifts (registry_id, id)
    on delete cascade
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.registries (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  email text check (email is null or (char_length(email) <= 254 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  phone text check (phone is null or (char_length(phone) between 7 and 20 and phone ~ '^\+?[0-9 ()-]+$')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(email, phone) = 1),
  unique (registry_id, id)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null,
  gift_id uuid not null,
  guest_id uuid not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'cancelled', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (registry_id, gift_id)
    references public.gifts (registry_id, id)
    on delete cascade,
  foreign key (registry_id, guest_id)
    references public.guests (registry_id, id)
    on delete cascade,
  unique (registry_id, id)
);

create unique index reservations_one_active_per_gift
  on public.reservations (gift_id)
  where status = 'reserved';

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null,
  gift_id uuid not null,
  guest_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'pledged'
    check (status in ('pledged', 'payment_reported', 'verified', 'rejected', 'expired', 'released')),
  pledged_at timestamptz not null default now(),
  expires_at timestamptz default (now() + interval '72 hours'),
  payment_reported_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  check (status <> 'pledged' or expires_at is not null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (registry_id, gift_id)
    references public.gifts (registry_id, id)
    on delete cascade,
  foreign key (registry_id, guest_id)
    references public.guests (registry_id, id)
    on delete cascade,
  unique (registry_id, id)
);

create index contributions_capacity_by_gift
  on public.contributions (gift_id, status, expires_at);

create table public.payment_settings (
  registry_id uuid primary key references public.registries (id) on delete cascade,
  upi_id text check (upi_id is null or char_length(upi_id) <= 120),
  bank_account_name text check (bank_account_name is null or char_length(bank_account_name) <= 160),
  bank_account_number text check (bank_account_number is null or char_length(bank_account_number) <= 64),
  bank_ifsc text check (bank_ifsc is null or bank_ifsc ~* '^[a-z]{4}0[a-z0-9]{6}$'),
  cash_instructions text check (cash_instructions is null or char_length(cash_instructions) <= 1000),
  general_instructions text not null default '' check (char_length(general_instructions) <= 2000),
  updated_at timestamptz not null default now()
);

create table public.guest_access_tokens (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null,
  reservation_id uuid,
  contribution_id uuid,
  token_hash bytea not null unique,
  expires_at timestamptz not null default (now() + interval '90 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(reservation_id, contribution_id) = 1),
  foreign key (registry_id, reservation_id)
    references public.reservations (registry_id, id)
    on delete cascade,
  foreign key (registry_id, contribution_id)
    references public.contributions (registry_id, id)
    on delete cascade
);

create unique index guest_tokens_one_per_reservation
  on public.guest_access_tokens (reservation_id)
  where reservation_id is not null;

create unique index guest_tokens_one_per_contribution
  on public.guest_access_tokens (contribution_id)
  where contribution_id is not null;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  registry_id uuid not null references public.registries (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_kind text not null check (actor_kind in ('member', 'guest', 'system')),
  entity_type text not null check (entity_type in ('registry', 'gift', 'reservation', 'contribution', 'member', 'payment_settings')),
  entity_id uuid,
  action text not null check (char_length(action) between 1 and 80),
  old_status text,
  new_status text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_logs_registry_created
  on public.audit_logs (registry_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.registries (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 80),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 1000),
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_unread
  on public.notifications (recipient_user_id, created_at desc)
  where read_at is null;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table private.public_api_rate_limits (
  endpoint text not null,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (endpoint, key_hash)
);
alter table private.public_api_rate_limits enable row level security;
revoke all on table private.public_api_rate_limits from public, anon, authenticated, service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function public.is_verified_auth_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = (select auth.uid()) and u.email_confirmed_at is not null
  );
$$;

create or replace function public.guard_gift_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_committed numeric(12, 2);
begin
  if new.gift_type <> old.gift_type and (
    exists (select 1 from public.reservations r where r.gift_id = old.id)
    or exists (select 1 from public.contributions c where c.gift_id = old.id)
  ) then
    raise exception using errcode = '23514', message = 'gift type cannot change after guest activity';
  end if;

  if new.gift_type = 'group' and new.target_amount <> old.target_amount then
    select coalesce(sum(c.amount), 0) into v_committed
    from public.contributions c
    where c.gift_id = old.id
      and (
        c.status in ('verified', 'payment_reported')
        or (c.status = 'pledged' and c.expires_at > pg_catalog.now())
      );

    if new.target_amount < v_committed then
      raise exception using errcode = '23514', message = 'group gift target cannot be below committed contributions';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.guard_registry_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.owner_id <> old.owner_id then
    raise exception using errcode = '23514', message = 'registry id and owner are immutable';
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.add_registry_owner_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.registry_members (registry_id, user_id, role, status, accepted_at)
  values (new.id, new.owner_id, 'owner', 'active', pg_catalog.now());
  return new;
end;
$$;

create trigger on_registry_created
  after insert on public.registries
  for each row execute function public.add_registry_owner_member();

create or replace function public.is_registry_member(p_registry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.registry_members rm
    where rm.registry_id = p_registry_id
      and rm.user_id = (select auth.uid())
      and rm.status = 'active'
  );
$$;

create or replace function public.is_registry_owner(p_registry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.registry_members rm
    where rm.registry_id = p_registry_id
      and rm.user_id = (select auth.uid())
      and rm.role = 'owner'
      and rm.status = 'active'
  );
$$;

create or replace function public.is_published_registry(p_registry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.registries r
    where r.id = p_registry_id and r.is_published
  );
$$;

create or replace function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception
  when invalid_text_representation then return null;
end;
$$;

create or replace function public.issue_guest_token(
  p_registry_id uuid,
  p_reservation_id uuid default null,
  p_contribution_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if pg_catalog.num_nonnulls(p_reservation_id, p_contribution_id) <> 1 then
    raise exception using errcode = '22023', message = 'exactly one guest activity is required';
  end if;

  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.guest_access_tokens (
    registry_id, reservation_id, contribution_id, token_hash
  )
  values (
    p_registry_id,
    p_reservation_id,
    p_contribution_id,
    extensions.digest(v_token, 'sha256')
  );
  return v_token;
end;
$$;

create or replace function public.get_public_registry(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', r.id,
    'couple_names', r.couple_names,
    'wedding_date', r.wedding_date,
    'city', r.city,
    'welcome_message', r.welcome_message,
    'public_slug', r.public_slug,
    'gifts', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', g.id,
          'gift_type', g.gift_type,
          'name', g.name,
          'description', g.description,
          'target_amount', g.target_amount,
          'currency', g.currency,
          'external_url', g.external_url,
          'category', gc.name,
          'images', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object('path', gi.storage_path, 'alt_text', gi.alt_text)
              order by gi.sort_order, gi.created_at
            )
            from public.gift_images gi
            where gi.registry_id = g.registry_id and gi.gift_id = g.id
          ), '[]'::jsonb),
          'verified_amount', case
            when g.gift_type = 'group' then coalesce((
              select pg_catalog.sum(c.amount)
              from public.contributions c
              where c.gift_id = g.id and c.status = 'verified'
            ), 0)
            else 0
          end,
          'committed_amount', case
            when g.gift_type = 'group' then coalesce((
              select pg_catalog.sum(c.amount)
              from public.contributions c
              where c.gift_id = g.id
                and (
                  c.status in ('verified', 'payment_reported')
                  or (c.status = 'pledged' and c.expires_at > pg_catalog.now())
                )
            ), 0)
            else 0
          end,
          'is_reserved', case
            when g.gift_type = 'individual' then exists (
              select 1 from public.reservations rs
              where rs.gift_id = g.id and rs.status = 'reserved'
            )
            else false
          end
        )
        order by g.sort_order, g.created_at
      )
      from public.gifts g
      left join public.gift_categories gc
        on gc.registry_id = g.registry_id and gc.id = g.category_id
      where g.registry_id = r.id and g.is_active
    ), '[]'::jsonb),
    'payment_instructions', (
      select pg_catalog.jsonb_build_object(
        'upi_id', ps.upi_id,
        'bank_account_name', ps.bank_account_name,
        'bank_account_number', ps.bank_account_number,
        'bank_ifsc', ps.bank_ifsc,
        'cash_instructions', ps.cash_instructions,
        'general_instructions', ps.general_instructions
      )
      from public.payment_settings ps
      where ps.registry_id = r.id
    )
  )
  from public.registries r
  where r.public_slug = p_slug and r.is_published;
$$;

create or replace function public.create_guest_reservation(
  p_gift_id uuid,
  p_guest_name text,
  p_email text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gift public.gifts%rowtype;
  v_guest_id uuid;
  v_reservation_id uuid;
  v_token text;
begin
  if pg_catalog.char_length(pg_catalog.btrim(p_guest_name)) not between 1 and 100
     or pg_catalog.num_nonnulls(nullif(pg_catalog.btrim(p_email), ''), nullif(pg_catalog.btrim(p_phone), '')) <> 1 then
    raise exception using errcode = '22023', message = 'valid guest name and exactly one contact method are required';
  end if;
  if nullif(pg_catalog.btrim(p_email), '') is not null
     and (pg_catalog.char_length(pg_catalog.btrim(p_email)) > 254
       or pg_catalog.btrim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception using errcode = '22023', message = 'invalid email address';
  end if;
  if nullif(pg_catalog.btrim(p_phone), '') is not null
     and (pg_catalog.char_length(pg_catalog.btrim(p_phone)) not between 7 and 20
       or pg_catalog.btrim(p_phone) !~ '^\+?[0-9 ()-]+$') then
    raise exception using errcode = '22023', message = 'invalid phone number';
  end if;

  select g.* into v_gift
  from public.gifts g
  join public.registries r on r.id = g.registry_id
  where g.id = p_gift_id and g.gift_type = 'individual'
    and g.is_active and r.is_published
  for update of g;

  if not found then
    raise exception using errcode = 'P0002', message = 'gift is unavailable';
  end if;

  insert into public.guests (registry_id, name, email, phone)
  values (
    v_gift.registry_id,
    pg_catalog.btrim(p_guest_name),
    nullif(pg_catalog.lower(pg_catalog.btrim(p_email)), ''),
    nullif(pg_catalog.btrim(p_phone), '')
  )
  returning id into v_guest_id;

  insert into public.reservations (registry_id, gift_id, guest_id)
  values (v_gift.registry_id, v_gift.id, v_guest_id)
  returning id into v_reservation_id;

  v_token := public.issue_guest_token(v_gift.registry_id, v_reservation_id, null);
  insert into public.audit_logs (
    registry_id, actor_kind, entity_type, entity_id, action, new_status
  )
  values (
    v_gift.registry_id, 'guest', 'reservation', v_reservation_id, 'reservation_created', 'reserved'
  );

  return pg_catalog.jsonb_build_object(
    'reservation_id', v_reservation_id,
    'status', 'reserved',
    'guest_token', v_token
  );
end;
$$;

create or replace function public.create_group_pledge(
  p_gift_id uuid,
  p_amount numeric,
  p_guest_name text,
  p_email text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gift public.gifts%rowtype;
  v_guest_id uuid;
  v_contribution_id uuid;
  v_token text;
  v_committed numeric(12, 2);
  v_expires_at timestamptz;
begin
  if p_amount is null or p_amount <= 0 or pg_catalog.scale(p_amount) > 2 then
    raise exception using errcode = '22023', message = 'amount must be positive with at most two decimal places';
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(p_guest_name)) not between 1 and 100
     or pg_catalog.num_nonnulls(nullif(pg_catalog.btrim(p_email), ''), nullif(pg_catalog.btrim(p_phone), '')) <> 1 then
    raise exception using errcode = '22023', message = 'valid guest name and exactly one contact method are required';
  end if;
  if nullif(pg_catalog.btrim(p_email), '') is not null
     and (pg_catalog.char_length(pg_catalog.btrim(p_email)) > 254
       or pg_catalog.btrim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception using errcode = '22023', message = 'invalid email address';
  end if;
  if nullif(pg_catalog.btrim(p_phone), '') is not null
     and (pg_catalog.char_length(pg_catalog.btrim(p_phone)) not between 7 and 20
       or pg_catalog.btrim(p_phone) !~ '^\+?[0-9 ()-]+$') then
    raise exception using errcode = '22023', message = 'invalid phone number';
  end if;

  select g.* into v_gift
  from public.gifts g
  join public.registries r on r.id = g.registry_id
  where g.id = p_gift_id and g.gift_type = 'group'
    and g.is_active and r.is_published
  for update of g;

  if not found then
    raise exception using errcode = 'P0002', message = 'group gift is unavailable';
  end if;

  select coalesce(sum(c.amount), 0) into v_committed
  from public.contributions c
  where c.gift_id = v_gift.id
    and (
      c.status in ('verified', 'payment_reported')
      or (c.status = 'pledged' and c.expires_at > pg_catalog.now())
    );

  if v_committed + p_amount > v_gift.target_amount then
    raise exception using errcode = 'P0001', message = 'contribution exceeds remaining capacity';
  end if;

  insert into public.guests (registry_id, name, email, phone)
  values (
    v_gift.registry_id,
    pg_catalog.btrim(p_guest_name),
    nullif(pg_catalog.lower(pg_catalog.btrim(p_email)), ''),
    nullif(pg_catalog.btrim(p_phone), '')
  )
  returning id into v_guest_id;

  insert into public.contributions (registry_id, gift_id, guest_id, amount)
  values (v_gift.registry_id, v_gift.id, v_guest_id, p_amount)
  returning id, expires_at into v_contribution_id, v_expires_at;

  v_token := public.issue_guest_token(v_gift.registry_id, null, v_contribution_id);
  insert into public.audit_logs (
    registry_id, actor_kind, entity_type, entity_id, action, new_status
  )
  values (
    v_gift.registry_id, 'guest', 'contribution', v_contribution_id, 'pledge_created', 'pledged'
  );

  return pg_catalog.jsonb_build_object(
    'contribution_id', v_contribution_id,
    'status', 'pledged',
    'expires_at', v_expires_at,
    'guest_token', v_token
  );
end;
$$;

create or replace function public.get_guest_activity(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_token is null or pg_catalog.length(p_token) <> 64 then
    return null;
  end if;

  select pg_catalog.jsonb_build_object(
    'kind', 'reservation',
    'status', rs.status,
    'gift_name', g.name,
    'couple_names', r.couple_names,
    'created_at', rs.created_at
  )
  into v_result
  from public.guest_access_tokens t
  join public.reservations rs on rs.registry_id = t.registry_id and rs.id = t.reservation_id
  join public.gifts g on g.registry_id = rs.registry_id and g.id = rs.gift_id
  join public.registries r on r.id = rs.registry_id
  where t.token_hash = extensions.digest(p_token, 'sha256')
    and t.reservation_id is not null
    and t.revoked_at is null
    and t.expires_at > pg_catalog.now();

  if v_result is not null then
    return v_result;
  end if;

  select pg_catalog.jsonb_build_object(
    'kind', 'contribution',
    'status', case
      when c.status = 'pledged' and c.expires_at <= pg_catalog.now() then 'expired'
      else c.status
    end,
    'amount', c.amount,
    'expires_at', c.expires_at,
    'gift_name', g.name,
    'couple_names', r.couple_names,
    'created_at', c.created_at
  )
  into v_result
  from public.guest_access_tokens t
  join public.contributions c on c.registry_id = t.registry_id and c.id = t.contribution_id
  join public.gifts g on g.registry_id = c.registry_id and g.id = c.gift_id
  join public.registries r on r.id = c.registry_id
  where t.token_hash = extensions.digest(p_token, 'sha256')
    and t.contribution_id is not null
    and t.revoked_at is null
    and t.expires_at > pg_catalog.now();

  return v_result;
end;
$$;

create or replace function public.cancel_guest_reservation(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations%rowtype;
begin
  select rs.* into v_reservation
  from public.guest_access_tokens t
  join public.reservations rs on rs.registry_id = t.registry_id and rs.id = t.reservation_id
  where t.token_hash = extensions.digest(p_token, 'sha256')
    and t.revoked_at is null and t.expires_at > pg_catalog.now()
  for update of rs;

  if not found or v_reservation.status <> 'reserved' then
    return false;
  end if;

  update public.reservations
  set status = 'cancelled', updated_at = pg_catalog.now()
  where id = v_reservation.id;

  insert into public.audit_logs (
    registry_id, actor_kind, entity_type, entity_id, action, old_status, new_status
  )
  values (
    v_reservation.registry_id, 'guest', 'reservation', v_reservation.id,
    'reservation_cancelled_by_guest', 'reserved', 'cancelled'
  );
  return true;
end;
$$;

create or replace function public.report_guest_payment(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contribution public.contributions%rowtype;
  v_gift public.gifts%rowtype;
  v_committed numeric(12, 2);
begin
  select c.* into v_contribution
  from public.guest_access_tokens t
  join public.contributions c on c.registry_id = t.registry_id and c.id = t.contribution_id
  where t.token_hash = extensions.digest(p_token, 'sha256')
    and t.revoked_at is null and t.expires_at > pg_catalog.now()
  for update of c;

  if not found or v_contribution.status not in ('pledged', 'rejected') then
    return false;
  end if;
  if v_contribution.status = 'pledged' and v_contribution.expires_at <= pg_catalog.now() then
    update public.contributions
    set status = 'expired', updated_at = pg_catalog.now()
    where id = v_contribution.id;
    return false;
  end if;

  select g.* into v_gift
  from public.gifts g
  where g.registry_id = v_contribution.registry_id and g.id = v_contribution.gift_id
  for update;

  select coalesce(sum(c.amount), 0) into v_committed
  from public.contributions c
  where c.gift_id = v_gift.id
    and c.id <> v_contribution.id
    and (
      c.status in ('verified', 'payment_reported')
      or (c.status = 'pledged' and c.expires_at > pg_catalog.now())
    );

  if v_committed + v_contribution.amount > v_gift.target_amount then
    raise exception using errcode = 'P0001', message = 'contribution exceeds remaining capacity';
  end if;

  update public.contributions
  set status = 'payment_reported',
      payment_reported_at = pg_catalog.now(),
      expires_at = null,
      updated_at = pg_catalog.now()
  where id = v_contribution.id;

  insert into public.audit_logs (
    registry_id, actor_kind, entity_type, entity_id, action, old_status, new_status
  )
  values (
    v_contribution.registry_id, 'guest', 'contribution', v_contribution.id,
    case when v_contribution.status = 'rejected' then 'payment_rereported' else 'payment_reported' end,
    v_contribution.status, 'payment_reported'
  );
  return true;
end;
$$;

create or replace function public.review_contribution(
  p_contribution_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contribution public.contributions%rowtype;
  v_gift public.gifts%rowtype;
begin
  if p_decision is null or p_decision not in ('verified', 'rejected') then
    raise exception using errcode = '22023', message = 'decision must be verified or rejected';
  end if;

  select c.* into v_contribution
  from public.contributions c
  where c.id = p_contribution_id
    and public.is_registry_member(c.registry_id)
  for update;

  if not found or v_contribution.status <> 'payment_reported' then
    return false;
  end if;

  if p_decision = 'verified' then
    select g.* into v_gift
    from public.gifts g
    where g.id = v_contribution.gift_id
    for update;
  end if;

  update public.contributions
  set status = p_decision,
      reviewed_at = pg_catalog.now(),
      reviewed_by = (select auth.uid()),
      rejection_reason = case when p_decision = 'rejected' then nullif(pg_catalog.btrim(p_rejection_reason), '') else null end,
      updated_at = pg_catalog.now()
  where id = v_contribution.id;

  insert into public.audit_logs (
    registry_id, actor_user_id, actor_kind, entity_type, entity_id,
    action, old_status, new_status, metadata
  )
  values (
    v_contribution.registry_id, (select auth.uid()), 'member', 'contribution', v_contribution.id,
    'contribution_' || p_decision, v_contribution.status, p_decision,
    case when p_decision = 'rejected' and p_rejection_reason is not null
      then pg_catalog.jsonb_build_object('reason', pg_catalog.left(pg_catalog.btrim(p_rejection_reason), 500))
      else '{}'::jsonb
    end
  );
  return true;
end;
$$;

create or replace function public.release_reservation(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations%rowtype;
begin
  select rs.* into v_reservation
  from public.reservations rs
  where rs.id = p_reservation_id
    and public.is_registry_member(rs.registry_id)
  for update;

  if not found or v_reservation.status <> 'reserved' then
    return false;
  end if;

  update public.reservations
  set status = 'released', updated_at = pg_catalog.now()
  where id = v_reservation.id;

  insert into public.audit_logs (
    registry_id, actor_user_id, actor_kind, entity_type, entity_id,
    action, old_status, new_status
  )
  values (
    v_reservation.registry_id, (select auth.uid()), 'member', 'reservation',
    v_reservation.id, 'reservation_released', 'reserved', 'released'
  );
  return true;
end;
$$;

create or replace function public.release_unpaid_pledge(p_contribution_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contribution public.contributions%rowtype;
begin
  select c.* into v_contribution
  from public.contributions c
  where c.id = p_contribution_id
    and public.is_registry_member(c.registry_id)
  for update;

  if not found or v_contribution.status <> 'pledged' then
    return false;
  end if;

  update public.contributions
  set status = case when expires_at <= pg_catalog.now() then 'expired' else 'released' end,
      updated_at = pg_catalog.now()
  where id = v_contribution.id;

  insert into public.audit_logs (
    registry_id, actor_user_id, actor_kind, entity_type, entity_id,
    action, old_status, new_status
  )
  values (
    v_contribution.registry_id, (select auth.uid()), 'member', 'contribution',
    v_contribution.id, 'unpaid_pledge_released', 'pledged',
    case when v_contribution.expires_at <= pg_catalog.now() then 'expired' else 'released' end
  );
  return true;
end;
$$;

create or replace function public.expire_stale_pledges()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired_count integer;
begin
  with expired as (
    update public.contributions
    set status = 'expired', updated_at = pg_catalog.now()
    where status = 'pledged' and expires_at <= pg_catalog.now()
    returning registry_id, id
  )
  insert into public.audit_logs (
    registry_id, actor_kind, entity_type, entity_id,
    action, old_status, new_status
  )
  select registry_id, 'system', 'contribution', id,
    'pledge_expired', 'pledged', 'expired'
  from expired;

  get diagnostics v_expired_count = row_count;
  return v_expired_count;
end;
$$;

create or replace function public.consume_public_rate_limit(
  p_endpoint text,
  p_key_hash text,
  p_window_seconds integer,
  p_max_requests integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_request_count integer;
begin
  if p_endpoint is null
     or p_key_hash is null
     or p_window_seconds is null
     or p_max_requests is null
     or p_endpoint not in (
       'create-reservation', 'create-group-pledge', 'cancel-reservation',
       'report-payment', 'guest-activity'
     )
     or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_window_seconds not between 1 and 3600
     or p_max_requests not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid rate limit parameters';
  end if;

  v_window_start := pg_catalog.to_timestamp(
    pg_catalog.floor(
      pg_catalog.date_part('epoch', pg_catalog.now()) / p_window_seconds
    ) * p_window_seconds
  );

  insert into private.public_api_rate_limits (
    endpoint, key_hash, window_start, request_count
  )
  values (p_endpoint, p_key_hash, v_window_start, 1)
  on conflict (endpoint, key_hash) do update
  set window_start = excluded.window_start,
      request_count = case
        when private.public_api_rate_limits.window_start = excluded.window_start
          then least(private.public_api_rate_limits.request_count + 1, p_max_requests + 1)
        else 1
      end
  returning request_count into v_request_count;

  return v_request_count <= p_max_requests;
end;
$$;

create or replace function public.invite_registry_partner(
  p_registry_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
begin
  if not public.is_registry_owner(p_registry_id) then
    raise exception using errcode = '42501', message = 'only the registry owner can invite a partner';
  end if;
  if p_email is null or pg_catalog.char_length(p_email) > 254
     or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'valid invitation email is required';
  end if;

  insert into public.registry_members (
    registry_id, invited_email, role, status, invited_by, invited_at
  )
  values (
    p_registry_id, pg_catalog.lower(pg_catalog.btrim(p_email)), 'partner', 'invited',
    (select auth.uid()), pg_catalog.now()
  )
  returning id into v_member_id;

  insert into public.audit_logs (
    registry_id, actor_user_id, actor_kind, entity_type, entity_id, action, new_status
  )
  values (
    p_registry_id, (select auth.uid()), 'member', 'member', v_member_id,
    'partner_invited', 'invited'
  );
  return v_member_id;
end;
$$;

create or replace function public.accept_registry_invitation()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_accepted integer;
begin
  select pg_catalog.lower(u.email) into v_email
  from auth.users u
  where u.id = (select auth.uid())
    and u.email_confirmed_at is not null;
  if v_email is null then
    raise exception using errcode = '42501', message = 'a verified authenticated email is required';
  end if;

  with accepted as (
    update public.registry_members
    set user_id = (select auth.uid()), status = 'active', accepted_at = pg_catalog.now()
    where role = 'partner'
      and status = 'invited'
      and pg_catalog.lower(invited_email) = v_email
    returning registry_id, id
  )
  insert into public.audit_logs (
    registry_id, actor_user_id, actor_kind, entity_type, entity_id,
    action, old_status, new_status
  )
  select registry_id, (select auth.uid()), 'member', 'member', id,
    'partner_invitation_accepted', 'invited', 'active'
  from accepted;

  get diagnostics v_accepted = row_count;
  return v_accepted;
end;
$$;

create or replace function public.revoke_registry_partner(
  p_registry_id uuid,
  p_member_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.registry_members%rowtype;
  v_old_status text;
begin
  if not public.is_registry_owner(p_registry_id) then
    raise exception using errcode = '42501', message = 'only the registry owner can revoke a partner';
  end if;

  select rm.status into v_old_status
  from public.registry_members rm
  where rm.id = p_member_id
    and rm.registry_id = p_registry_id
    and rm.role = 'partner'
    and rm.status <> 'revoked'
  for update;
  if not found then
    return false;
  end if;

  update public.registry_members
  set status = 'revoked'
  where id = p_member_id and registry_id = p_registry_id
    and role = 'partner' and status <> 'revoked'
  returning * into v_member;

  if not found then
    return false;
  end if;

  insert into public.audit_logs (
    registry_id, actor_user_id, actor_kind, entity_type, entity_id,
    action, old_status, new_status
  )
  values (
    p_registry_id, (select auth.uid()), 'member', 'member', p_member_id,
    'partner_access_revoked', v_old_status, 'revoked'
  );
  return true;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger registries_set_updated_at
  before update on public.registries
  for each row execute function public.set_updated_at();

create trigger gifts_set_updated_at
  before update on public.gifts
  for each row execute function public.set_updated_at();

create trigger reservations_set_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

create trigger contributions_set_updated_at
  before update on public.contributions
  for each row execute function public.set_updated_at();

create trigger payment_settings_set_updated_at
  before update on public.payment_settings
  for each row execute function public.set_updated_at();

create trigger gifts_guard_update
  before update on public.gifts
  for each row execute function public.guard_gift_update();

create trigger registries_guard_identity
  before update on public.registries
  for each row execute function public.guard_registry_identity();

alter table public.profiles enable row level security;
alter table public.registries enable row level security;
alter table public.registry_members enable row level security;
alter table public.gift_categories enable row level security;
alter table public.gifts enable row level security;
alter table public.gift_images enable row level security;
alter table public.guests enable row level security;
alter table public.reservations enable row level security;
alter table public.contributions enable row level security;
alter table public.payment_settings enable row level security;
alter table public.guest_access_tokens enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

create policy profiles_select_self
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy registries_select_published_or_member
  on public.registries for select to anon, authenticated
  using (is_published or public.is_registry_member(id));
create policy registries_insert_owner
  on public.registries for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_verified_auth_user()
  );
create policy registries_update_member
  on public.registries for update to authenticated
  using (public.is_registry_member(id))
  with check (
    public.is_registry_member(id)
  );
create policy registry_members_select_member_or_self
  on public.registry_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_registry_member(registry_id)
  );

create policy guests_select_member
  on public.guests for select to authenticated
  using (public.is_registry_member(registry_id));

create policy reservations_select_member
  on public.reservations for select to authenticated
  using (public.is_registry_member(registry_id));

create policy contributions_select_member
  on public.contributions for select to authenticated
  using (public.is_registry_member(registry_id));

create policy gift_categories_select_published_or_member
  on public.gift_categories for select to anon, authenticated
  using (
    public.is_published_registry(registry_id)
    or public.is_registry_member(registry_id)
  );
create policy gift_categories_insert_member
  on public.gift_categories for insert to authenticated
  with check (public.is_registry_member(registry_id));
create policy gift_categories_update_member
  on public.gift_categories for update to authenticated
  using (public.is_registry_member(registry_id))
  with check (public.is_registry_member(registry_id));
create policy gift_categories_delete_member
  on public.gift_categories for delete to authenticated
  using (public.is_registry_member(registry_id));

create policy gifts_select_published_or_member
  on public.gifts for select to anon, authenticated
  using (
    (is_active and public.is_published_registry(registry_id))
    or public.is_registry_member(registry_id)
  );
create policy gifts_insert_member
  on public.gifts for insert to authenticated
  with check (public.is_registry_member(registry_id));
create policy gifts_update_member
  on public.gifts for update to authenticated
  using (public.is_registry_member(registry_id))
  with check (public.is_registry_member(registry_id));
create policy gift_images_select_published_or_member
  on public.gift_images for select to anon, authenticated
  using (
    public.is_published_registry(registry_id)
    or public.is_registry_member(registry_id)
  );
create policy gift_images_insert_member
  on public.gift_images for insert to authenticated
  with check (public.is_registry_member(registry_id));
create policy gift_images_update_member
  on public.gift_images for update to authenticated
  using (public.is_registry_member(registry_id))
  with check (public.is_registry_member(registry_id));
create policy gift_images_delete_member
  on public.gift_images for delete to authenticated
  using (public.is_registry_member(registry_id));

create policy payment_settings_select_member
  on public.payment_settings for select to authenticated
  using (public.is_registry_member(registry_id));
create policy payment_settings_insert_member
  on public.payment_settings for insert to authenticated
  with check (public.is_registry_member(registry_id));
create policy payment_settings_update_member
  on public.payment_settings for update to authenticated
  using (public.is_registry_member(registry_id))
  with check (public.is_registry_member(registry_id));
create policy payment_settings_delete_member
  on public.payment_settings for delete to authenticated
  using (public.is_registry_member(registry_id));

create policy audit_logs_select_member
  on public.audit_logs for select to authenticated
  using (public.is_registry_member(registry_id));

create policy notifications_select_recipient
  on public.notifications for select to authenticated
  using (
    recipient_user_id = (select auth.uid())
    and public.is_registry_member(registry_id)
  );
create policy notifications_update_recipient
  on public.notifications for update to authenticated
  using (
    recipient_user_id = (select auth.uid())
    and public.is_registry_member(registry_id)
  )
  with check (
    recipient_user_id = (select auth.uid())
    and public.is_registry_member(registry_id)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gift-images',
  'gift-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy gift_images_public_read
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'gift-images');
create policy gift_images_member_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'gift-images'
    and public.is_registry_member(public.try_uuid((storage.foldername(name))[1]))
  );
create policy gift_images_member_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'gift-images'
    and public.is_registry_member(public.try_uuid((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'gift-images'
    and public.is_registry_member(public.try_uuid((storage.foldername(name))[1]))
  );
create policy gift_images_member_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'gift-images'
    and public.is_registry_member(public.try_uuid((storage.foldername(name))[1]))
  );

revoke all on table
  public.profiles,
  public.registries,
  public.registry_members,
  public.gift_categories,
  public.gifts,
  public.gift_images,
  public.guests,
  public.reservations,
  public.contributions,
  public.payment_settings,
  public.guest_access_tokens,
  public.audit_logs,
  public.notifications
from anon, authenticated;

revoke all on sequence public.audit_logs_id_seq from anon, authenticated;

revoke all on function public.issue_guest_token(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.guard_gift_update() from public, anon, authenticated;
revoke all on function public.guard_registry_identity() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.add_registry_owner_member() from public, anon, authenticated;
revoke all on function public.is_registry_member(uuid) from public, anon, authenticated;
revoke all on function public.is_verified_auth_user() from public, anon, authenticated;
revoke all on function public.is_registry_owner(uuid) from public, anon, authenticated;
revoke all on function public.is_published_registry(uuid) from public, anon, authenticated;
revoke all on function public.try_uuid(text) from public, anon, authenticated;
revoke all on function public.get_public_registry(text) from public, anon, authenticated;
revoke all on function public.create_guest_reservation(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.create_group_pledge(uuid, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.get_guest_activity(text) from public, anon, authenticated;
revoke all on function public.cancel_guest_reservation(text) from public, anon, authenticated;
revoke all on function public.report_guest_payment(text) from public, anon, authenticated;
revoke all on function public.consume_public_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.review_contribution(uuid, text, text) from public, anon, authenticated;
revoke all on function public.release_reservation(uuid) from public, anon, authenticated;
revoke all on function public.release_unpaid_pledge(uuid) from public, anon, authenticated;
revoke all on function public.expire_stale_pledges() from public, anon, authenticated;
revoke all on function public.invite_registry_partner(uuid, text) from public, anon, authenticated;
revoke all on function public.accept_registry_invitation() from public, anon, authenticated;
revoke all on function public.revoke_registry_partner(uuid, uuid) from public, anon, authenticated;

grant execute on function public.is_registry_member(uuid) to anon, authenticated, service_role;
grant execute on function public.is_verified_auth_user() to authenticated, service_role;
grant execute on function public.is_published_registry(uuid) to anon, authenticated, service_role;
grant execute on function public.try_uuid(text) to authenticated, service_role;
grant execute on function public.get_public_registry(text) to anon, authenticated;
grant execute on function public.create_guest_reservation(uuid, text, text, text) to service_role;
grant execute on function public.create_group_pledge(uuid, numeric, text, text, text) to service_role;
grant execute on function public.get_guest_activity(text) to service_role;
grant execute on function public.cancel_guest_reservation(text) to service_role;
grant execute on function public.report_guest_payment(text) to service_role;
grant execute on function public.consume_public_rate_limit(text, text, integer, integer)
  to service_role;
grant execute on function public.review_contribution(uuid, text, text) to authenticated;
grant execute on function public.release_reservation(uuid) to authenticated;
grant execute on function public.release_unpaid_pledge(uuid) to authenticated;
grant execute on function public.invite_registry_partner(uuid, text) to authenticated;
grant execute on function public.accept_registry_invitation() to authenticated;
grant execute on function public.revoke_registry_partner(uuid, uuid) to authenticated;
grant execute on function public.expire_stale_pledges() to service_role;

grant select, insert, update, delete on public.gift_categories, public.gifts, public.gift_images
  to authenticated;
grant select on public.registries, public.registry_members, public.profiles,
  public.guests, public.reservations, public.contributions,
  public.payment_settings, public.audit_logs, public.notifications to authenticated;
grant insert, update on public.registries, public.payment_settings to authenticated;
grant update on public.profiles to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select (
  id, couple_names, wedding_date, city, welcome_message, public_slug,
  is_published, created_at, updated_at
) on public.registries to anon;
grant select on public.gifts, public.gift_categories, public.gift_images to anon;
grant insert, update on public.gift_categories, public.gifts, public.gift_images
  to authenticated;
grant delete on public.gift_categories, public.gift_images to authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname in ('expire-stale-pledges', 'cleanup-public-api-rate-limits');

select cron.schedule(
  'expire-stale-pledges',
  '*/15 * * * *',
  'select public.expire_stale_pledges();'
);

select cron.schedule(
  'cleanup-public-api-rate-limits',
  '15 3 * * *',
  $job$delete from private.public_api_rate_limits
       where window_start < pg_catalog.now() - interval '1 day';$job$
);
