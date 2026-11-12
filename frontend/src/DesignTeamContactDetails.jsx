import React from 'react';

// Presentation only. Contact metadata comes from the authorized Form 206
// directory or from the current Cognito Form 19 read model. Never use these
// display values as lookup identities or as client-generated Form 19 writes.
export default function DesignTeamContactDetails({
  contact = null,
  fallbackEmail = null,
  fallbackAddress = null,
  source = 'Form 206 directory',
  pending = false,
  showSource = true,
}) {
  const email = fallbackEmail || contact?.email;
  const address = fallbackAddress || contact?.address;
  const hasContact = Boolean(email || address);

  return (
    <div className="design-team-contact-details" aria-label="Design contact information">
      <div className="active-project-readonly-field">
        <span>Email</span>
        <strong>{email || '—'}</strong>
      </div>
      <div className="active-project-readonly-field">
        <span>Address</span>
        <strong>{address || '—'}</strong>
      </div>
      {showSource && <small className="design-team-contact-provenance">
        {pending ? 'Loading contact details…'
          : hasContact ? source
          : 'Contact details not available from directory'}
      </small>}
    </div>
  );
}
