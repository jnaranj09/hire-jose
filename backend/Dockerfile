# Build context is the REPO ROOT, not ./backend — the image has to carry the
# prompts, the knowledge files and the static site, because in Kubernetes
# there are no host mounts to supply them. docker-compose still mounts the
# same paths on top, so local edits show up without a rebuild.
FROM node:20-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev

COPY backend/src ./src

COPY prompts /content/prompts
COPY knowledge /content/knowledge
COPY frontend/public /content/public
COPY frontend/admin /content/admin

# Access tokens are written here at runtime, so it has to be owned by the user
# the process runs as. In Kubernetes a volume is mounted over it, and the pod's
# fsGroup is what makes that one writable.
RUN mkdir -p /content/data && chown node:node /content/data

ENV NODE_ENV=production
ENV PERSONA_PATH=/content/prompts/persona.md
ENV REMINDER_PATH=/content/prompts/reminder.md
ENV KNOWLEDGE_PATH=/content/knowledge
ENV PUBLIC_PATH=/content/public
ENV ADMIN_PATH=/content/admin
ENV TOKEN_STORE_PATH=/content/data/tokens.json

USER node
EXPOSE 3000 3001

CMD ["node", "src/server.js"]
