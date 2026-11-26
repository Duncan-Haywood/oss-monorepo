// OWNER: interview UI agent — voice dictation building blocks (safe to reuse on any page).
export {
  appendTranscript,
  audioFileName,
  DictationButton,
  type DictationButtonProps,
  PRIVACY_NOTE,
  type TranscribeResponse,
  transcribeAudio,
} from "./dictation-button";
export {
  describeMediaError,
  formatDuration,
  isRecordingSupported,
  MAX_RECORDING_MS,
  pickMimeType,
  type Recorder,
  type RecorderState,
  type RecordingResult,
  type UseRecorderOptions,
  useRecorder,
} from "./use-recorder";
