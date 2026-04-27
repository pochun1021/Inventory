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

insert into condition_status_code (condition_status, description, created_at, updated_at)
values
  ('0', '良好', '', ''),
  ('1', '損壞', '', ''),
  ('2', '報廢', '', '')
on conflict (condition_status) do nothing;

insert into asset_category_name (name_code, asset_category_name, name_code2, description, created_at, updated_at)
values
  ('01', '筆記型電腦', '01', '商務系列', '', ''),
  ('01', '筆記型電腦', '99', '', '', ''),
  ('02', '桌上型電腦', '01', '一般用途', '', ''),
  ('02', '桌上型電腦', '99', '', '', '')
on conflict (name_code, name_code2) do nothing;

-- Normalize legacy values before adding FK.
update inventory_items
set condition_status = null
where condition_status is not null
  and btrim(condition_status) = '';

update inventory_items
set condition_status = btrim(condition_status)
where condition_status is not null
  and condition_status <> btrim(condition_status);

update inventory_items
set condition_status = '0'
where condition_status is not null
  and condition_status not in ('0', '1', '2');

-- Normalize category pair values before adding FK.
update inventory_items
set name_code = btrim(name_code)
where name_code is not null
  and name_code <> btrim(name_code);

update inventory_items
set name_code2 = btrim(name_code2)
where name_code2 is not null
  and name_code2 <> btrim(name_code2);

update inventory_items
set name_code = lpad(name_code, 2, '0')
where name_code is not null
  and name_code ~ '^\d{1,2}$';

update inventory_items
set name_code2 = lpad(name_code2, 2, '0')
where name_code2 is not null
  and name_code2 ~ '^\d{1,2}$';

update inventory_items
set name_code = null,
    name_code2 = null
where coalesce(name_code, '') = ''
   or coalesce(name_code2, '') = '';

insert into asset_category_name (name_code, asset_category_name, name_code2, description, created_at, updated_at)
select distinct
  name_code,
  null,
  name_code2,
  'backfilled from inventory_items during FK migration',
  '',
  ''
from inventory_items
where name_code is not null
  and name_code2 is not null
on conflict (name_code, name_code2) do nothing;

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
