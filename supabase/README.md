# Supabase setup

Execute `supabase/schema.sql` in the Supabase SQL Editor.

This creates:

- `public.workspaces`
- `public.workspace_state`

Current design:

- one default workspace
- JSON storage for app config, messages, KPIs, and last message id
- access reserved to `service_role` for now

Recommended next step:

1. create a Supabase project
2. run `schema.sql`
3. copy the project URL
4. copy the `anon` key
5. copy the `service_role` key for backend-only use
