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

ENV NODE_ENV=production
ENV PERSONA_PATH=/content/prompts/persona.md
ENV REMINDER_PATH=/content/prompts/reminder.md
ENV KNOWLEDGE_PATH=/content/knowledge
ENV PUBLIC_PATH=/content/public

USER node
EXPOSE 3000

CMD ["node", "src/server.js"]
