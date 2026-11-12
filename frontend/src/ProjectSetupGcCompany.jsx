import {GC_COMPANY_FIELDS,gcCompanyFieldState} from './projectSetupGcCompany.mjs';

/** Project-only corrections; exact Form 140 selection is verified by parent. */
export default function ProjectSetupGcCompany({contactInfo,source,sourcePending=false,sourceUnavailable=false,onChange}) {
  return <div className="project-setup-gc-company project-setup-span-full">
    <div className="project-setup-gc-company-heading">
      <strong>Company contact details</strong>
      <small>Current Form 140 values are references. Edit only when this project needs different details.</small>
    </div>
    <div className="project-setup-gc-company-grid">
      {GC_COMPANY_FIELDS.map(field=>{
        const state=gcCompanyFieldState(contactInfo,source,field.key);
        const sourceText=state.sourceVerified
          ? (state.reference || 'Not provided in Form 140')
          : (sourcePending ? 'Loading Form 140 reference…' : sourceUnavailable ? 'Form 140 reference unavailable' : 'No verified Form 140 match');
        return <div className={`project-setup-gc-company-field${field.key==='streetAddress'?' project-setup-span-full':''}`} key={field.key}>
          <label className="bid-edit-field">
            <span>{field.label}</span>
            <input type={field.key==='generalEmail'?'email':'text'} maxLength={1000}
              value={state.override??''}
              placeholder={state.reference || 'Project-specific override (optional)'}
              onChange={event=>onChange(field.key,event.target.value)} />
          </label>
          <div className="project-setup-gc-company-meta">
            <small className="project-setup-gc-company-status">{state.hasOverride
              ? (state.override===''?'Saved draft override · intentionally blank':'Saved draft override')
              : (state.sourceVerified?'Form 140 default':'Source not verified')}</small>
            <button type="button" className="secondary-button" onClick={()=>onChange(field.key,null)}
              disabled={!state.hasOverride}>Use Form 140 default</button>
          </div>
          <small className="project-setup-gc-company-reference">Form 140: {sourceText}</small>
        </div>;
      })}
    </div>
    <small className="project-setup-gc-company-disclaimer">An empty override means intentionally blank; “Use Form 140 default” removes the override. Changes are saved only in this SQL draft. Cognito Form 19 currently calculates company fields from Form 140; the project override mapping is not approved for creation yet.</small>
  </div>;
}
