import { useEffect } from 'react';

import OriginatingBidPanel from './OriginatingBidPanel.jsx';


export default function OriginatingBidAttentionDrawer({
  project,
  user,
  onClose,
  onLinked,
}) {
  useEffect(() => {
    if (!project) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    const onKeyDown = event => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [project, onClose]);

  if (!project) {
    return null;
  }

  return (
    <div
      className="billing-drawer-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        className="billing-drawer originating-bid-attention-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="originating-bid-attention-title"
      >
        <header className="billing-drawer-header">
          <div>
            <span className="section-kicker">
              ORIGINATING BID REVIEW
            </span>

            <h2 id="originating-bid-attention-title">
              {project.jobName || 'Current Project'}
            </h2>

            <p>
              Job {project.jobNumber || '—'}
            </p>
          </div>

          <button
            type="button"
            className="drawer-close-button"
            aria-label="Close originating bid review"
            title="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="billing-drawer-body">
          <OriginatingBidPanel
            project={project}
            user={user}
            onLinked={onLinked}
          />
        </div>
      </aside>
    </div>
  );
}
