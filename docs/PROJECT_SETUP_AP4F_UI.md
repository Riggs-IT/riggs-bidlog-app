# AP4F — Awarded → saved draft → continue later

A confirmed complete Awarded lifecycle result opens the existing Projects workspace's new draft editor for ADMIN. Selecting a dropdown, an ordinary edit, or an incomplete/uncertain award must not navigate as successful setup. Partial lifecycle warnings remain visible. Existing award side effects are preserved; setup itself never calls Cognito creation.

The form is populated only after initial SQL persistence succeeds. Closing while that request is in progress warns/blocks ordinary navigation. A browser/network termination may still interrupt the award→setup handoff: use Start / continue project setup on the exact Awarded bid, which retries setup only and resumes a durable existing draft. The award is never automatically repeated. There is no distributed transaction between an external award and SQL.

Resume uses the stable SetupID from Awaiting information. Save & continue later waits for a verified operation receipt before leaving. Unknown writes keep the exact operation ID/body and offer an explicit exact retry, not a new command. Revision conflicts retain input until explicit reload. Automatic account-refresh objects do not reseed the editor. Original bid notes remain an immutable reference; the current awarded-bid reference may also be read on demand. Both have explicit append-into-Comments actions, never ongoing automatic sync.

ADMIN remains the only full-draft author. OPERATIONS keeps AP4E summary-only visibility and no Continue control. MANAGEMENT_ADMIN is not an editing role. Existing authentication/session/EID resolution and the central Data API client are reused. GET context is passive; authoring writes are not passive and require same-origin JSON/custom write header.

This pilot covers draft basics, general details, contacts, owner information, building names and Comments. GC text is a source reference, not a guessed lookup selection. Verified team/AOR/SEOR/GC selectors and live bid/Cognito synchronization are subsequent reviewed work. The interface labels all saves as draft-only. There is no job-number requirement or working Cognito action.

The existing neutral theme/styles and FloatingEditorShell are reused. Awaiting-information button placement remains deferred; the unrelated directory count is suppressed while viewing setup drafts. Accounting is untouched.
