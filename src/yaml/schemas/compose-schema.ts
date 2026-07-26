import { z } from 'zod';
import { composeServiceSchema } from './service-schema.js';

const unknownRecordSchema = z.record(z.string(), z.unknown());

export const composeDocumentSchema = z
  .object({
    name: z.string().optional(),
    services: z.record(z.string(), composeServiceSchema).default({}),
    networks: unknownRecordSchema.optional(),
    volumes: unknownRecordSchema.optional(),
    configs: unknownRecordSchema.optional(),
    secrets: unknownRecordSchema.optional(),
  })
  .catchall(z.unknown());

export type ComposeDocument = z.infer<typeof composeDocumentSchema>;
