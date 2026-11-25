import {projectBuildingLayout} from './projectEditorLayout.mjs';

export default function ProjectQuantitiesLayout({rows,canAdd,editing=false,onAdd,metrics,commercial,buildings}) {
  const layout=projectBuildingLayout(rows,canAdd,editing);
  const launcher=layout.canAddBuildings||layout.unavailable;
  return <div className={`active-project-layout-pair active-project-admin-buildings-pair project-quantities-layout${layout.showBuildings?' has-buildings':' no-buildings'}${launcher?' can-add-buildings':''}`}>
    {metrics}
    {commercial}
    {layout.showBuildings&&buildings}
    {launcher&&<div className="project-building-launcher">{layout.canAddBuildings?<button type="button" className="secondary-button" onClick={onAdd}>+ Add Buildings</button>:<small role="status">Building information unavailable. Reload details.</small>}</div>}
  </div>;
}
