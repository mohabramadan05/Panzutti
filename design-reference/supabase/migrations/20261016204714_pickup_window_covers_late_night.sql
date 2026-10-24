-- Pickup "today only" no longer blocks late-night orders when opening hours run past midnight:
-- the booking window always covers at least the next 6 hours after the earliest ready time.
do $mig$
declare d text; n text;
begin
  d := pg_get_functiondef('public.place_order(jsonb)'::regprocedure);
  n := replace(d,
    $a$if ts > (date_trunc('day', now() at time zone 'Africa/Cairo') + make_interval(days => days + 1)) at time zone 'Africa/Cairo' then$a$,
    $b$if ts > greatest((date_trunc('day', now() at time zone 'Africa/Cairo') + make_interval(days => days + 1)) at time zone 'Africa/Cairo', now() + make_interval(mins => adv + 360)) then$b$);
  if n = d then raise exception 'place_order: pattern not found'; end if;
  execute n;
  d := pg_get_functiondef('public.pickup_slots(jsonb)'::regprocedure);
  n := replace(d,
    $a$lim := (date_trunc('day', now() at time zone 'Africa/Cairo') + make_interval(days => days + 1)) at time zone 'Africa/Cairo';$a$,
    $b$lim := greatest((date_trunc('day', now() at time zone 'Africa/Cairo') + make_interval(days => days + 1)) at time zone 'Africa/Cairo', now() + make_interval(mins => greatest(prep, adv) + 360));$b$);
  if n = d then raise exception 'pickup_slots: pattern not found'; end if;
  execute n;
end $mig$;
