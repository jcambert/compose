import type { ComposeDocument } from '../yaml/schemas/compose-schema.js';

export type ComposeProject = {
  directoryPath: string;
  composeFilePath: string;
  document: ComposeDocument;
};
