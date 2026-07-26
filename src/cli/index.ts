#!/usr/bin/env node
import { registerInteractiveStackBrowserCommand } from './interactive-stack-browser-command.js';
import { createComposeCliProgram } from './program.js';

const program = createComposeCliProgram();
registerInteractiveStackBrowserCommand(program);

await program.parseAsync(process.argv);
