# Task C3 plan — gear profiles migration and minimal web UI

Date: 2026-07-11
Status: implemented and verified after maintainer sign-off

## Scope

Add the minimum persisted gear inputs consumed by the Track C budget model: a profile
name, focal ratio, and filter kind. Sky brightness remains a site/client input and is not
stored on gear. Do not change planning fetch behavior and do not add dependencies.

## Implementation

1. Add `supabase/migrations/0004_gear_profiles.sql`, following `0001_init.sql` exactly for
   user ownership: `auth.users` cascade, bounds/check constraints, user/time index, RLS,
   and own-row select/insert/update/delete policies. Do not apply the migration from the
   agent environment.
2. Update `supabase/README.md` to record migration order `0001 -> 0002 -> 0003 -> 0004`
   and explain the deliberately small gear schema.
3. Add the `GearProfile` TypeScript type and server actions for authenticated create and
   delete operations. Each action derives `user_id` from `auth.getUser`; deletion also
   filters by `user_id` in addition to relying on RLS.
4. Load the signed-in user's profiles in the `/plan` server page. Anonymous rendering and
   planning behavior stay unchanged.
5. Add `GearCard.tsx` as a client component using the existing Card, Input, Button, and
   Badge primitives plus native selects. It lists profiles, creates validated profiles,
   deletes profiles, and reports action errors.
6. Lift selected-profile state into `PlanClient`, restore/persist its id through
   `localStorage`, and pass the selected profile to/from `GearCard`. This creates the C4
   consumption seam without changing any network request in C3.
7. Update `STATE.md` migration/web records and add the C3 completion item without changing
   the document version.

## Verification

- Inspect the migration against all four `0001` session policy forms and confirm the
  f-ratio/filter constraints exactly match the task contract.
- Run the web gate via direct binaries: TypeScript, ESLint, Vitest, and Next production
  build.
- Run the repository API gate as a regression check because the working baseline includes
  C2 API changes.
- Confirm `git diff --check`, no generated build churn, no dependency changes, and no SQL
  was applied to Supabase.
