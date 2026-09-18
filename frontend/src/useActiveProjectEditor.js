import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { changedFields, createProjectEditor } from './activeProjectSave.js';

export default function useActiveProjectEditor(jobListId, canEdit) {
  const editor = useMemo(() => createProjectEditor({ jobListId, canEdit }), [jobListId, canEdit]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot);
  useEffect(() => {
    void editor.start();
    return () => editor.dispose();
  }, [editor]);
  const dirty = ['project', 'general'].some(section => changedFields(section, state[section].base, state[section].draft).length);
  const needsReview = state.conflicts.length > 0 || Boolean(state.project.unresolved || state.general.unresolved);
  useEffect(() => {
    if (!dirty && !state.saving && !needsReview) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, state.saving, needsReview]);
  return { editor, state, dirty, needsReview };
}
