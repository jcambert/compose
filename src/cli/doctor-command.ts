import type { Command } from 'commander';
import { formatDoctorReport, runDoctor } from '../doctor/doctor.js';

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Run local diagnostics for Node.js, Docker, Docker Compose and compose configuration.')
    .option('--json', 'print the diagnostic report as JSON')
    .option('--strict', 'treat warnings as failures')
    .option('--skip-docker', 'skip Docker and Docker Compose checks')
    .action(async (options: DoctorCliOptions) => {
      const report = await runDoctor({
        ...(options.strict === undefined ? {} : { strict: options.strict }),
        ...(options.skipDocker === undefined ? {} : { skipDocker: options.skipDocker }),
      });

      if (options.json === true) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatDoctorReport(report));
      }

      if (report.exitCode !== 0) {
        process.exitCode = report.exitCode;
      }
    });
}

type DoctorCliOptions = {
  json?: boolean;
  strict?: boolean;
  skipDocker?: boolean;
};
