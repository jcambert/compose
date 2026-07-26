#!/usr/bin/env node
import { registerInteractiveStackBrowserCommand } from './interactive-stack-browser-command.js';
import { createComposeCliProgram } from './program.js';
import { registerWorkspaceCommands } from './workspace-command.js';

const program = createComposeCliProgram();
registerInteractiveStackBrowserCommand(program);
registerWorkspaceCommands(program);

await program.parseAsync(process.argv);
