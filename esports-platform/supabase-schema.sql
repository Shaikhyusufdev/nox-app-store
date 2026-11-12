-- ============ ESPORTS PLATFORM : PHASE 1 SCHEMA ============
-- Supabase SQL Editor me poora run karo. Server service_role key use karta hai.
create extension if not exists pgcrypto;
create sequence if not exists user_code_seq start 100001;

create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  user_code text unique not null default ('U' || nextval('user_code_seq')),
  email text unique not null,
  username text unique not null,
  password_hash text not null,
  avatar_url text,
  referral_code text unique not null default upper(substr(md5(gen_random_uuid()::text),1,8)),
  referred_by uuid references users(id),
  xp int not null default 0,
  level int not null default 1,
  login_streak int not null default 0,
  last_login_date date,
  total_matches int not null default 0,
  total_wins int not null default 0,
  total_earnings numeric(12,2) not null default 0,
  status text not null default 'active' check (status in ('active','blocked')),
  token_version int not null default 0,
  created_at timestamptz not null default now()
);

create table admins (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  password_hash text not null,
  role text not null default 'admin' check (role in ('super_admin','admin','finance','support')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Wallet: 3 balances. Bonus kabhi withdraw nahi hota (withdraw sirf winnings se).
create table wallets (
  user_id uuid primary key references users(id) on delete cascade,
  deposit_balance numeric(12,2) not null default 0 check (deposit_balance >= 0),
  winnings_balance numeric(12,2) not null default 0 check (winnings_balance >= 0),
  bonus_balance numeric(12,2) not null default 0 check (bonus_balance >= 0),
  updated_at timestamptz not null default now()
);

-- Append-only ledger (update/delete block hai)
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  type text not null check (type in ('deposit','entry_fee','prize','withdrawal','withdrawal_refund','referral_bonus','admin_adjust','refund','gift_code','promo')),
  balance_type text not null check (balance_type in ('deposit','winnings','bonus')),
  direction text not null check (direction in ('credit','debit')),
  amount numeric(12,2) not null check (amount > 0),
  balance_after numeric(12,2) not null,
  reference_type text,
  reference_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index on transactions(user_id, created_at desc);

create or replace function forbid_ledger_change() returns trigger language plpgsql as $$
begin raise exception 'LEDGER_IMMUTABLE'; end $$;
create trigger trg_ledger_immutable before update or delete on transactions
  for each row execute function forbid_ledger_change();

create table deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'cashfree' check (method in ('cashfree','manual')),
  cf_order_id text unique,
  cf_payment_id text,
  manual_txn_id text,
  status text not null default 'pending' check (status in ('pending','success','failed','rejected')),
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  amount numeric(12,2) not null check (amount > 0),
  upi_id text,
  bank_details jsonb,
  status text not null default 'pending' check (status in ('pending','approved','paid','rejected')),
  admin_id uuid references admins(id),
  admin_note text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  category text,
  image_url text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id),
  title text not null,
  description text,
  rules text,
  banner_url text,
  entry_fee numeric(12,2) not null default 0 check (entry_fee >= 0),
  prize_pool numeric(12,2) not null default 0 check (prize_pool >= 0),
  prize_distribution jsonb not null default '[]',
  max_players int not null check (max_players > 0),
  starts_at timestamptz not null,
  status text not null default 'upcoming'
    check (status in ('upcoming','registration_open','full','ongoing','completed','cancelled')),
  room_id text,
  room_password text,
  room_published boolean not null default false,
  created_by uuid references admins(id),
  created_at timestamptz not null default now()
);

create table tournament_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  user_id uuid not null references users(id),
  fee_paid numeric(12,2) not null default 0,
  discount_applied numeric(12,2) not null default 0,
  placement int,
  prize_won numeric(12,2) not null default 0,
  joined_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

-- Spin wheel se sirf discount milta hai (cash nahi)
create table user_discounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  type text not null check (type in ('percent','flat')),
  value numeric(12,2) not null check (value > 0),
  source text not null default 'spin',
  expires_at timestamptz,
  used_at timestamptz,
  used_tournament_id uuid references tournaments(id),
  created_at timestamptz not null default now()
);

create table spin_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  reward jsonb not null,
  created_at timestamptz not null default now()
);

create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references users(id),
  referred_id uuid not null unique references users(id),
  status text not null default 'pending' check (status in ('pending','rewarded')),
  reward_amount numeric(12,2) not null default 0,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  check (referrer_id <> referred_id)
);

create table admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references admins(id),
  action text not null,
  target_type text,
  target_id text,
  details jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),  -- null = sabke liye
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

insert into settings(key,value) values
 ('referral_friend_bonus','5'),
 ('referral_referrer_bonus','5'),
 ('min_withdrawal','100'),
 ('registration_open','true'),
 ('maintenance_mode','false'),
 ('spin_daily_limit','1'),
 ('spin_rewards','[{"label":"10% OFF","type":"percent","value":10,"weight":30},{"label":"₹5 OFF","type":"flat","value":5,"weight":25},{"label":"20% OFF","type":"percent","value":20,"weight":10},{"label":"Better luck next time","type":"none","value":0,"weight":35}]')
on conflict do nothing;

-- Public tournament view (room_id/password isme NAHI hai)
create view tournament_public as
select t.id, t.game_id, t.title, t.description, t.rules, t.banner_url, t.entry_fee,
       t.prize_pool, t.prize_distribution, t.max_players, t.starts_at, t.status, t.room_published,
       (select count(*) from tournament_participants p where p.tournament_id = t.id)::int as joined_count
from tournaments t;

-- ============ ATOMIC FUNCTIONS (saara paisa logic DB transaction me) ============

create or replace function wallet_apply(
  p_user uuid, p_bal text, p_dir text, p_amount numeric, p_type text,
  p_ref_type text default null, p_ref_id uuid default null, p_note text default null
) returns numeric language plpgsql as $$
declare newbal numeric; delta numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  delta := case when p_dir = 'credit' then p_amount else -p_amount end;
  if p_bal = 'deposit' then
    update wallets set deposit_balance = deposit_balance + delta, updated_at = now()
      where user_id = p_user returning deposit_balance into newbal;
  elsif p_bal = 'winnings' then
    update wallets set winnings_balance = winnings_balance + delta, updated_at = now()
      where user_id = p_user returning winnings_balance into newbal;
  elsif p_bal = 'bonus' then
    update wallets set bonus_balance = bonus_balance + delta, updated_at = now()
      where user_id = p_user returning bonus_balance into newbal;
  else raise exception 'INVALID_BALANCE_TYPE'; end if;
  if newbal is null then raise exception 'WALLET_NOT_FOUND'; end if;
  insert into transactions(user_id,type,balance_type,direction,amount,balance_after,reference_type,reference_id,note)
    values (p_user,p_type,p_bal,p_dir,p_amount,newbal,p_ref_type,p_ref_id,p_note);
  return newbal;
end $$;

create or replace function register_user(p_email text, p_username text, p_hash text, p_ref_code text default null)
returns users language plpgsql as $$
declare u users; referrer_id uuid; friend_bonus numeric;
begin
  if coalesce(p_ref_code,'') <> '' then
    select id into referrer_id from users where referral_code = upper(p_ref_code) and status = 'active';
  end if;
  insert into users(email, username, password_hash, referred_by)
    values (lower(p_email), p_username, p_hash, referrer_id) returning * into u;
  insert into wallets(user_id) values (u.id);
  if referrer_id is not null then
    insert into referrals(referrer_id, referred_id) values (referrer_id, u.id);
    select (value #>> '{}')::numeric into friend_bonus from settings where key = 'referral_friend_bonus';
    if friend_bonus > 0 then
      perform wallet_apply(u.id,'bonus','credit',friend_bonus,'referral_bonus','referral',null,'Welcome bonus');
    end if;
  end if;
  return u;
end $$;

create or replace function join_tournament(p_user uuid, p_tournament uuid, p_discount_id uuid default null)
returns jsonb language plpgsql as $$
declare
  u users; t tournaments; w wallets; disc user_discounts; ref referrals;
  fee numeric(12,2); discount_amt numeric(12,2) := 0; remaining numeric(12,2);
  use_bonus numeric(12,2) := 0; use_dep numeric(12,2) := 0; use_win numeric(12,2) := 0;
  joined int; ref_bonus numeric; pid uuid;
begin
  select * into u from users where id = p_user for update;
  if not found or u.status <> 'active' then raise exception 'USER_NOT_ALLOWED'; end if;

  select * into t from tournaments where id = p_tournament for update;  -- slots race se bachata hai
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if t.status not in ('upcoming','registration_open') then raise exception 'REGISTRATION_CLOSED'; end if;
  if exists (select 1 from tournament_participants where tournament_id = t.id and user_id = p_user)
    then raise exception 'ALREADY_JOINED'; end if;
  select count(*) into joined from tournament_participants where tournament_id = t.id;
  if joined >= t.max_players then raise exception 'TOURNAMENT_FULL'; end if;

  fee := t.entry_fee;
  if fee > 0 and p_discount_id is not null then
    select * into disc from user_discounts
      where id = p_discount_id and user_id = p_user and used_at is null
        and (expires_at is null or expires_at > now()) for update;
    if not found then raise exception 'INVALID_DISCOUNT'; end if;
    discount_amt := least(fee, case when disc.type = 'percent' then round(fee * disc.value / 100, 2) else disc.value end);
    fee := fee - discount_amt;
    update user_discounts set used_at = now(), used_tournament_id = t.id where id = disc.id;
  end if;

  insert into tournament_participants(tournament_id, user_id, fee_paid, discount_applied)
    values (t.id, p_user, fee, discount_amt) returning id into pid;

  if fee > 0 then
    select * into w from wallets where user_id = p_user for update;
    if w.bonus_balance + w.deposit_balance + w.winnings_balance < fee then raise exception 'INSUFFICIENT_BALANCE'; end if;
    remaining := fee;
    use_bonus := least(w.bonus_balance, remaining);    remaining := remaining - use_bonus;
    use_dep   := least(w.deposit_balance, remaining);  remaining := remaining - use_dep;
    use_win   := remaining;
    if use_bonus > 0 then perform wallet_apply(p_user,'bonus','debit',use_bonus,'entry_fee','tournament',t.id,t.title); end if;
    if use_dep   > 0 then perform wallet_apply(p_user,'deposit','debit',use_dep,'entry_fee','tournament',t.id,t.title); end if;
    if use_win   > 0 then perform wallet_apply(p_user,'winnings','debit',use_win,'entry_fee','tournament',t.id,t.title); end if;

    -- Referrer reward: friend ne REAL deposit kiya ho + paid match join kare (bonus se farming rokne ke liye)
    select * into ref from referrals where referred_id = p_user and status = 'pending' for update;
    if found and exists (select 1 from deposits where user_id = p_user and status = 'success') then
      select (value #>> '{}')::numeric into ref_bonus from settings where key = 'referral_referrer_bonus';
      if ref_bonus > 0 then
        perform wallet_apply(ref.referrer_id,'bonus','credit',ref_bonus,'referral_bonus','referral',ref.id,'Referral reward');
      end if;
      update referrals set status = 'rewarded', reward_amount = coalesce(ref_bonus,0), rewarded_at = now() where id = ref.id;
    end if;
  end if;

  if joined + 1 >= t.max_players then update tournaments set status = 'full' where id = t.id; end if;
  return jsonb_build_object('participant_id', pid, 'fee_paid', fee, 'discount', discount_amt);
end $$;

-- Cashfree webhook/verify ke baad call hota hai. Idempotent: do baar call karne par double credit nahi.
create or replace function confirm_deposit(p_order_id text, p_cf_payment_id text, p_paid_amount numeric)
returns jsonb language plpgsql as $$
declare d deposits;
begin
  select * into d from deposits where cf_order_id = p_order_id for update;
  if not found then raise exception 'DEPOSIT_NOT_FOUND'; end if;
  if d.status = 'success' then return jsonb_build_object('already', true); end if;
  if d.amount <> p_paid_amount then raise exception 'AMOUNT_MISMATCH'; end if;
  update deposits set status = 'success', cf_payment_id = p_cf_payment_id, verified_at = now() where id = d.id;
  perform wallet_apply(d.user_id,'deposit','credit',d.amount,'deposit','deposit',d.id,'Cashfree deposit');
  return jsonb_build_object('already', false, 'amount', d.amount);
end $$;

-- ============ SECURITY: koi bhi table/function anon key se na khule ============
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;
revoke all on tournament_public from anon, authenticated;
revoke all on function wallet_apply(uuid,text,text,numeric,text,text,uuid,text) from public, anon, authenticated;
revoke all on function register_user(text,text,text,text) from public, anon, authenticated;
revoke all on function join_tournament(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function confirm_deposit(text,text,numeric) from public, anon, authenticated;
