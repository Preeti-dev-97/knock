Knock

Knock is a notification-first mobile app. Users connect with other
people, send a quick Knock (normal or urgent), receive push
notifications, view activity/history, acknowledge Knocks, and exchange
text or image replies.

This README is the handover guide for setting up the existing project on
a new developer laptop and running it locally, connecting it to the
shared Supabase backend, and creating device builds.

1. Technology

Mobile/web: Expo SDK 58, React Native 0.88, Expo Router

Language: TypeScript

Backend: Supabase (Auth, Postgres, Row Level Security, Realtime,
Storage, Edge Functions)

Push delivery: Expo Push Notifications

Builds: Expo Application Services (EAS)

Known project configuration:

Setting Value

App name Knock
Expo slug Knock
URL scheme knock
EAS project ID c9999e5a-930c-422d-9538-8bea3ebdf903
Supabase project URL https://zxsaangbzropyxtyjdzu.supabase.co
Supabase project ref zxsaangbzropyxtyjdzu
Web bundler/output Metro / server

The repository's checked-in package.json, app.json/app.config.\*,
eas.json, and migration files are the source of truth for exact
package versions and build settings. Do not replace them with a newly
generated Expo project.

2. Prerequisites

Install the following on the new laptop:

Node.js LTS (use the version supported by the checked-in Expo
SDK and lockfile).

npm (the project uses npm commands and should be installed with
the committed package-lock.json).

Git.

Visual Studio Code or another TypeScript editor.

Expo Go on a physical Android/iOS device for supported local
development and UI testing.

EAS CLI for cloud builds: npx eas-cli.

Supabase CLI for database and Edge Function work: this
repository uses it through npx supabase.

For Android production push testing, use an EAS-built app installed on a
physical device. Do not treat Expo Go as the production
push-notification test environment. iOS push testing also requires a
physical device and valid Apple push credentials.

3. Get the source code

Clone the Knock repository (use the repository URL supplied by the
project owner):

git clone <KNOCK_REPOSITORY_URL>
cd Knock

Install the exact dependencies from the lockfile:

npm ci

If the repository does not contain a lockfile, use npm install and
commit the generated lockfile with the dependency changes.

Do not copy node_modules from another machine.

4. Environment configuration

Create a local .env file in the project root. Do not commit it.

EXPO_PUBLIC_SUPABASE_URL=https://zxsaangbzropyxtyjdzu.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<GET_FROM_SUPABASE_DASHBOARD>

Get the publishable key from the Knock Supabase project dashboard under
Project Settings → API (the publishable/anon client key, depending
on the dashboard label).

Notes:

These EXPO*PUBLIC* values are bundled into the client app. They
are not server secrets.

Never put the Supabase service_role key, database password,
webhook secret, receipt secret, or any other privileged credential
in .env or client-side code.

The server-side secrets are configured separately in Supabase Edge
Function secrets and Supabase Vault (see the push-notification
section).

Confirm .env is ignored by Git before committing.

The Supabase client is initialized in lib/supabase.ts. Keep its
platform-specific storage behavior intact: native uses AsyncStorage; web
uses guarded browser storage/fallback handling.

5. Run locally

Type-check first:

npx tsc --noEmit

Start the Expo development server:

npx expo start

For web:

npx expo start --web

If Metro has stale cache:

npx expo start -c

Then:

Scan the QR code with Expo Go for supported local Android/iOS
development.

Open the local web URL to test the web build.

Sign up with a test account, confirm email if email confirmation is
enabled for the Supabase project, then sign in.

Test the main Knock flow with at least two test users.

Use the scripts already present in package.json if they differ from
the commands above.

6. Supabase backend

Shared project

The existing shared backend is:

URL: https://zxsaangbzropyxtyjdzu.supabase.co

Project ref: zxsaangbzropyxtyjdzu

A new developer normally connects the local app to this shared backend
using the public client values in .env. Do not create a new Supabase
project unless the project owner explicitly asks for a separate
environment.

Database capabilities

The current backend includes the following application tables:

profiles

friend_requests

knocks

knock_recipients

knock_replies

knock_reply_reads

hidden_knock_activities

user_push_tokens

push_receipts

The schema also uses database functions/RPCs, triggers, indexes, Row
Level Security policies, Storage policies, and Realtime publication
membership. The send_knock(...) RPC sends a Knock to selected accepted
connections, supports normal/urgent priority, and enforces server-side
validation and recipient limits.

The profile signup flow stores full_name and username in Supabase
Auth user metadata. The database signup trigger creates the
corresponding profile. Keep this metadata contract intact when changing
signup code.

Link the Supabase CLI

From the repository root:

npx supabase login
npx supabase link --project-ref zxsaangbzropyxtyjdzu

The CLI may ask for the database password when linking or running
database operations. Obtain it securely from the project owner/Supabase
dashboard; do not commit it.

Migrations --- important handover rule

The current migration history was reconciled with the live project. The
known applied migrations include:

20261103120154_remote_schema.sql --- remote schema baseline
snapshot.

20261103130000_restore_missing_production_objects.sql --- restores
the auth signup trigger, the private knock-replies bucket and its
policies, and Realtime publication membership for knocks and
knock_recipients.

There may be earlier feature migrations in the repository history;
always inspect the actual checked-out supabase/migrations/ directory
and npx supabase migration list --linked before changing anything.

Do not delete, rename, edit, or blindly replay the remote baseline. Do
not run supabase db reset against the shared production project. The
baseline represents the existing remote schema and is already recorded
as applied. For a new schema change, add a new timestamped migration
after the latest migration, review it, and apply it only through the
agreed deployment process.

Useful inspection commands:

npx supabase migration list --linked

npx supabase db diff --linked

Review the generated diff carefully; do not automatically apply a diff
to production.

For a reviewed migration intended for the linked remote project:

npx supabase db push --linked

Use db push only after reviewing the migration files and confirming
the linked project is the intended Knock environment.

Supabase dashboard items

The current backend uses:

Supabase Auth and the handle_new_user() profile-creation trigger.

RLS on application tables.

Realtime subscriptions for Knock/activity updates.

A private Storage bucket named knock-replies for reply media.

Database extensions/functions used by the notification webhook and
scheduled job (pg_net/net.http_post, pg_cron, and Vault).

Do not manually recreate these objects if they already exist. Verify
them in the dashboard or through the migrations first.

7. Push notifications

Push notifications are implemented end to end.

Client implementation

The client registration/handler code is in lib/notifications.ts and is
wired into the authenticated app lifecycle in the root layout.

It:

Configures the Android notification channel knock-notifications.

Requests notification permission.

Gets the Expo push token using the EAS project ID.

Upserts the token into user_push_tokens.

Configures foreground notification presentation.

Handles notification responses and routes Knock notifications to the
relevant activity/history item.

The EAS project ID is:

c9999e5a-930c-422d-9538-8bea3ebdf903

Do not remove the project ID or notification-response handling when
refactoring the app.

Supabase Edge Functions

The deployed functions are:

send-knock-notification --- sends Expo push messages when a Knock
is created.

check-push-receipts --- checks Expo push receipts and updates
receipt status; invalid/unregistered device tokens are handled by
the function.

The database trigger trigger_knock_notification runs after inserts on
public.knocks and invokes the notification function through
net.http_post.

Function configuration

supabase/config.toml contains:

[functions.send-knock-notification]
verify_jwt = false

[functions.check-push-receipts]
verify_jwt = false

These functions use their own shared-secret validation. Keep the secrets
on the server only.

Deploy from the repository root after logging in and linking the correct
project:

npx supabase functions deploy send-knock-notification --no-verify-jwt
npx supabase functions deploy check-push-receipts --no-verify-jwt

The function source should be under:

supabase/functions/send-knock-notification/
supabase/functions/check-push-receipts/

Do not deploy modified functions until the code has been reviewed and
the required secrets are configured.

Required Edge Function secrets

The Knock project currently has these server-side secrets configured
(names only; never commit or paste their values):

SUPABASE_URL

SUPABASE_SERVICE_ROLE_KEY

KNOCK_WEBHOOK_SECRET

KNOCK_RECEIPT_CRON_SECRET

Other Supabase-managed environment values may be present in the project.
Do not copy service-role or secret values into the mobile app.

Set/update Edge Function secrets through the Supabase Dashboard or
securely through the CLI. Example CLI shape (replace placeholders
locally; never commit the command with real values):

npx supabase secrets set KNOCK_WEBHOOK_SECRET=<SECRET_VALUE> KNOCK_RECEIPT_CRON_SECRET=<SECRET_VALUE> --project-ref zxsaangbzropyxtyjdzu

If the Edge Functions require SUPABASE_URL or
SUPABASE_SERVICE_ROLE_KEY, Supabase normally provides these built-in
values to deployed functions; verify the deployed environment rather
than exposing them in the client.

Supabase Vault secrets

The database notification trigger and scheduled receipt checker read
secrets from Vault. The current Vault contains these names:

knock_project_url

knock_webhook_secret

knock_receipt_cron_secret

The values must match their corresponding project URL/webhook/receipt
configuration. The webhook secret in Vault must match
KNOCK_WEBHOOK_SECRET in the Edge Function environment. The receipt
secret in Vault must match KNOCK_RECEIPT_CRON_SECRET.

Create or update Vault secrets securely in the Supabase Dashboard/SQL
Editor. Never store their values in source control.

Scheduled receipt checking

A Supabase Cron job is already active:

Job ID: 1

Job name is configured in the live database.

Schedule: _/15 _ \* \* \* (every 15 minutes).

It invokes /functions/v1/check-push-receipts.

It reads the project URL and receipt secret from Vault.

Recent executions were verified as succeeded.

Useful verification SQL:

SELECT jobid, schedule, active
FROM cron.job
ORDER BY jobid;

SELECT runid, jobid, status, return_message, start_time
FROM cron.job_run_details
WHERE jobid = 1
ORDER BY start_time DESC
LIMIT 10;

The Cron status confirms that the scheduled SQL/HTTP request was
submitted; check Edge Function logs to verify function-level processing.

Production push prerequisites

For real device push delivery:

Use an EAS-built app installed on a physical device.

Configure the relevant Android FCM credentials in EAS for the
Android application.

Configure Apple push credentials for iOS builds.

Confirm the app's EAS project ID and native application identifiers
match the EAS project configuration.

Grant notification permission on the device.

Sign in so the device token is registered in user_push_tokens.

The app's push flow has been tested and notifications have been
received. Re-test after changing app identifiers, EAS credentials,
notification code, or Supabase functions.

8. Build and release

Use the repository's existing eas.json profiles. Do not replace the
existing configuration with a generated one.

Install/use EAS CLI:

npx eas-cli --version

Log in:

npx eas-cli login

Check project configuration:

npx eas-cli project:info

Build commands (use the matching profile defined in eas.json):

npx eas-cli build --platform android --profile preview

npx eas-cli build --platform android --profile production

For iOS:

npx eas-cli build --platform ios --profile production

The actual profile names and distribution settings in the checked-in
eas.json are authoritative. Store signing credentials in EAS; never
commit keystores, provisioning profiles, certificates, or private keys.

9. Suggested fresh-setup verification checklist

After cloning and installing:

npm ci completes successfully.

.env contains the Knock Supabase URL and publishable key.

npx tsc --noEmit passes.

npx expo start starts the app.

Web starts with npx expo start --web.

A test user can sign up and sign in.

A profile is created with the expected username/full name.

Two test users can connect/accept a friend request.

A user can send a normal Knock and an urgent Knock.

Multiple accepted recipients can receive a Knock.

Recipient activity/history updates correctly.

A recipient can acknowledge a Knock.

Text and image replies work; unread reply indicators update.

Activity can be cleared/hidden as intended.

Realtime updates appear without manually refreshing.

A physical device registers an Expo push token in
user_push_tokens.

Push notification arrives on another physical device.

Foreground, background, and terminated-app notification behavior
is tested.

Tapping a notification opens the correct Knock activity.

cron.job shows the receipt checker active and recent runs
succeed.

Edge Function logs show successful processing.

10. Troubleshooting

App cannot connect to Supabase

Check .env variable spelling and values.

Restart Expo after changing .env:

npx expo start -c

Confirm the URL/key belong to the Knock project, not another app.

Authentication/profile creation fails

Check Supabase Auth logs and database logs.

Verify the handle_new_user() trigger exists on auth.users.

Ensure signup still sends username and full_name metadata.

Check the username availability RPC and profile RLS policies.

Realtime does not update

Confirm the relevant tables are included in the supabase_realtime
publication.

Check RLS policies for the signed-in user.

Inspect client subscription status and Supabase Realtime logs.

Push notification is not received

Test on a physical device with an EAS-built app.

Check notification permission and the registered token in
user_push_tokens.

Confirm Android FCM or iOS APNs credentials are configured in EAS.

Inspect send-knock-notification Edge Function logs.

Check the knocks trigger and Vault webhook secret.

Check Expo push ticket/receipt status and push_receipts.

Inspect check-push-receipts logs and cron.job_run_details.

Supabase CLI migration mismatch

Run npx supabase migration list --linked.

Confirm the linked project ref is zxsaangbzropyxtyjdzu.

Do not delete migration history or reset the shared database to fix
a mismatch.

Ask the project owner to review migration history before using
migration repair.

11. Security and collaboration rules

Never commit .env, service-role keys, database passwords, webhook
secrets, receipt secrets, EAS credentials, or signing files.

Never use the service-role key in React Native or browser code.

Keep RLS enabled and review policies for every new table.

Make schema changes through timestamped migrations committed to Git.

Do not edit an already-applied production migration; add a new
migration.

Do not run destructive database commands against the shared project.

Do not create a second set of Cron jobs or duplicate database
triggers without checking what already exists.

Coordinate production database/function deployments with the project
owner.

12. Project structure

The repository's current structure is authoritative. The main areas used
by the app/backend include:

Knock/
├── app/
│ └── (tabs)/ # Main tab routes
├── lib/
│ ├── supabase.ts # Supabase client and storage adapter
│ └── notifications.ts # Push registration and notification handling
├── supabase/
│ ├── config.toml # Edge Function configuration
│ ├── migrations/ # Ordered database migrations
│ └── functions/
│ ├── send-knock-notification/
│ └── check-push-receipts/
├── .env # Local-only; do not commit
├── app.json / app.config.\* # Expo configuration
├── eas.json # EAS build profiles
├── package.json
└── package-lock.json

Some files may be in additional folders in the actual repository; do not
move working code simply to match this illustrative tree.

13. First-day setup summary

For a developer who has access to the repository and the Knock Supabase
project:

git clone <KNOCK_REPOSITORY_URL>
cd Knock
npm ci

Create .env with the Knock Supabase URL and publishable key, then:

npx tsc --noEmit
npx expo start

For backend work:

npx supabase login
npx supabase link --project-ref zxsaangbzropyxtyjdzu
npx supabase migration list --linked

For EAS builds:

npx eas-cli login
npx eas-cli project:info

A developer can run the client with the public Supabase configuration.
Database migrations, Edge Function deployments, Vault secrets, Cron
changes, and production builds require the appropriate project
permissions and should be coordinated with the project owner.

Document scope: This guide records the Knock configuration and
backend state verified during the project handover on 3 November 2026.
Always treat the checked-in source files and current Supabase/EAS
dashboard configuration as authoritative if they differ from this
document.
