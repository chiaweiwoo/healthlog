-- body_notes was always about profile context (lifestyle, medication, injuries,
-- preferences), not the human body. Rename for semantic clarity.
-- body_measurements (physical measurement events) is NOT renamed.
ALTER TABLE healthlog.body_notes RENAME TO profile_notes;
