import fs from 'node:fs/promises';
import path from 'node:path';

async function readMarkdownTree(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readMarkdownTree(fullPath)));
    } else if (entry.name.endsWith('.md')) {
      files.push({ name: entry.name, content: await fs.readFile(fullPath, 'utf8') });
    }
  }

  return files;
}

export async function loadKnowledge({ personaPath, reminderPath, knowledgePath }) {
  const [persona, reminder, documents] = await Promise.all([
    fs.readFile(personaPath, 'utf8'),
    fs.readFile(reminderPath, 'utf8'),
    readMarkdownTree(knowledgePath)
  ]);

  if (documents.length === 0) {
    throw new Error(`No markdown files found in ${knowledgePath}`);
  }

  return {
    persona: persona.trim(),
    reminder: reminder.trim(),
    documents,
    facts: documents.map((doc) => doc.content.trim()).join('\n\n---\n\n')
  };
}
