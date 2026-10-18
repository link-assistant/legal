FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY scripts/bootstrap-formal-ai.mjs scripts/bootstrap-formal-ai.mjs
COPY patches/ patches/
RUN node scripts/bootstrap-formal-ai.mjs

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /app/src/generated ./src/generated
COPY --chown=node:node package.json ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node bin/ ./bin/
COPY --chown=node:node data/demo/ ./data/demo/
COPY --chown=node:node docs/openapi.json ./docs/openapi.json
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "bin/legal-assistant.js"]
CMD ["serve", "--host", "0.0.0.0", "--port", "8787"]
