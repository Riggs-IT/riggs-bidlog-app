import ActiveProjectGeneralEditor from './ActiveProjectGeneralEditor.jsx';

function textValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  return String(value);
}


function lookupLabel(value) {
  return textValue(value?.label);
}


function moneyValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return new Intl.NumberFormat(
    'en-US',
    {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    },
  ).format(number);
}


function fileSize(value) {
  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes < 0) {
    return null;
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


function ReadField({
  label,
  value,
  hint = null,
  wide = false,
}) {
  const displayValue = textValue(value);

  return (
    <div className={wide ? 'cognito-read-field wide' : 'cognito-read-field'}>
      <span>{label}</span>
      <div className={displayValue ? '' : 'is-empty'}>
        {displayValue || ' '}
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}


function BooleanField({ label, value, hint = null }) {
  const known = value === true || value === false;

  return (
    <div className="cognito-read-field cognito-checkbox-field">
      <span>{label}</span>
      <div className="cognito-checkbox-value">
        <span
          className={
            value === true
              ? 'cognito-checkbox-box checked'
              : 'cognito-checkbox-box'
          }
          aria-hidden="true"
        >
          {value === true ? '✓' : ''}
        </span>
        <strong>{known ? (value ? 'Yes' : 'No') : ' '}</strong>
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}


function FileList({ files }) {
  const items = Array.isArray(files) ? files : [];

  if (!items.length) {
    return <div className="cognito-file-empty">No file attached</div>;
  }

  return (
    <div className="cognito-file-list">
      {items.map((file, index) => (
        <div
          className="cognito-file-row"
          key={file?.id || `${file?.name || 'file'}-${index}`}
        >
          <span>{file?.name || 'Attached file'}</span>
          <small>
            {[fileSize(file?.size), file?.contentType]
              .filter(Boolean)
              .join(' · ')}
          </small>
        </div>
      ))}
    </div>
  );
}


function SupplierRow({
  title,
  supplier,
  amount,
  files,
}) {
  return (
    <div className="cognito-supplier-row">
      <div className="cognito-supplier-label">{title}</div>
      <div className="cognito-supplier-value">
        {textValue(supplier) || ' '}
      </div>
      <div className="cognito-supplier-value amount">
        {moneyValue(amount) || ' '}
      </div>
      <div className="cognito-supplier-files">
        <FileList files={files} />
      </div>
    </div>
  );
}


function SectionHeading({ kicker, title, note = null }) {
  return (
    <div className="bid-edit-section-heading information-sheet-heading">
      <div>
        <span className="section-kicker">{kicker}</span>
        <h3>{title}</h3>
      </div>
      {note && <small>{note}</small>}
    </div>
  );
}


function Subheading({ children }) {
  return (
    <div className="information-sheet-subheading">
      {children}
    </div>
  );
}


export default function ActiveProjectCognitoSections({
  payload,
  loading,
  error,
  onRetry,
  jobListId,
  canEdit,
  blocked,
  onGeneralStateChange,
}) {
  if (loading) {
    return (
      <section className="bid-edit-section information-sheet-section cognito-detail-loading-section">
        <SectionHeading
          kicker="JOB INFORMATION SHEET"
          title="Additional Project Information"
          note="Live from Cognito"
        />
        <div className="bid-edit-message">
          Loading the rest of the Job Information Sheet…
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bid-edit-section information-sheet-section cognito-detail-loading-section">
        <SectionHeading
          kicker="JOB INFORMATION SHEET"
          title="Additional Project Information"
          note="Live from Cognito"
        />
        <div className="bid-edit-message error">
          <span>{error}</span>
          <button
            type="button"
            className="secondary-button"
            onClick={onRetry}
          >
            Retry Cognito Detail
          </button>
        </div>
      </section>
    );
  }

  if (!payload) {
    return null;
  }

  const general = payload.generalInformation || {};
  const gc = payload.generalContractor || {};
  const gcpm = payload.gcProjectManagement || {};
  const gcSuper = payload.gcSuperintendent || {};
  const owner = payload.owner || {};
  const lender = payload.lenderInformation || {};
  const contract = payload.contractsAndAdministration || {};
  const architect = payload.architectOfRecord || {};
  const structural = payload.structuralEngineerOfRecord || {};
  const suppliers = payload.authorizedSuppliers || {};
  const concrete = payload.concrete || {};
  const startup = payload.riggsStartup || {};
  const detailing = payload.detailing || {};
  const controls = payload.controls || {};
  const closeout = payload.closeout || {};
  const entry = payload.entry || {};

  const buildings = Array.isArray(general.buildingNames)
    ? general.buildingNames.filter(item => item?.name)
    : [];
  const submittals = Array.isArray(detailing.requiredSubmittals)
    ? detailing.requiredSubmittals.filter(Boolean)
    : [];

  return (
    <>
      {Number(jobListId) === 24 ? (
      <ActiveProjectGeneralEditor
        key={jobListId}
        jobListId={jobListId}
        canEdit={canEdit}
        blocked={blocked}
        onStateChange={onGeneralStateChange}
      />
      ) : (
      <section className="bid-edit-section information-sheet-section">
        <SectionHeading
          kicker="GENERAL INFORMATION"
          title="Scope & Project Requirements"
          note="Cognito master record"
        />

        <div className="bid-edit-grid four-column information-sheet-grid">
          <ReadField
            label="Number of Buildings"
            value={payload.numberOfBuildings}
          />
          <BooleanField label="LEED" value={general.leed} />
          <BooleanField label="NDA Required" value={general.ndaRequired} />
          <BooleanField
            label="Contract"
            value={payload.contract}
            hint="Form control value"
          />
          <ReadField
            label="Scope"
            value={general.scope}
            wide
          />
          <ReadField
            label="Building Names"
            value={buildings.map(item => item.name).join('\n')}
            wide
          />
        </div>
      </section>
      )}

      <section className="bid-edit-section information-sheet-section">
        <SectionHeading
          kicker="GENERAL CONTRACTOR"
          title="GC Contacts"
        />

        <Subheading>General Contractor</Subheading>
        <div className="bid-edit-grid three-column information-sheet-grid">
          <ReadField label="GC Street Address" value={gc.gcStreetAddress} />
          <ReadField label="GC City / State / ZIP" value={gc.gcCityStateZip} />
          <ReadField label="GC Email" value={gc.gcEmail} />
        </div>

        <Subheading>GC Project Management</Subheading>
        <div className="bid-edit-grid four-column information-sheet-grid">
          <ReadField label="Office" value={gcpm.gcpmOffice} />
          <ReadField label="Mobile" value={gcpm.gcpmMobile} />
          <ReadField label="Email" value={gcpm.gcpmEmail} />
          <ReadField label="PM Name" value={gcpm.gcpmName} />
        </div>

        <Subheading>GC Superintendent</Subheading>
        <div className="bid-edit-grid three-column information-sheet-grid">
          <ReadField label="Name" value={gcSuper.gcSuperName} />
          <ReadField label="Mobile" value={gcSuper.gcSuperMobile} />
          <ReadField label="Email" value={gcSuper.gcSuperEmail} />
        </div>
      </section>

      <section className="bid-edit-section information-sheet-section">
        <SectionHeading
          kicker="PROJECT PARTIES"
          title="Owner & Lender"
        />

        <Subheading>Owner</Subheading>
        <div className="bid-edit-grid four-column information-sheet-grid">
          <ReadField label="Owner Name" value={owner.ownerName} />
          <ReadField label="Owner Email" value={owner.ownerEmail} />
          <ReadField label="Street Address" value={owner.ownerStreetAddress} />
          <ReadField label="City / State / ZIP" value={owner.ownerCityStateZip} />
        </div>

        <Subheading>Lender Information</Subheading>
        <div className="bid-edit-grid three-column information-sheet-grid">
          <ReadField label="Lender" value={lender.lender} />
          <ReadField label="Street Address" value={lender.lenderStreet} />
          <ReadField label="City / State / ZIP" value={lender.lenderCityStateZip} />
        </div>
      </section>

      <section className="bid-edit-section information-sheet-section">
        <SectionHeading
          kicker="CONTRACTS & ADMINISTRATION"
          title="Commercial Information"
          note="Controlled values are read-only in this pass"
        />

        <div className="bid-edit-grid four-column information-sheet-grid">
          <ReadField label="Contract Amount" value={moneyValue(contract.contractAmount)} />
          <ReadField label="Bond" value={contract.bond} />
          <ReadField label="OH&P" value={contract.ohp} />
          <ReadField label="Parcel" value={contract.parcel} />
        </div>
      </section>

      <section className="bid-edit-section information-sheet-section">
        <SectionHeading
          kicker="DESIGN TEAM"
          title="Architect & Structural Engineer"
        />

        <Subheading>Architect of Record</Subheading>
        <div className="bid-edit-grid three-column information-sheet-grid">
          <ReadField label="Name" value={lookupLabel(architect.aorName)} />
          <ReadField label="Email" value={architect.aorEmail} />
          <ReadField label="Address" value={architect.aorAddress} />
        </div>

        <Subheading>Structural Engineer of Record</Subheading>
        <div className="bid-edit-grid three-column information-sheet-grid">
          <ReadField label="Name" value={lookupLabel(structural.seorName)} />
          <ReadField label="Email" value={structural.seorEmail} />
          <ReadField label="Address" value={structural.seorAddress} />
        </div>
      </section>

      <section className="bid-edit-section information-sheet-section">
        <SectionHeading
          kicker="AUTHORIZED SUPPLIERS"
          title="Suppliers & Contracts"
          note="Files shown as metadata only"
        />

        <div className="cognito-supplier-sheet">
          <div className="cognito-supplier-row header" aria-hidden="true">
            <div>Category</div>
            <div>Supplier</div>
            <div>Amount</div>
            <div>Contract</div>
          </div>
          <SupplierRow
            title="Primary Concrete"
            supplier={suppliers.primaryConcreteSupplier}
            amount={suppliers.pcsAmount}
            files={suppliers.pcsContract}
          />
          <SupplierRow
            title="Secondary Concrete"
            supplier={suppliers.secondaryConcreteSupplier}
            amount={suppliers.scsAmount}
            files={suppliers.scsContract}
          />
          <SupplierRow
            title="Primary Aggregate"
            supplier={suppliers.primaryAggregateSupplier}
            amount={suppliers.pasAmount}
            files={suppliers.pasContract}
          />
          <SupplierRow
            title="Secondary Aggregate"
            supplier={suppliers.secondaryAggregateSupplier}
            amount={suppliers.sasAmount}
            files={suppliers.sasContract}
          />
          <SupplierRow
            title="Rebar"
            supplier={suppliers.rebarSupplier}
            amount={suppliers.rebarAmount}
            files={suppliers.rebarContract}
          />
          <SupplierRow
            title="Sitework"
            supplier={suppliers.siteSubcontractor}
            amount={suppliers.siteAmount}
            files={suppliers.siteworkContract}
          />
          <SupplierRow
            title="Patching"
            supplier={suppliers.patchingSubcontractor}
            amount={suppliers.patchingAmount}
            files={suppliers.patchingContract}
          />
        </div>

        <div className="cognito-workflow-line">
          <BooleanField
            label="Send to Contracts"
            value={suppliers.sendToContracts}
            hint="Workflow-controlled action"
          />
        </div>
      </section>

      <section className="bid-edit-section information-sheet-section">
        <SectionHeading
          kicker="CONCRETE"
          title="Concrete & Mix Designs"
        />

        <div className="bid-edit-grid two-column information-sheet-grid">
          <ReadField label="Primary Supplier" value={concrete.primarySupplier} />
          <ReadField label="Secondary Supplier" value={concrete.secondarySupplier} />
          <ReadField
            label="Primary Approved Mix Designs"
            value={concrete.approvedMixDesignsPrimarySupplier}
            wide
          />
          <ReadField
            label="Secondary Approved Mix Designs"
            value={concrete.approvedMixDesignsSecondarySupplier}
            wide
          />
        </div>
      </section>

      <section className="bid-edit-section information-sheet-section">
        <SectionHeading
          kicker="RIGGS STARTUP"
          title="Startup & Operations"
          note="Staffing and lifecycle actions remain controlled"
        />

        <div className="bid-edit-grid four-column information-sheet-grid">
          <ReadField label="Estimated Start" value={startup.estimatedStartDate} />
          <ReadField
            label="Estimated Duration"
            value={
              startup.estimatedDuration === null
                || startup.estimatedDuration === undefined
                ? null
                : `${startup.estimatedDuration} months`
            }
            hint="Cognito is the duration authority"
          />
          <ReadField label="Foreman" value={lookupLabel(startup.foreman)} />
          <ReadField label="Surveyor" value={lookupLabel(startup.surveyor)} />
          <ReadField label="Additional Member" value={lookupLabel(startup.additionalMember)} />
          <ReadField label="Team Distribution List" value={startup.teamDistributionList} />
          <ReadField label="Dropbox Folder Name" value={startup.dropboxFolderName} />
          <ReadField label="Job Filter Keywords" value={startup.jobFilterKeywords} />
          <ReadField label="Startup Comments" value={startup.comments} wide />
        </div>

        <Subheading>Project Controls</Subheading>
        <div className="cognito-checkbox-grid">
          <BooleanField label="Warranty Work" value={startup.warrantyWork} />
          <BooleanField label="Folder Created" value={startup.folderCreated} />
          <BooleanField label="Project Completed" value={startup.projectCompleted} />
          <BooleanField label="Lock Time" value={startup.lockTime} />
          <BooleanField label="Retention Collected" value={startup.retentionCollected} />
          <BooleanField
            label="Publish Updated Preliminary Lien Info Sheet"
            value={startup.publishUpdatedPreliminaryLeinInfoSheet}
          />
          <ReadField label="Date Project Completed" value={startup.dateProjectCompleted} />
          <BooleanField
            label="Notify Everyone"
            value={payload.notifyEveryone}
            hint="Workflow-controlled action"
          />
        </div>
      </section>

      <section className="bid-edit-section information-sheet-section">
        <SectionHeading
          kicker="DETAILING"
          title="Detailing Requirements"
        />

        <div className="bid-edit-grid two-column information-sheet-grid">
          <ReadField
            label="Required Submittals"
            value={submittals.join('\n')}
            wide
          />
          <ReadField
            label="Comments for Detailing"
            value={detailing.commentsForDetailing}
            wide
          />
        </div>
      </section>

      <section className="bid-edit-section information-sheet-section">
        <SectionHeading
          kicker="CLOSEOUT"
          title="Closeout Contacts"
        />

        <div className="bid-edit-grid two-column information-sheet-grid">
          <ReadField label="Additional Email 1" value={closeout.additionalEmail1} />
          <ReadField label="Additional Email 2" value={closeout.additionalEmail2} />
        </div>
      </section>

      <section className="bid-edit-section information-sheet-section active-project-reference-section">
        <SectionHeading
          kicker="SYSTEM"
          title="Cognito & Automation Reference"
          note="Read-only generated/control values"
        />

        <div className="bid-edit-grid four-column information-sheet-grid">
          <ReadField label="Cognito Entry" value={payload.cognitoEntryId} />
          <ReadField label="Entry Version" value={entry.version} />
          <ReadField label="Entry Status" value={entry.status} />
          <ReadField label="Last Cognito Update" value={entry.dateUpdated} />
          <ReadField label="Control Project Name" value={controls.controlProjectName} />
          <ReadField label="GC in Foundation" value={controls.gcInFoundation} />
          <ReadField label="Riggs PM Email" value={controls.riggsPMEmail} />
          <ReadField label="Riggs APM Email" value={controls.riggsAPMEmail} />
          <ReadField label="Riggs PE Email" value={controls.riggsPEEmail} />
          <ReadField label="Riggs Superintendent Email" value={controls.riggsSuperEmail} />
          <ReadField label="Riggs Foreman Email" value={controls.riggsForemanEmail} />
          <ReadField label="Riggs Surveyor Email" value={controls.riggsSurveyorEmail} />
          <ReadField label="Surveyor Email" value={controls.surveyorEmail} />
        </div>
      </section>
    </>
  );
}
