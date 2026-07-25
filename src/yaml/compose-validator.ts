import { composeDocumentSchema, type ComposeDocument } from './schemas/compose-schema.js';

export type ComposeValidationResult =
  | {
      success: true;
      document: ComposeDocument;
      errors: [];
    }
  | {
      success: false;
      document?: never;
      errors: string[];
    };

export function validateComposeDocument(value: unknown): ComposeValidationResult {
  const result = composeDocumentSchema.safeParse(value);

  if (result.success) {
    return {
      success: true,
      document: result.data,
      errors: [],
    };
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  };
}
