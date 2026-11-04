# Architecture rules
- Keep temporary mock login destinations separate from authenticated dashboards; mock screens must never grant privileges, create sessions, persist passwords, or access live patient data.
- Control temporary mock login behavior through one shared module so real authentication can be restored consistently.