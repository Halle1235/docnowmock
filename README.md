# Remix of kry-clone-code (25)

Build me a exact copy of the swedish health care application KRY

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/90efb289-02e9-40b5-b8a7-c3c86b6a5564).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Booking verification emails

Enable email confirmations in the hosted Supabase Auth settings and configure the Magic Link/OTP and Confirm Signup templates from `supabase/templates`. The booking screen expects a six-digit code. Keep the recovery template as a password setup/reset link and allow the app's `/reset-password` URL in the Auth redirect allow list. Test sending through the configured SMTP provider before making this flow available to patients.

## Consultation-ready email

Apply the booking continuity migration and deploy the `send-visit-ready-emails` edge function. Configure `RESEND_API_KEY`, `DOCNOW_EMAIL_FROM` (a verified sender), `DOCNOW_APP_URL` (the HTTPS app origin), and `LOVABLE_CRON_SECRET` as server secrets.

Configure a scheduled POST to `/functions/v1/send-visit-ready-emails` once a minute with `Authorization: Bearer <LOVABLE_CRON_SECRET>`. Monitor HTTP failures and the worker's sent and failed counts. Verify delivery to a disposable confirmed patient account before enabling the schedule for real visits.
