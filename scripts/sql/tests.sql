\set ON_ERROR_STOP 1
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@a.es'), ('22222222-2222-2222-2222-222222222222','b@b.es');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'perfiles creados';
  assert (select count(*) from public.businesses where name='KYZ') = 2, 'KYZ sembrado';
  assert (select count(*) from public.categories where user_id='11111111-1111-1111-1111-111111111111' and parent_id is null) = 36, 'categorías raíz';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

-- Cuenta corriente con 1.000,00 € y un préstamo de 5.000 €
insert into public.accounts (id, name, type, opening_balance_cents, opening_date)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Banco', 'checking', 100000, '2026-01-01'),
       ('aaaaaaaa-0000-0000-0000-000000000002', 'Préstamo coche', 'loan', -500000, '2026-01-01');

insert into public.transactions (kind, date, amount_cents, account_id, category_id)
select 'expense', '2026-02-01', 4550, 'aaaaaaaa-0000-0000-0000-000000000001', id from public.categories where name='Transporte' and scope='personal' and parent_id is null;
insert into public.transactions (kind, date, amount_cents, account_id, category_id)
select 'income', '2026-02-02', 200000, 'aaaaaaaa-0000-0000-0000-000000000001', id from public.categories where name='Nómina';
-- Pago del préstamo: transferencia (no es gasto, no duplica)
insert into public.transactions (kind, date, amount_cents, account_id, to_account_id)
values ('transfer', '2026-02-03', 30000, 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002');
-- Pendiente: no afecta al saldo
insert into public.transactions (kind, status, date, amount_cents, account_id)
values ('expense', 'pending', '2026-02-04', 99900, 'aaaaaaaa-0000-0000-0000-000000000001');
-- Anterior a la fecha de apertura: histórico, no afecta
insert into public.transactions (kind, date, amount_cents, account_id)
values ('expense', '2025-12-20', 12345, 'aaaaaaaa-0000-0000-0000-000000000001');

do $$ begin
  assert (select balance_cents from public.account_balances where account_id='aaaaaaaa-0000-0000-0000-000000000001') = 100000 - 4550 + 200000 - 30000, 'saldo banco';
  assert (select balance_cents from public.account_balances where account_id='aaaaaaaa-0000-0000-0000-000000000002') = -470000, 'saldo préstamo';
  assert (select sum(balance_cents) from public.account_balances) = 265450 - 470000, 'patrimonio sin doble conteo';
  assert (select count(*) from public.audit_log) >= 5, 'auditoría';
end $$;

-- Validaciones
do $$ begin
  begin insert into public.transactions (kind, date, amount_cents, account_id) values ('expense', '2026-02-01', 0, 'aaaaaaaa-0000-0000-0000-000000000001');
        raise exception 'debía fallar importe 0'; exception when check_violation then null; end;
  begin insert into public.transactions (kind, date, amount_cents, account_id) values ('expense', '2026-02-01', -5, 'aaaaaaaa-0000-0000-0000-000000000001');
        raise exception 'debía fallar importe negativo'; exception when check_violation then null; end;
  begin insert into public.transactions (kind, date, amount_cents, account_id, to_account_id) values ('transfer', '2026-02-01', 5, 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
        raise exception 'debía fallar transferencia a sí misma'; exception when check_violation then null; end;
  begin insert into public.transactions (kind, date, amount_cents, account_id, category_id) select 'income', '2026-02-01', 5, 'aaaaaaaa-0000-0000-0000-000000000001', id from public.categories where name='Ocio';
        raise exception 'debía fallar categoría de gasto en ingreso'; exception when raise_exception then null; end;
end $$;

-- Usuario B no ve nada de A y no puede referenciar sus cuentas
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select count(*) from public.transactions) = 0, 'RLS movimientos';
  assert (select count(*) from public.accounts where name='Banco') = 0, 'RLS cuentas';
  assert (select count(*) from public.account_balances where account_id='aaaaaaaa-0000-0000-0000-000000000001') = 0, 'RLS saldos';
  assert (select count(*) from public.audit_log) = 0 or not exists (select 1 from public.audit_log where user_id <> '22222222-2222-2222-2222-222222222222'), 'RLS auditoría';
  begin
    insert into public.transactions (kind, date, amount_cents, account_id) values ('expense', '2026-02-01', 100, 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'debía fallar referencia ajena';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.transactions (user_id, kind, date, amount_cents, account_id) values ('11111111-1111-1111-1111-111111111111', 'expense', '2026-02-01', 100, 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'debía fallar suplantación';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.audit_log (user_id, table_name, record_id, action) values ('22222222-2222-2222-2222-222222222222', 'x', gen_random_uuid(), 'INSERT');
    raise exception 'debía fallar escritura en auditoría';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- settle_planned: crea movimiento, cierra y genera la siguiente (31 ene → 28 feb)
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.planned_items (id, name, amount_cents, expected_date, due_date, recurrence)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'Software', 2400, '2026-01-31', '2026-02-05', 'monthly');
select public.settle_planned('bbbbbbbb-0000-0000-0000-000000000001', 2500, '2026-01-30', 'aaaaaaaa-0000-0000-0000-000000000001', 'card');
do $$ begin
  assert (select status from public.planned_items where id='bbbbbbbb-0000-0000-0000-000000000001') = 'paid', 'cerrada';
  assert (select count(*) from public.transactions where planned_item_id='bbbbbbbb-0000-0000-0000-000000000001' and amount_cents=2500) = 1, 'movimiento creado';
  assert (select expected_date from public.planned_items where name='Software' and status='planned') = '2026-02-28', 'siguiente ocurrencia';
  assert (select due_date from public.planned_items where name='Software' and status='planned') = '2026-03-05', 'fecha límite desplazada';
  begin
    perform public.settle_planned('bbbbbbbb-0000-0000-0000-000000000001', 2500, '2026-01-30', 'aaaaaaaa-0000-0000-0000-000000000001', 'card');
    raise exception 'debía fallar doble liquidación';
  exception when raise_exception then
    if sqlerrm = 'debía fallar doble liquidación' then raise; end if;
  end;
end $$;
-- otro usuario no puede liquidar previsiones ajenas
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  begin
    perform public.settle_planned((select id from public.planned_items limit 1), 100, '2026-01-30', 'aaaaaaaa-0000-0000-0000-000000000001', null);
    raise exception 'debía fallar';
  exception when no_data_found or sqlstate 'P0002' then null; end;
end $$;
reset role;
