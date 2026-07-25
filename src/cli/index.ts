#!/usr/bin/env node
import { createComposeCliProgram } from './program.js';

await createComposeCliProgram().parseAsync(process.argv);
