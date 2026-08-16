export type PublishEntryState =
  | 'LOADING'
  | 'AVAILABLE'
  | 'IDENTITY_REQUIRED'
  | 'LIMIT_REACHED'
  | 'ERROR';

export type PublishEditorState =
  | 'CREATE'
  | 'EDIT_DRAFT'
  | 'EDIT_ONLINE_REVISION'
  | 'AUTOSAVING'
  | 'UPLOADING'
  | 'VALIDATION_ERROR'
  | 'SUBMITTING'
  | 'SAVED';

export type PublishResultState =
  | 'PREVIEW'
  | 'SUBMITTING'
  | 'PENDING_REVIEW'
  | 'ONLINE'
  | 'SUBMIT_FAILED';

export type PublishEntryEvent =
  | { type: 'LOAD_SUCCEEDED'; canPublish: true; identityVerified: true; remainingQuota: number }
  | { type: 'LOAD_SUCCEEDED'; canPublish: false; identityVerified: false; remainingQuota: number }
  | { type: 'LOAD_SUCCEEDED'; canPublish: false; identityVerified: true; remainingQuota: 0 }
  | { type: 'LOAD_FAILED' }
  | { type: 'RETRY' };

export function reducePublishEntry(
  state: PublishEntryState,
  event: PublishEntryEvent,
): PublishEntryState {
  switch (event.type) {
    case 'LOAD_FAILED':
      return 'ERROR';
    case 'RETRY':
      return state === 'ERROR' ? 'LOADING' : state;
    case 'LOAD_SUCCEEDED':
      if (!event.identityVerified) return 'IDENTITY_REQUIRED';
      if (event.remainingQuota === 0) return 'LIMIT_REACHED';
      return event.canPublish ? 'AVAILABLE' : 'ERROR';
  }
}

export type PublishEditorEvent =
  | { type: 'EDIT_DRAFT' }
  | { type: 'EDIT_ONLINE_REVISION' }
  | { type: 'AUTOSAVE_STARTED' }
  | { type: 'UPLOAD_STARTED' }
  | { type: 'VALIDATION_FAILED' }
  | { type: 'SUBMIT_STARTED' }
  | { type: 'SAVE_SUCCEEDED' }
  | { type: 'RESET' };

export function reducePublishEditor(
  state: PublishEditorState,
  event: PublishEditorEvent,
): PublishEditorState {
  switch (event.type) {
    case 'EDIT_DRAFT':
      return state === 'CREATE' || state === 'SAVED' ? 'EDIT_DRAFT' : state;
    case 'EDIT_ONLINE_REVISION':
      return state === 'SAVED' ? 'EDIT_ONLINE_REVISION' : state;
    case 'AUTOSAVE_STARTED':
      return state === 'CREATE' || state === 'EDIT_DRAFT' || state === 'EDIT_ONLINE_REVISION'
        ? 'AUTOSAVING'
        : state;
    case 'UPLOAD_STARTED':
      return state === 'CREATE' || state === 'EDIT_DRAFT' || state === 'EDIT_ONLINE_REVISION'
        ? 'UPLOADING'
        : state;
    case 'VALIDATION_FAILED':
      return state === 'CREATE' || state === 'EDIT_DRAFT' || state === 'EDIT_ONLINE_REVISION'
        ? 'VALIDATION_ERROR'
        : state;
    case 'SUBMIT_STARTED':
      return state === 'CREATE' || state === 'EDIT_DRAFT' || state === 'EDIT_ONLINE_REVISION'
        ? 'SUBMITTING'
        : state;
    case 'SAVE_SUCCEEDED':
      return state === 'AUTOSAVING' || state === 'UPLOADING' || state === 'SUBMITTING'
        ? 'SAVED'
        : state;
    case 'RESET':
      return 'CREATE';
  }
}

export type PublishResultEvent =
  | { type: 'PREVIEW_READY' }
  | { type: 'SUBMIT_STARTED' }
  | { type: 'SUBMIT_ACCEPTED' }
  | { type: 'REVIEW_ACCEPTED' }
  | { type: 'SUBMIT_FAILED' }
  | { type: 'RETRY' };

export function reducePublishResult(
  state: PublishResultState,
  event: PublishResultEvent,
): PublishResultState {
  switch (event.type) {
    case 'PREVIEW_READY':
      return state === 'PREVIEW' ? state : 'PREVIEW';
    case 'SUBMIT_STARTED':
      return state === 'PREVIEW' || state === 'SUBMIT_FAILED' ? 'SUBMITTING' : state;
    case 'SUBMIT_ACCEPTED':
      return state === 'SUBMITTING' ? 'PENDING_REVIEW' : state;
    case 'REVIEW_ACCEPTED':
      return state === 'PENDING_REVIEW' ? 'ONLINE' : state;
    case 'SUBMIT_FAILED':
      return state === 'SUBMITTING' ? 'SUBMIT_FAILED' : state;
    case 'RETRY':
      return state === 'SUBMIT_FAILED' ? 'PREVIEW' : state;
  }
}
