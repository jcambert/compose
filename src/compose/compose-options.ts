export type ComposeCommandOptions = {
  detach?: boolean;
  removeOrphans?: boolean;
  volumes?: boolean;
  build?: boolean;
  noCache?: boolean;
  pull?: boolean;
  follow?: boolean;
  tail?: string;
  scale?: string[];
  rm?: boolean;
  env?: string[];
  user?: string;
  workdir?: string;
  projectName?: string;
  profile?: string[];
  dryRun?: boolean;
  noAnsi?: boolean;
};
