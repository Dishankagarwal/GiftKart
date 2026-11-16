create or replace function public.save_registry_gift(
  p_registry_id uuid,
  p_gift_id uuid,
  p_name text,
  p_description text,
  p_target_amount numeric,
  p_external_url text,
  p_category_name text,
  p_gift_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_id uuid;
  v_existing_registry_id uuid;
begin
  if p_name is null or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 160
     or p_description is null or pg_catalog.char_length(p_description) > 2000
     or p_target_amount is null or p_target_amount <= 0
     or pg_catalog.scale(p_target_amount) > 2
     or p_target_amount > 9999999999.99
     or p_category_name is null
     or pg_catalog.char_length(pg_catalog.btrim(p_category_name)) not between 1 and 80
     or (p_external_url is not null and (
       pg_catalog.char_length(p_external_url) > 2048
       or p_external_url !~* '^https?://'
     )) then
    raise exception using errcode = '22023', message = 'invalid gift details';
  end if;
  if p_gift_id is null or p_gift_ids is null then
    raise exception using errcode = '22023', message = 'a gift id and complete gift order are required';
  end if;

  perform 1
  from public.registries r
  where r.id = p_registry_id
  for update;
  if not found or not public.is_registry_member(p_registry_id) then
    raise exception using errcode = '42501', message = 'registry access is required';
  end if;

  select gc.id into v_category_id
  from public.gift_categories gc
  where gc.registry_id = p_registry_id
    and pg_catalog.lower(gc.name) = pg_catalog.lower(pg_catalog.btrim(p_category_name))
  limit 1;
  if v_category_id is null then
    insert into public.gift_categories (registry_id, name, sort_order)
    select p_registry_id, pg_catalog.btrim(p_category_name), coalesce(max(gc.sort_order), -1) + 1
    from public.gift_categories gc
    where gc.registry_id = p_registry_id
    returning id into v_category_id;
  end if;

  select g.registry_id into v_existing_registry_id
  from public.gifts g
  where g.id = p_gift_id
  for update;
  if found then
    if v_existing_registry_id <> p_registry_id or not exists (
      select 1 from public.gifts g
      where g.id = p_gift_id and g.registry_id = p_registry_id and g.is_active
    ) then
      raise exception using errcode = 'P0002', message = 'gift is unavailable';
    end if;
    update public.gifts
    set category_id = v_category_id,
        name = pg_catalog.btrim(p_name),
        description = p_description,
        target_amount = p_target_amount,
        external_url = nullif(pg_catalog.btrim(p_external_url), '')
    where id = p_gift_id and registry_id = p_registry_id;
  else
    insert into public.gifts (
      id, registry_id, category_id, name, description, target_amount, external_url
    )
    values (
      p_gift_id, p_registry_id, v_category_id, pg_catalog.btrim(p_name),
      p_description, p_target_amount, nullif(pg_catalog.btrim(p_external_url), '')
    );
  end if;

  if pg_catalog.cardinality(p_gift_ids) <> (
    select count(*)::integer
    from public.gifts g
    where g.registry_id = p_registry_id and g.is_active
  ) or pg_catalog.cardinality(p_gift_ids) <> (
    select count(distinct requested.gift_id)::integer
    from pg_catalog.unnest(p_gift_ids) as requested(gift_id)
  ) or exists (
    select 1
    from public.gifts g
    where g.registry_id = p_registry_id
      and g.is_active
      and not (g.id = any(p_gift_ids))
  ) or exists (
    select 1
    from pg_catalog.unnest(p_gift_ids) as requested(gift_id)
    where not exists (
      select 1 from public.gifts g
      where g.registry_id = p_registry_id
        and g.is_active
        and g.id = requested.gift_id
    )
  ) then
    raise exception using errcode = '22023', message = 'gift order must include each active registry gift exactly once';
  end if;

  update public.gifts g
  set sort_order = (requested.priority - 1)::integer
  from pg_catalog.unnest(p_gift_ids) with ordinality as requested(gift_id, priority)
  where g.id = requested.gift_id
    and g.registry_id = p_registry_id;

  return p_gift_id;
end;
$$;

create or replace function public.reorder_registry_gifts(
  p_registry_id uuid,
  p_gift_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.registries r
  where r.id = p_registry_id
  for update;
  if not found or not public.is_registry_member(p_registry_id) then
    raise exception using errcode = '42501', message = 'registry access is required';
  end if;

  if p_gift_ids is null
     or pg_catalog.cardinality(p_gift_ids) <> (
       select count(*)::integer
       from public.gifts g
       where g.registry_id = p_registry_id and g.is_active
     )
     or pg_catalog.cardinality(p_gift_ids) <> (
       select count(distinct requested.gift_id)::integer
       from pg_catalog.unnest(p_gift_ids) as requested(gift_id)
     )
     or exists (
       select 1
       from public.gifts g
       where g.registry_id = p_registry_id
         and g.is_active
         and not (g.id = any(p_gift_ids))
     )
     or exists (
       select 1
       from pg_catalog.unnest(p_gift_ids) as requested(gift_id)
       where not exists (
         select 1 from public.gifts g
         where g.registry_id = p_registry_id
           and g.is_active
           and g.id = requested.gift_id
       )
     ) then
    raise exception using errcode = '22023', message = 'gift order must include each active registry gift exactly once';
  end if;

  update public.gifts g
  set sort_order = (requested.priority - 1)::integer
  from pg_catalog.unnest(p_gift_ids) with ordinality as requested(gift_id, priority)
  where g.id = requested.gift_id
    and g.registry_id = p_registry_id;
end;
$$;

revoke all on function public.save_registry_gift(uuid, uuid, text, text, numeric, text, text, uuid[])
  from public, anon, authenticated;
revoke all on function public.reorder_registry_gifts(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.save_registry_gift(uuid, uuid, text, text, numeric, text, text, uuid[])
  to authenticated;
grant execute on function public.reorder_registry_gifts(uuid, uuid[])
  to authenticated;
