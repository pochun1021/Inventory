create table if not exists inventory_items (
  id bigint primary key,
  asset_type text,
  asset_status text,
  condition_status text,
  key text,
  n_property_sn text,
  property_sn text,
  n_item_sn text,
  item_sn text,
  name text,
  name_code text,
  name_code2 text,
  model text,
  specification text,
  unit text,
  count integer,
  purchase_date text,
  due_date text,
  return_date text,
  location text,
  memo text,
  memo2 text,
  keeper text,
  borrower text,
  start_date text,
  create_at text,
  create_by text,
  created_at text,
  created_by text,
  update_at text,
  update_by text,
  updated_at text,
  updated_by text,
  deleted_at text,
  deleted_by text
);

create table if not exists asset_status_codes (
  code text primary key,
  description text,
  created_at text,
  updated_at text
);

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

create table if not exists issue_requests (
  id bigint primary key,
  requester text,
  department text,
  purpose text,
  request_date text,
  memo text,
  created_at text
);

create table if not exists issue_items (
  id bigint primary key,
  request_id bigint references issue_requests(id) on delete cascade,
  item_id bigint references inventory_items(id),
  quantity integer,
  note text
);

create table if not exists borrow_requests (
  id bigint primary key,
  borrower text,
  department text,
  purpose text,
  borrow_date text,
  due_date text,
  return_date text,
  status text,
  memo text,
  created_at text
);

create table if not exists borrow_request_lines (
  id bigint primary key,
  request_id bigint references borrow_requests(id) on delete cascade,
  item_name text,
  item_model text,
  requested_qty integer,
  note text
);

create table if not exists borrow_allocations (
  id bigint primary key,
  request_id bigint references borrow_requests(id) on delete cascade,
  line_id bigint references borrow_request_lines(id) on delete cascade,
  item_id bigint references inventory_items(id),
  note text
);

create table if not exists donation_requests (
  id bigint primary key,
  donor text,
  department text,
  recipient text,
  purpose text,
  donation_date text,
  memo text,
  created_at text
);

create table if not exists donation_items (
  id bigint primary key,
  request_id bigint references donation_requests(id) on delete cascade,
  item_id bigint references inventory_items(id),
  quantity integer,
  note text
);

create table if not exists movement_ledger (
  id bigint primary key,
  item_id bigint references inventory_items(id),
  from_status text,
  to_status text,
  action text,
  entity text,
  entity_id bigint,
  operator text,
  created_at text
);

create table if not exists operation_logs (
  id bigint primary key,
  action text,
  entity text,
  entity_id bigint,
  status text,
  detail jsonb,
  created_at text
);

create table if not exists order_sn (
  name text primary key,
  current_value integer
);

create table if not exists sync_job_log (
  id bigserial primary key,
  job_type text not null,
  status text not null,
  started_at text not null,
  finished_at text,
  error_message text,
  total_rows integer default 0,
  sheets_written integer default 0
);

create index if not exists idx_issue_items_request_id on issue_items(request_id);
create index if not exists idx_issue_items_item_id on issue_items(item_id);
create index if not exists idx_inventory_items_condition_status on inventory_items(condition_status);
create index if not exists idx_inventory_items_category_pair on inventory_items(name_code, name_code2);
create index if not exists idx_borrow_lines_request_id on borrow_request_lines(request_id);
create index if not exists idx_borrow_allocations_request_id on borrow_allocations(request_id);
create index if not exists idx_borrow_allocations_line_id on borrow_allocations(line_id);
create index if not exists idx_borrow_allocations_item_id on borrow_allocations(item_id);
create index if not exists idx_donation_items_request_id on donation_items(request_id);
create index if not exists idx_donation_items_item_id on donation_items(item_id);
create index if not exists idx_movement_created_at on movement_ledger(created_at);
create index if not exists idx_movement_entity_entity_id on movement_ledger(entity, entity_id);
create index if not exists idx_movement_item_id on movement_ledger(item_id);
create index if not exists idx_operation_created_at on operation_logs(created_at);
create index if not exists idx_operation_entity_entity_id on operation_logs(entity, entity_id);
create index if not exists idx_sync_job_log_id_desc on sync_job_log(id desc);

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

create or replace function admin_set_sequences()
returns void
language plpgsql
as $$
begin
  perform setval(pg_get_serial_sequence('sync_job_log', 'id'), coalesce((select max(id) from sync_job_log), 1), true);
end;
$$;
