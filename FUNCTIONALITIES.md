# Changed Functionality

This document records only the functionality changed for authentication, users, and verifications.

## Login

- The login form defaults to `gawaadmin@email.com`.
- The login form defaults to `gawaadmin123`.
- Matching default credentials create the local GAWA admin session.
- Other credentials continue through the normal Supabase login flow.

## Users

- The users table definition matches the supplied Supabase schema.
- User verification is represented by `is_verified`.
- User suspension data is stored in `user_suspensions`.
- User flags are stored in `entity_flags`.
- The users API derives the displayed status from verification and suspension data.
- The users page loads users from the Supabase project configured in `.env`.
- The development Supabase fallback no longer throws an error when users are unavailable.

## Verifications

- Verification records are loaded from the Supabase-backed verification API.
- Verification status and user identity data are displayed in the verification workflow.
- Verification-related user data uses the current `users_table` fields.

## Configuration

The backend uses these `.env` values for Supabase:

```env
SUPABASE_URL=your-project-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The URL and service-role key must belong to the same Supabase project. Restart the backend after changing them.
