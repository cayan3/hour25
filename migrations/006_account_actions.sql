-- 006: the two "Your data" actions in Settings — reset, and account deletion.
--
-- Both are SECURITY DEFINER because the `authenticated` role deliberately
-- cannot do this work itself. 004 grants no DELETE on labels or on
-- user_settings (labels are soft-delete only in v1), and auth.users is not
-- reachable from the client at all. Widening those grants was the alternative
-- and was rejected: it would hand every client a general label-delete
-- capability that v1 says must not exist, and it still would not allow an
-- account to delete itself.
--
-- Neither function takes a parameter, so there is no argument that could widen
-- the scope: the account is always auth.uid(), and a caller with no session is
-- refused rather than silently matching zero rows. search_path is pinned on
-- both — an unpinned definer function can be made to resolve `labels` (or any
-- function it calls) against a schema the caller controls, which is the
-- classic privilege-escalation footgun.
--
-- Deletion order is load-bearing: time_entries.label_id references labels with
-- no ON DELETE action, so entries must go before labels; labels.category_id is
-- ON DELETE SET NULL, so categories go last. A future user-owned table has to
-- be added to BOTH functions.
--
-- Run this file as the project owner (the `postgres` role the SQL editor uses
-- by default): a definer function executes with its owner's rights, and the
-- auth.users delete below needs a role that actually has them.

-- Wipes the account's data but keeps the account: the session survives, so the
-- app can re-render straight into onboarding rather than bouncing to sign-in.
create or replace function public.reset_my_data()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'reset_my_data requires an authenticated caller' using errcode = '28000';
  end if;

  delete from public.time_entries where user_id = v_user_id;
  delete from public.labels where user_id = v_user_id;
  delete from public.categories where user_id = v_user_id;

  -- The settings ROW is reset, not deleted — the auth user still exists, and
  -- deleting it would only make the client recreate it on the next load.
  -- Nulling onboarded_at is what makes this a fresh start rather than merely
  -- an empty account: onboarding runs again. sleep_label_id would be nulled by
  -- the label delete's ON DELETE SET NULL anyway; stating it is cheaper than
  -- making a reader chase the constraint.
  update public.user_settings
     set sleep_label_id = null,
         onboarded_at = null
   where user_id = v_user_id;
end;
$$;

-- The same wipe, plus the account itself. Irreversible: everything the app
-- knows about this person is gone when it returns.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'delete_my_account requires an authenticated caller' using errcode = '28000';
  end if;

  delete from public.time_entries where user_id = v_user_id;
  delete from public.labels where user_id = v_user_id;
  delete from public.categories where user_id = v_user_id;
  delete from public.user_settings where user_id = v_user_id;

  -- Last, and only after the explicit deletes above: every public table
  -- cascades from auth.users, but that cascade would remove labels and
  -- time_entries within one statement, and time_entries.label_id (no ON DELETE
  -- action) is not guaranteed to be satisfied at the point Postgres checks it.
  -- Clearing the dependents first makes the cascade uncontroversial; it also
  -- drops auth.identities and the user's sessions.
  delete from auth.users where id = v_user_id;
end;
$$;

-- EXECUTE on a new function is granted to PUBLIC by default. An anonymous call
-- would be refused by the auth.uid() guard above, but a definer function that
-- deletes accounts should not be callable by a role with no business calling
-- it in the first place.
revoke all on function public.reset_my_data() from public;
revoke all on function public.delete_my_account() from public;
grant execute on function public.reset_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
