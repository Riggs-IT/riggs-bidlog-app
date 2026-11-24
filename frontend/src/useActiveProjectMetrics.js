import {useEffect, useMemo, useSyncExternalStore} from 'react';
import {createProjectMetricsEditor, metricsChanges} from './projectMetricsEditor.mjs';
import {createSetupOperationId} from './projectSetupAuthoring.mjs';
import {notifyWriteAuthFailure} from './writeAuthRecovery.mjs';

export default function useActiveProjectMetrics(jobListId, canEdit, setupId = null) {
  const editor = useMemo(() => createProjectMetricsEditor({jobListId, setupId, canEdit,
    ...(setupId ? {newId: createSetupOperationId} : {}),
    onAuthFailure: notifyWriteAuthFailure}), [jobListId, setupId, canEdit]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot);
  useEffect(() => {
    void editor.start();
    return () => editor.dispose();
  }, [editor]);
  return {editor, state, dirty: metricsChanges(state.snapshot, state.draft).length > 0};
}
