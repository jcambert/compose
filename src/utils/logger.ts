export type Logger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export const consoleLogger: Logger = {
  info(message: string): void {
    console.log(message);
  },
  warn(message: string): void {
    console.warn(message);
  },
  error(message: string): void {
    console.error(message);
  },
};
