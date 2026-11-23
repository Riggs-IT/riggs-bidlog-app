import {useEffect,useState} from 'react';
import {requestSetup} from './projectSetupAuthoring.mjs';
import {validateJisList} from './unnumberedProjectEditor.mjs';
import UnnumberedProjectEditor from './UnnumberedProjectEditor.jsx';
export default function UnnumberedProjectsPanel({user}){
  const [items,setItems]=useState(null),[error,setError]=useState(false),[cycle,setCycle]=useState(0),[selected,setSelected]=useState(null);
  useEffect(()=>{const abort=new AbortController();setError(false);
    requestSetup('/api/project-setups/jis',{signal:abort.signal}).then(body=>{if(!abort.signal.aborted)setItems(validateJisList(body));})
      .catch(()=>{if(!abort.signal.aborted)setError(true);});return ()=>abort.abort();},[cycle]);
  return <section className="panel bid-log-list-card active-project-list-card m9b-unnumbered-panel" aria-label="Awaiting Job Number">
    <div className="bid-log-list-heading"><div><h2>Awaiting Job Number</h2><p className="bid-log-read-only-note">Created project information sheets; Accounting assigns the number later.</p></div><button type="button" className="secondary-button" onClick={()=>setCycle(v=>v+1)}>Refresh</button></div>
    {error?<p role="alert" className="bid-edit-message error">Unable to verify unnumbered projects. This is not an empty list.</p>:items===null?<p role="status">Loading unnumbered projects…</p>:items.length===0?<p className="bid-log-read-only-note">No created unnumbered projects in this rollout.</p>:
    <div className="bid-log-table-wrap"><table className="bid-log-table active-project-table"><thead><tr><th>Project</th><th>JIS</th><th>Status</th></tr></thead><tbody>{items.map(item=><tr key={item.setupId}><td><button type="button" className="secondary-button" onClick={()=>setSelected(item.setupId)}>{item.jobName}</button></td><td>{item.cognitoEntryId}</td><td>Awaiting Accounting</td></tr>)}</tbody></table></div>}
    {selected&&<UnnumberedProjectEditor key={selected} setupId={selected} user={user} onLeave={()=>{setSelected(null);setCycle(v=>v+1);}}/>}
  </section>;
}
