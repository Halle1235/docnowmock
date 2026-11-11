# Database performance and running-credit optimization

## Measured baseline
- Recording window: October 29–November 11, 2026 (current day partial). App runtime requested **2.879 credits**; **2.746 credits** came from **35.47 Pico database instance-hours**. Build/chat/monitoring requested 133.887 credits separately.
- Other runtime: 740 function invocations requested 0.0074 credits; 0.0261 GB outbound transfer requested 0.0117 credits; AI requested 0.1138 credits. No database-storage usage item was returned; allocated storage GB-hours are unknown.
- Current Pico quote: 0.0774192 credits per active hour before allowances. Faster queries do not automatically reduce this hourly rate.
- Database health: 62% memory, 16% disk, 17/60 connections, no recent exhaustion alerts. This is a snapshot, not sustained capacity evidence; no resize or pause is proposed.
- Query statistics show approximately 2,800 role reads and 2,800 doctor-verification reads; each is fast, but account checks are repeated. Statistics reset time is unavailable, so these counts are cumulative, not per-day.
- The largest cumulative query is the admin profile list: 91 calls, 10.79 ms average. It performs required account synchronization and read auditing; preserve both.
- Activity log holds 8,305 rows (about 1.35 MB including indexes); most are required record-read audit entries. Latest-50 lookup scans all rows and sorts them: warmed execution 3.718 ms, 138 shared buffers; first probe was 95.173 ms. No timestamp index exists.
- No HTTP schedules were returned. Consultations are not currently published for database change subscriptions, so polling must remain as a delivery fallback.

## Proposed changes
1. **Deduplicate simultaneous account checks.** Share in-flight account verification, safely discard results from an older account, and await missing-account provisioning before role reads. Keep real sign-in, sign-out and server-enforced access checks intact; do not introduce permission caching or remove refresh events.
2. **Coalesce overlapping doctor-dashboard reads.** Prevent focus, timer, and subscription callbacks from launching duplicate requests simultaneously. Preserve the existing 15-second polling cadence, manual refresh, claim feedback, and required audited reads. Queue one follow-up refresh when a change happens during a request so new bookings are not missed.
3. **Index activity-log chronology.** Add one index on the existing activity timestamp for latest-entry reads. Keep every audit entry and all existing permissions. Do not add speculative consultation indexes to the currently tiny consultation table.

## Verification
- Capture request counts for identical signed-in account refresh and dashboard workloads before and after. Use the available requesting-user session; if it is not a doctor, report doctor end-to-end verification as unavailable rather than selecting another person's account.
- Add focused tests for concurrent-request coalescing, follow-up delivery, rejected-request recovery, and stale account results; run relevant existing account tests.
- Re-run the same latest-50 query plan and confirm the timestamp index is used with fewer buffers. Validate schema change through a fresh database read and check the preview's error log.
- Compare recorded database instance-hours over a representative later period before claiming running-credit savings. No cash savings or reduced credit deductions are established yet.

## Technical details
- Add a small shared in-flight refresh utility, used by AccountProvider and the live doctor dashboard; record its lifecycle rule in AGENTS.md.
- Apply the timestamp index through the managed migration tool only. Leave existing migration files unchanged.
- Do not alter patient-record authorization, clinical lifecycle, retention, payment settings, notification timing, or feature availability.

## Not included
Deleting records, reducing notification freshness, changing models, pausing/resizing the database, automatically completing abandoned visits, and restoring retired dashboard tools require separate decisions and are outside this optimization.