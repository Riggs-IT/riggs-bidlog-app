import DesignTeamContactDetails from './DesignTeamContactDetails.jsx';
import {selectedReferenceContact,savedReferenceContact} from './projectEditorLayout.mjs';

export default function ProjectReferenceContactCard({field,selectedId,fields,emailKey,addressKeys,directories,lookup}) {
  if(!field)return null;
  const contact=selectedId==null&&field.selectionId==null&&typeof field.value==='string'&&field.value.trim()
    ?savedReferenceContact(field,selectedId,fields,emailKey,addressKeys)
    :selectedReferenceContact(field,selectedId,fields,emailKey,addressKeys,directories);
  return <div className="design-team-person-card">
    {lookup}
    <DesignTeamContactDetails contact={contact} showSource={false}/>
  </div>;
}
