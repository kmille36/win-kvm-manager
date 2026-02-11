import { z } from 'zod';
import { insertVmSchema, vms } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  stats: {
    host: {
      method: 'GET' as const,
      path: '/api/stats/host' as const,
      responses: {
        200: z.object({
          cpu: z.object({
            cores: z.number(),
            usagePercent: z.number(),
            model: z.string(),
          }),
          mem: z.object({
            total: z.number(),
            free: z.number(),
            used: z.number(),
            usedPercent: z.number(),
          }),
          disk: z.object({
            total: z.number(),
            used: z.number(),
            free: z.number(),
            usedPercent: z.number(),
          }),
          uptime: z.number(),
          platform: z.string(),
        }),
      },
    },
  },
  vms: {
    list: {
      method: 'GET' as const,
      path: '/api/vms' as const,
      responses: {
        200: z.array(z.custom<typeof vms.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/vms/:id' as const,
      responses: {
        200: z.custom<typeof vms.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/vms' as const,
      input: insertVmSchema,
      responses: {
        201: z.custom<typeof vms.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/vms/:id' as const,
      input: insertVmSchema.partial(),
      responses: {
        200: z.custom<typeof vms.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/vms/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    action: {
      method: 'POST' as const,
      path: '/api/vms/:id/action' as const,
      input: z.object({
        action: z.enum(['start', 'stop', 'restart']),
      }),
      responses: {
        200: z.custom<typeof vms.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  system: {
    paths: {
      method: 'GET' as const,
      path: '/api/system/paths' as const,
      responses: {
        200: z.array(z.string()),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
