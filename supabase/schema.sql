-- =========================================================================
-- Light House Surf Camp — bookings table
-- =========================================================================
-- Run once, in the Supabase dashboard: SQL Editor → New query → paste → Run.
--
-- The table is written only by netlify/functions/*, using the service-role
-- key. Row Level Security is ON and there is deliberately not a single
-- policy, which means every ordinary key -- the anon key the browser would
-- carry, any authenticated user -- can read nothing and write nothing. The
-- service role bypasses RLS by design, so the functions keep working.
--
-- That is the whole security model, and it only holds while the service-role
-- key stays in the Netlify environment. It must never appear in this
-- repository, in content/settings.json, or in anything the browser loads.
-- A guest's browser needs no access to this table at all: it asks
-- /api/payhere-status, which answers with figures and no personal details.
-- =========================================================================

create extension if not exists "pgcrypto";

create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),

  -- The reference the guest sees, PayHere echoes, and the callback matches
  -- on. Unique so a replayed checkout cannot fork one order into two rows.
  order_id      text not null unique,

  -- pending → paid | failed | cancelled | chargedback
  -- 'pending' is written before the guest leaves for the gateway, so a
  -- payment that completes after their laptop dies still has a row to land
  -- in. PayHere's own status_code 0 also means pending and stays here.
  status        text not null default 'pending',

  currency      text    not null,
  subtotal      numeric(10,2) not null,
  deposit       numeric(10,2) not null,   -- charged now
  balance       numeric(10,2) not null,   -- due on arrival
  deposit_rate  numeric(4,3)  not null,   -- the rate in force at the time

  -- The priced lines as the server computed them: id, name, unit, price,
  -- qty, total. Kept rather than referenced, because content/packages.json
  -- is edited in /admin and a price change must not rewrite what somebody
  -- already agreed to pay.
  items         jsonb not null,

  -- first, last, email, phone, level, guests, date, country, notes.
  guest         jsonb not null,

  locale        text,       -- which of the nine languages they booked in
  payhere       jsonb,      -- the verified callback payload, kept as a receipt

  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint bookings_status_known check (
    status in ('pending', 'paid', 'failed', 'cancelled', 'chargedback')
  ),
  constraint bookings_amounts_sane check (
    subtotal >= 0 and deposit >= 0 and balance >= 0
  )
);

-- The two questions ever asked of this table: "has this order been paid?"
-- (the callback and the status endpoint) and "what came in recently?"
create index if not exists bookings_order_id_idx on public.bookings (order_id);
create index if not exists bookings_status_created_idx on public.bookings (status, created_at desc);

alter table public.bookings enable row level security;

-- No policies on purpose. See the header.
-- Anything that needs to read this table should go through the functions.

comment on table public.bookings is
  'Deposit bookings from book.html. Written only by the Netlify payment functions via the service-role key; RLS is on with no policies, so no client key can reach it.';
