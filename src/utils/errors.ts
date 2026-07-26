export class ComposeError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ComposeError';
  }
}

export class ComposeYamlError extends ComposeError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ComposeYamlError';
  }
}

export class ComposeProjectError extends ComposeError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ComposeProjectError';
  }
}
