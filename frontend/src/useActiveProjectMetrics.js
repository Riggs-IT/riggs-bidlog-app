import {useEffect, useMemo, useSyncExternalStore} from 'react';
import {createProjectMetricsEditor, metricsChanges} from './projectMetricsEditor.mjs';
import {notifyWriteAuthFailure} from './writeAuthRecovery.mjs';

export default function useActiveProjectMetrics(jobListId, canEdit) {
  const editor = useMemo(() => createProjectMetricsEditor({jobListId, canEdit,
    onAuthFailure: notifyWriteAuthFailure}), [jobListId, canEdit]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot);
  useEffect(() => {
    void editor.start();
    return () => editor.dispose();
  }, [editor]);
  return {editor, state, dirty: metricsChanges(state.snapshot, state.draft).length > 0};
}
