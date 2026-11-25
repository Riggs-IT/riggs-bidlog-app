import {verifiedServiceDisplay} from './projectExternalTeam.mjs';
export default function ProjectServiceBindings({detail}){
  const data=verifiedServiceDisplay(detail);
  return <div className="project-information-grid project-service-bindings">
    <div className="project-information-item"><span>Project Email</span>
      <strong>{data.email.href?<a href={data.email.href}>{data.email.value}</a>:data.email.value||'—'}</strong>
    </div>
    <div className="project-information-item"><span>Dropbox Folder</span>
      <strong>{data.folder.href?<a href={data.folder.href} target="_blank" rel="noopener noreferrer">{data.folder.value}</a>:data.folder.value||'—'}</strong>
    </div>
  </div>;
}
