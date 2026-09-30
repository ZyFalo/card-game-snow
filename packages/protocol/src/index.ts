import { z } from 'zod';

/*
 * Protocolo entre el cliente y el servidor (D-53). Cada entrada de la API y cada mensaje del juego
 * se valida con estos esquemas en los dos lados. Crece con cada paso del M7: cuentas y progreso.
 */

/** Códigos de error de la API. El cliente decide el texto; el servidor nunca manda mensajes para la persona. */
export const errorCodeSchema = z.enum(['bad_request', 'not_found', 'internal', 'db_unavailable']);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({ error: z.object({ code: errorCodeSchema }) });
export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiError = (code: ErrorCode): ApiError => ({ error: { code } });

/** `GET /api/health`: el servidor responde y llega a la base de datos. */
export const healthSchema = z.object({ ok: z.literal(true), db: z.literal('ok') });
export type Health = z.infer<typeof healthSchema>;
