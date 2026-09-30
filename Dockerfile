# Imagen única de Ventisca: el servidor sirve el juego, la API y las partidas (D-37).
# Se construye desde la raíz del monorepo: docker build -t ventisca .

FROM node:22-slim AS build
WORKDIR /repo
RUN npm install -g pnpm@12.8.1
# Primero solo los manifiestos, para que la capa de dependencias se reutilice entre builds.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/core/package.json packages/core/
COPY packages/protocol/package.json packages/protocol/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @ventisca/web build && pnpm --filter @ventisca/server build

# La imagen final solo lleva lo que se ejecuta: el servidor empaquetado, sus migraciones y el cliente.
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /srv
COPY --from=build /repo/apps/server/dist apps/server/dist
COPY --from=build /repo/apps/server/drizzle apps/server/drizzle
COPY --from=build /repo/apps/web/dist apps/web/dist
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "apps/server/dist/server.mjs"]
