import {
  useEffect,
  useRef,
} from 'react';


export default function FloatingEditorShell({
  eyebrow,
  title,
  subtitle = null,
  backLabel,
  onClose,
  saving = false,
  className = '',
  bodyClassName = '',
  scrollSurface = false,
  footer = null,
  headerActions = null,
  children,
}) {
  const surfaceRef = useRef(null);
  useEffect(
    () => {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      function onKeyDown(event) {
        if (
          event.key === 'Escape'
          && !saving
        ) {
          onClose();
        }
      }

      window.addEventListener('keydown', onKeyDown);

      return () => {
        document.body.style.overflow = previousOverflow;
        window.removeEventListener('keydown', onKeyDown);
      };
    },
    [onClose, saving],
  );

  const surfaceClassName = [
    'billing-drawer',
    'floating-editor-surface',
    scrollSurface && 'floating-editor-scroll-surface',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const contentClassName = [
    'billing-drawer-body',
    'floating-editor-body',
    bodyClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className="billing-drawer-backdrop floating-editor-backdrop"
      role="presentation"
      onWheel={event => {
        if (scrollSurface && event.target === event.currentTarget) {
          surfaceRef.current?.scrollBy({top: event.deltaY, left: 0, behavior: 'auto'});
        }
      }}
      onMouseDown={event => {
        if (
          event.target === event.currentTarget
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onClick={event => {
        if (
          event.target === event.currentTarget
          && !saving
        ) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <section
        ref={surfaceRef}
        className={surfaceClassName}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="billing-drawer-header floating-editor-header">
          <div className="floating-editor-heading">
            <button
              type="button"
              className="floating-editor-back"
              onClick={onClose}
              disabled={saving}
            >
              <span aria-hidden="true">←</span>
              <span>{backLabel}</span>
            </button>

            <div className="floating-editor-title-row">
              <div>
                {eyebrow && (
                  <span className="section-kicker">
                    {eyebrow}
                  </span>
                )}
                <h2>{title}</h2>
                {subtitle && <p>{subtitle}</p>}
              </div>
            </div>
          </div>

          {headerActions && <div className="floating-editor-header-actions">{headerActions}</div>}
          <button
            type="button"
            className="billing-drawer-close floating-editor-close"
            onClick={onClose}
            disabled={saving}
            aria-label={backLabel}
            title={backLabel}
          >
            ×
          </button>
        </header>

        <div className={contentClassName}>
          {children}
        </div>

        {footer}
      </section>
    </div>
  );
}
