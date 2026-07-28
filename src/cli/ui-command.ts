import type { Command } from 'commander';
import { startLocalUiServer } from '../app/ui-server-service.js';

export function registerUiCommand(program: Command): void {
  program
    .command('ui')
    .description('Start the optional local compose UI server.')
    .option('--port <port>', 'local UI server port, use 0 to select a free port', parsePort, 0)
    .option('--workspace <name>', 'workspace name to use as the default UI context')
    .option('--skip-docker', 'skip Docker checks in the initial doctor endpoint')
    .option('--no-open', 'do not open the browser automatically')
    .action(async (options: UiCommandOptions) => {
      const uiServer = await startLocalUiServer({
        port: options.port,
        ...(options.open === undefined ? {} : { open: options.open }),
        ...(options.workspace === undefined ? {} : { workspaceName: options.workspace }),
        ...(options.skipDocker === undefined ? {} : { skipDocker: options.skipDocker }),
      });

      console.log(`Compose UI: ${uiServer.url}`);
      console.log(`Local-only bind: ${uiServer.host}:${uiServer.port}`);
      console.log('Press Ctrl+C to stop.');

      await waitForShutdown(async () => {
        await uiServer.close();
        console.log('\nCompose UI stopped.');
      });
    });
}

function parsePort(value: string): number {
  const parsedValue = Number.parseInt(value, 10);

  if (Number.isNaN(parsedValue) || parsedValue < 0 || parsedValue > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }

  return parsedValue;
}

async function waitForShutdown(stop: () => Promise<void>): Promise<void> {
  await new Promise<void>((resolve) => {
    let stopping = false;
    const stopOnce = () => {
      if (stopping) {
        return;
      }

      stopping = true;
      void stop().finally(resolve);
    };

    process.once('SIGINT', stopOnce);
    process.once('SIGTERM', stopOnce);
  });
}

type UiCommandOptions = {
  port: number;
  workspace?: string;
  skipDocker?: boolean;
  open?: boolean;
};
