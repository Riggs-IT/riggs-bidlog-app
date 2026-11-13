# AP4F3Z — Active Project reference and management-preview alignment

**Scope:** Bid Log frontend only. Use the existing Active Project SQL write path,
Cognito JIS read model, Form140 reference, Form206 directory, and Design Team
read-only presentation. **No SQL migration, bridge API change, Cognito POST,
job creation, staffing mutation, group sync or new CSS.**

## What changed

- Active Project GC now uses the shared Design Team contact card for email/address.
  The exact selected company is looked up in the existing Form140 directory.
  An ambiguous/missing identity never populates an arbitrary company's details.
  A legacy Cognito JIS fallback is permitted only for the unchanged saved GC when
  the JIS's company name independently matches. While ADMIN is changing the GC,
  the previous GC's JIS email/address cannot be mislabeled as the new GC.
- MANAGEMENT_ADMIN now loads the existing permitted read directories and can
  explore GC and Form206 Design Team selections locally, without invoking SQL
  edit, Cognito edit, or a write endpoint. Revert and reload restore saved data.
  Existing management watermark and no-Save restriction are preserved.
- ADMIN retains the existing GC name writer. There is NO new verified-identity
  Form19 writer for existing projects; Form206 selections here remain preview
  only. The current role-specific Project Setup editing gates are unchanged.
- No duplicate GC/Owner forms, new CSS, new route, or new database objects.

## Explicit limitations / future gates

- Form140 directory identity and the Active Projects writer's GC name are not
  the same durable identity. This UI cannot claim a verified Form19 update.
- Active Project GC PM remains a legacy name writer. GC history lives in draft
  SQL and cannot be silently adopted into an existing job without a controlled
  transition. Multiple Foremen and Additional Members remain separately owned.
- Form206 address/email references do not establish a Cognito Form19 write
  contract. No creation, Ready-for-JIS or Accounting-numbering gate opens here.
- Keeping the saved Cognito JIS reference read-only is intentional; the user
  still controls when to run a later provider-write certification.

## Acceptance

1. ADMIN selects a different GC on an existing project and sees that GC's
   verified Form140 email/address (or dashes, never the former company's data).
   The normal **Save Changes** controls are unchanged.
2. MANAGEMENT_ADMIN can open the GC directory and Architect/Engineer dropdowns.
   A choice displays reference metadata + a preview warning, but does not save;
   reload returns saved values. Do not use an actual production job as a test
   write target.
3. Other roles receive no new endpoints/capabilities. Existing Active Project
   source details and all financial/day-15 logic remain unchanged.
