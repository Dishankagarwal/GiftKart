drop policy registries_select_published_or_member on public.registries;

create policy registries_select_published_or_member
  on public.registries for select to anon, authenticated
  using (
    is_published
    or owner_id = (select auth.uid())
    or public.is_registry_member(id)
  );
