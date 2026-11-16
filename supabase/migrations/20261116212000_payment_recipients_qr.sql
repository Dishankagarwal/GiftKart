create table public.registry_payment_recipients (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.registries (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  upi_id text not null check (char_length(btrim(upi_id)) between 1 and 120),
  qr_image_path text unique,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (qr_image_path is null or qr_image_path like registry_id::text || '/%'),
  unique (registry_id, id)
);

insert into public.registry_payment_recipients (
  registry_id, display_name, upi_id, sort_order
)
select registry_id, 'Couple', btrim(upi_id), 0
from public.payment_settings
where nullif(btrim(upi_id), '') is not null;

update public.payment_settings
set upi_id = null
where upi_id is not null;

alter table public.registry_payment_recipients enable row level security;

create trigger registry_payment_recipients_set_updated_at
  before update on public.registry_payment_recipients
  for each row execute function public.set_updated_at();

create policy registry_payment_recipients_select_published_or_member
  on public.registry_payment_recipients for select to anon, authenticated
  using (
    public.is_published_registry(registry_id)
    or public.is_registry_member(registry_id)
  );
create policy registry_payment_recipients_insert_member
  on public.registry_payment_recipients for insert to authenticated
  with check (public.is_registry_member(registry_id));
create policy registry_payment_recipients_update_member
  on public.registry_payment_recipients for update to authenticated
  using (public.is_registry_member(registry_id))
  with check (public.is_registry_member(registry_id));
create policy registry_payment_recipients_delete_member
  on public.registry_payment_recipients for delete to authenticated
  using (public.is_registry_member(registry_id));

revoke all on table public.registry_payment_recipients from anon, authenticated;
grant select on public.registry_payment_recipients to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-qrs',
  'payment-qrs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy payment_qrs_select_published_or_member
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'payment-qrs'
    and (
      public.is_published_registry(public.try_uuid((storage.foldername(name))[1]))
      or public.is_registry_member(public.try_uuid((storage.foldername(name))[1]))
    )
  );
create policy payment_qrs_insert_member
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-qrs'
    and public.is_registry_member(public.try_uuid((storage.foldername(name))[1]))
  );
create policy payment_qrs_update_member
  on storage.objects for update to authenticated
  using (
    bucket_id = 'payment-qrs'
    and public.is_registry_member(public.try_uuid((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'payment-qrs'
    and public.is_registry_member(public.try_uuid((storage.foldername(name))[1]))
  );
create policy payment_qrs_delete_member
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-qrs'
    and public.is_registry_member(public.try_uuid((storage.foldername(name))[1]))
  );

create or replace function public.save_registry_payment_settings(
  p_registry_id uuid,
  p_settings jsonb,
  p_recipients jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_registry_member(p_registry_id) then
    raise exception using errcode = '42501', message = 'registry membership is required';
  end if;
  if pg_catalog.jsonb_typeof(p_settings) is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_recipients) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'payment settings and recipients are required';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_recipients) as item
    where pg_catalog.jsonb_typeof(item) <> 'object'
       or item->>'id' is null
       or item->>'display_name' is null
       or item->>'upi_id' is null
       or pg_catalog.char_length(pg_catalog.btrim(item->>'display_name')) not between 1 and 100
       or pg_catalog.char_length(pg_catalog.btrim(item->>'upi_id')) not between 1 and 120
       or (
         item->>'qr_image_path' is not null
         and (
           item->>'qr_image_path' not like p_registry_id::text || '/%'
           or not exists (
             select 1
             from storage.objects o
             where o.bucket_id = 'payment-qrs'
               and o.name = item->>'qr_image_path'
           )
         )
       )
  ) then
    raise exception using errcode = '22023', message = 'a payment recipient or QR image is invalid';
  end if;
  if (
    select pg_catalog.count(*) <> pg_catalog.count(distinct item->>'id')
    from pg_catalog.jsonb_array_elements(p_recipients) as item
  ) then
    raise exception using errcode = '22023', message = 'payment recipient IDs must be unique';
  end if;

  insert into public.payment_settings (
    registry_id, upi_id, bank_account_name, bank_account_number,
    bank_ifsc, cash_instructions, general_instructions
  )
  values (
    p_registry_id, null,
    nullif(pg_catalog.btrim(p_settings->>'bank_account_name'), ''),
    nullif(pg_catalog.btrim(p_settings->>'bank_account_number'), ''),
    nullif(pg_catalog.upper(pg_catalog.btrim(p_settings->>'bank_ifsc')), ''),
    nullif(pg_catalog.btrim(p_settings->>'cash_instructions'), ''),
    coalesce(p_settings->>'general_instructions', '')
  )
  on conflict (registry_id) do update set
    upi_id = null,
    bank_account_name = excluded.bank_account_name,
    bank_account_number = excluded.bank_account_number,
    bank_ifsc = excluded.bank_ifsc,
    cash_instructions = excluded.cash_instructions,
    general_instructions = excluded.general_instructions;

  delete from public.registry_payment_recipients
  where registry_id = p_registry_id;

  insert into public.registry_payment_recipients (
    id, registry_id, display_name, upi_id, qr_image_path, sort_order
  )
  select
    (item->>'id')::uuid,
    p_registry_id,
    pg_catalog.btrim(item->>'display_name'),
    pg_catalog.btrim(item->>'upi_id'),
    item->>'qr_image_path',
    (entry.ordinality - 1)::integer
  from pg_catalog.jsonb_array_elements(p_recipients) with ordinality as entry(item, ordinality);
end;
$$;

revoke all on function public.save_registry_payment_settings(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_registry_payment_settings(uuid, jsonb, jsonb)
  to authenticated;

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
          'verified_amount', coalesce((
              select pg_catalog.sum(c.amount)
              from public.contributions c
              where c.gift_id = g.id and c.status = 'verified'
            ), 0),
          'committed_amount', coalesce((
              select pg_catalog.sum(c.amount)
              from public.contributions c
              where c.gift_id = g.id
                and (
                  c.status in ('verified', 'payment_reported')
                  or (c.status = 'pledged' and c.expires_at > pg_catalog.now())
                )
            ), 0),
          'is_reserved', exists (
              select 1 from public.reservations rs
              where rs.gift_id = g.id and rs.status = 'reserved'
            )
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
        'bank_account_name', ps.bank_account_name,
        'bank_account_number', ps.bank_account_number,
        'bank_ifsc', ps.bank_ifsc,
        'cash_instructions', ps.cash_instructions,
        'general_instructions', ps.general_instructions,
        'payment_recipients', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', pr.id,
              'display_name', pr.display_name,
              'upi_id', pr.upi_id,
              'qr_image_path', pr.qr_image_path
            )
            order by pr.sort_order, pr.created_at
          )
          from public.registry_payment_recipients pr
          where pr.registry_id = r.id
        ), '[]'::jsonb)
      )
      from public.payment_settings ps
      where ps.registry_id = r.id
    )
  )
  from public.registries r
  where r.public_slug = p_slug and r.is_published;
$$;

grant execute on function public.get_public_registry(text) to anon, authenticated;
