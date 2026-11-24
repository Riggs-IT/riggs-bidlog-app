import {useEffect,useState} from 'react';
import {allProjectSectionsOpen,setProjectSectionsOpen} from './activeProjectDisclosure.mjs';

export default function ProjectSectionsToggle({rootRef,disabled=false}) {
  const [allOpen,setAllOpen]=useState(false);
  const [available,setAvailable]=useState(false);
  // Capture native toggle events from individual disclosures. Observe new
  // sections (e.g. Cognito details) as they arrive, not edits within fields.
  useEffect(()=>{
    const root=rootRef.current;
    if(!root){setAvailable(false);return undefined;}
    const sync=()=>{
      setAvailable(root.querySelectorAll('details[data-project-disclosure]').length>0);
      setAllOpen(allProjectSectionsOpen(root));
    };
    sync();
    root.addEventListener('toggle',sync,true);
    const observer=new MutationObserver(sync);
    observer.observe(root,{childList:true,subtree:true});
    return ()=>{root.removeEventListener('toggle',sync,true);observer.disconnect();};
  });
  return <div className="active-project-section-actions">
    <button type="button" className="secondary-button project-sections-toggle" disabled={disabled||!available}
      onClick={()=>{const next=!allProjectSectionsOpen(rootRef.current);setProjectSectionsOpen(rootRef.current,next);setAllOpen(next);}}>
      <span aria-hidden="true" className={`project-sections-toggle-arrow${allOpen?' is-up':''}`}/>
      {allOpen?'Collapse all':'Expand all'}
    </button>
  </div>;
}
