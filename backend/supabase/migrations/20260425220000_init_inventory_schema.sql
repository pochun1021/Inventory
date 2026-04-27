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

create or replace function admin_set_sequences()
returns void
language plpgsql
as $$
begin
  perform setval(pg_get_serial_sequence('sync_job_log', 'id'), coalesce((select max(id) from sync_job_log), 1), true);
end;
$$;

create or replace function admin_truncate_target_tables(selected_tables text[] default null)
returns void
language plpgsql
as $$
declare
  allowed_tables text[] := array[
    'asset_status_codes',
    'condition_status_code',
    'asset_category_name',
    'inventory_items',
    'issue_requests',
    'issue_items',
    'borrow_requests',
    'borrow_allocations',
    'borrow_request_lines',
    'donation_requests',
    'donation_items',
    'movement_ledger',
    'operation_logs',
    'order_sn'
  ];
  normalized_tables text[];
  invalid_tables text[];
  table_name text;
begin
  if selected_tables is null or coalesce(array_length(selected_tables, 1), 0) = 0 then
    normalized_tables := allowed_tables;
  else
    select array_agg(distinct value)
    into normalized_tables
    from unnest(selected_tables) as value;
  end if;

  select array_agg(value)
  into invalid_tables
  from unnest(normalized_tables) as value
  where value <> all(allowed_tables);

  if invalid_tables is not null then
    raise exception 'Unknown target tables: %', array_to_string(invalid_tables, ', ');
  end if;

  foreach table_name in array normalized_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('truncate table public.%I restart identity cascade', table_name);
    end if;
  end loop;
end;
$$;
