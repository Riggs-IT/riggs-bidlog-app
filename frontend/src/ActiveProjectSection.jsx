import {useRef, useLayoutEffect} from 'react';
export {setProjectSectionsOpen} from './activeProjectDisclosure.mjs';

// Native details preserves mounted inputs, refs, and independent local drafts.
// Set the initial state on mount only; reference refreshes must not reset it.
export default function ActiveProjectSection({sectionId, kicker, title, note,
  initiallyOpen = false, className = 'bid-edit-section', children}) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.open = initiallyOpen;
  }, [initiallyOpen]);
  return (
    <details ref={ref} data-project-disclosure data-project-section={sectionId}
      className={`${className} active-project-disclosure`}>
      <summary className="active-project-disclosure-summary">
        <span className="active-project-disclosure-title">
          <span className="section-kicker">{kicker}</span>
          <span className="active-project-disclosure-name">{title}</span>
          {note && <small>{note}</small>}
        </span>
        <span className="active-project-disclosure-chevron" aria-hidden="true"/>
      </summary>
      <div className="active-project-disclosure-content">{children}</div>
    </details>
  );
}
