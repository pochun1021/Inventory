create table if not exists condition_status_code (
  condition_status text primary key,
  description text,
  created_at text,
  updated_at text
);

create table if not exists asset_category_name (
  name_code text not null,
  asset_category_name text,
  name_code2 text not null,
  description text,
  created_at text,
  updated_at text,
  primary key (name_code, name_code2)
);

create index if not exists idx_inventory_items_condition_status on inventory_items(condition_status);
create index if not exists idx_inventory_items_category_pair on inventory_items(name_code, name_code2);

-- Add inventory_items.condition_status FK when it does not exist.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_inventory_items_condition_status_code'
      and conrelid = 'inventory_items'::regclass
  ) then
    alter table inventory_items
      add constraint fk_inventory_items_condition_status_code
      foreign key (condition_status)
      references condition_status_code(condition_status);
  end if;
end;
$$;

-- Add inventory_items(name_code,name_code2) composite FK when it does not exist.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_inventory_items_asset_category_pair'
      and conrelid = 'inventory_items'::regclass
  ) then
    alter table inventory_items
      add constraint fk_inventory_items_asset_category_pair
      foreign key (name_code, name_code2)
      references asset_category_name(name_code, name_code2);
  end if;
end;
$$;
