# Architecture rules
- Original dashboard routes select sample or authenticated content; sample content must never grant privileges, create sessions, persist passwords, or access live patient data.
- Control temporary mock login behavior through one shared module so real authentication can be restored consistently.
- Demo video calls (original call screen at the demo id) use a separate no-account function with one shared short-lived room and no database access, so demos never touch patient records.
- Doctor sample workspace state lives only in memory and is shared across original dashboard/call navigation; never persist clinical drafts in browser storage or use sample state for real permissions.
- Sample call statistics start on the meeting-joined event and finish on leaving, not on claiming a visit, to avoid reporting queue time as call duration.
- Medicine choices do not prefill doses or issue prescriptions; clinical fields are bounded, explicit draft inputs to avoid unchecked treatment recommendations.
- Clinical notes and added medicines sync into the memory-only sample workspace on edit so closing panels does not discard documentation.
