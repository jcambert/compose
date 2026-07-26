import { dirname } from 'node:path';
import { parseComposeDocument } from '../yaml/compose-parser.js';
import { writeComposeDocument } from '../yaml/compose-writer.js';
import type { ComposeProject } from './compose-project.js';

export async function loadComposeProject(composeFilePath: string): Promise<ComposeProject> {
  const document = await parseComposeDocument(composeFilePath);

  return {
    directoryPath: dirname(composeFilePath),
    composeFilePath,
    document,
  };
}

export async function saveComposeProject(project: ComposeProject): Promise<void> {
  await writeComposeDocument(project.composeFilePath, project.document);
}
