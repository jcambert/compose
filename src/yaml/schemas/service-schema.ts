import { z } from 'zod';

const unknownRecordSchema = z.record(z.string(), z.unknown());
const environmentValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const composeServiceSchema = z
  .object({
    image: z.string().optional(),
    build: z.union([z.string(), unknownRecordSchema]).optional(),
    command: z.union([z.string(), z.array(z.string())]).optional(),
    ports: z.array(z.union([z.string(), z.number(), unknownRecordSchema])).optional(),
    volumes: z.array(z.union([z.string(), unknownRecordSchema])).optional(),
    environment: z.union([z.record(z.string(), environmentValueSchema), z.array(z.string())]).optional(),
    depends_on: z.union([z.array(z.string()), unknownRecordSchema]).optional(),
    networks: z.union([z.array(z.string()), unknownRecordSchema]).optional(),
    deploy: unknownRecordSchema.optional(),
    restart: z.string().optional(),
    labels: z.union([z.array(z.string()), z.record(z.string(), z.string())]).optional(),
  })
  .catchall(z.unknown());

export type ComposeService = z.infer<typeof composeServiceSchema>;
