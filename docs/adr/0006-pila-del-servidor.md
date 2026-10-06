# ADR 0006 · Pila del servidor: Fastify, Drizzle, Zod y Argon2id

- Estado: aceptada (D-51 a D-54) · Fecha: 2026-09-30

## Contexto
El PRD de v2 pide un servidor Node autoritativo en el monorepo (`apps/server`). Ese servidor sirve el juego, una API HTTP para cuentas y progreso, y las partidas por WebSocket, todo en el mismo origen y con una cookie de sesión. Detrás hay un Postgres, y las migraciones viven en el repositorio. Cada mensaje se valida con un esquema y las contraseñas se guardan con Argon2id. El PRD dejó la elección de las herramientas para el comienzo del M7.

## Decisión
- **Fastify (D-51)** para HTTP y WebSocket. Tiene tipos de TypeScript y plugins oficiales para lo que pide el PRD: `@fastify/websocket` (sobre `ws`), `@fastify/cookie`, `@fastify/rate-limit` y `@fastify/static` para servir el cliente. El WebSocket comparte el servidor y la cookie con la API.
- **Drizzle con drizzle-kit (D-52)** para Postgres. El esquema se escribe en TypeScript y las consultas quedan tipadas y cerca del SQL. drizzle-kit genera cada migración como un archivo SQL versionado en el repositorio, y se aplican al desplegar. Las restricciones del modelo se expresan tal cual, como la clave única de `coin_ledger` por (user_id, match_id, round) con `onConflictDoNothing`.
- **Zod (D-53)** para validar. Los esquemas viven en `packages/protocol` y de ellos salen los tipos del cliente y del servidor, así los dos no se desalinean. El servidor valida cada mensaje del WebSocket y cada entrada de la API antes de tocar el motor o la base de datos.
- **@node-rs/argon2 (D-54)** para las contraseñas con Argon2id. Trae binarios precompilados para Linux (glibc y musl), macOS y Windows, así que la imagen de Docker no necesita compiladores. Los parámetros siguen la recomendación de OWASP para Argon2id.

## Alternativas descartadas
| Opción | Por qué no |
|---|---|
| Express 5 | Menos tipado y sin plugins oficiales para WebSocket y límites; habría que armar más a mano |
| Hono | Muy bueno en el borde de la red, pero en Node su WebSocket y su ecosistema de cookies y límites son menos maduros que los de Fastify |
| NestJS | Demasiada estructura para un proyecto pequeño con un solo servidor |
| Colyseus | Ya descartado en el §11.2 del PRD: el motor de reglas existe y las salas son simples |
| Kysely | Buen constructor de consultas, pero sin esquema declarativo: las migraciones se escriben a mano |
| Prisma | Motor aparte y cliente generado: imagen más pesada y menos control del SQL |
| Valibot o TypeBox | Válidos; Zod es el más conocido y el que mejor documentado está para compartir tipos entre cliente y servidor |
| `argon2` (node-gyp) o bcrypt | El primero puede necesitar compilar en la imagen; bcrypt no es Argon2id, que es lo que pide el PRD |

## Consecuencias
- El cliente importa `packages/protocol`, así que Zod entra en su paquete; para lo que pesa el juego es poco.
- Las versiones se fijan exactas, como en el resto del monorepo, al instalarlas en el PR del esqueleto del servidor.
- Cambiar el esquema de la base implica generar una migración con drizzle-kit y subirla junto con el cambio.
