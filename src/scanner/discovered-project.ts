export type DiscoveredComposeProject = {
  id: string;
  name: string;
  composeFilePath: string;
  directoryPath: string;
  relativePath: string;
  services: string[];
  warnings: string[];
};
