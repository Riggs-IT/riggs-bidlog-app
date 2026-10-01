import {useEffect} from 'react';
// Publication is derived immediately; this only reconciles the corresponding controls.
export default function useFacetSelectionCleanup(current, effective, setters, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    for (const key of Object.keys(setters)) if (current[key] !== effective[key]) setters[key](effective[key]);
  }, [enabled, JSON.stringify(current), JSON.stringify(effective)]);
}
