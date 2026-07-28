#!/usr/bin/env node
import { registerDoctorCommand } from './doctor-command.js';
import { registerInteractiveStackBrowserCommand } from './interactive-stack-browser-command.js';
import { createComposeCliProgram } from './program.js';
import { registerUiCommand } from './ui-command.js';
import { registerWorkspaceCommands } from './workspace-command.js';

const program = createComposeCliProgram();
registerInteractiveStackBrowserCommand(program);
registerWorkspaceCommands(program);
registerDoctorCommand(program);
registerUiCommand(program);

await program.parseAsync(process.argv);
