FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PERSONA_PATH=/content/prompts/persona.md
ENV REMINDER_PATH=/content/prompts/reminder.md
ENV KNOWLEDGE_PATH=/content/knowledge
ENV PUBLIC_PATH=/content/public

USER node
EXPOSE 3000

CMD ["node", "src/server.js"]
