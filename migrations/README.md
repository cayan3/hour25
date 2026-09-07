# Database migrations

## Installation

Apply these to a Supabase project in numbered order by pasting each file into the SQL editor to run (this project doesn't have a CLI or local Docker stack so yes, you will have to do that manually >.<).

- `001`–`004` are required; after applying these, your local version should work (yay!).
- `005` supports statistics that are still WIP o7, so you can skip this until something in the code actually yk calls it.

Note: `004` ends with a set of `grant` statements that may just seem like boilerplate, but beware! They are not in fact optional. Postgres checks table-level grants separately from row-level security, and manually running these files means skipping the really nice and convenient part where the Supabase table editor just adds those for you. Without the grant statements, all your queries would fail with `42501 permission denied for table ...` even though the RLS policies are correct.

## Changing the schema

Don't edit a migration file that's already been applied somewhere, since any edits would cause the file to no longer match whatever database(s) already ran it. Instead, add schema changes to a new numbered file; this way, a fresh run will reproduce the same schema as the one running in prod.
