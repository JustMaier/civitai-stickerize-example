import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Cache for loaded prompts
const promptCache = new Map<string, string>();

/**
 * Load a prompt template from a markdown file
 * Strips markdown headers and code blocks, returns the content
 */
export function loadPrompt(filename: string): string {
  if (promptCache.has(filename)) {
    return promptCache.get(filename)!;
  }

  // In SvelteKit, we need to read from the source location
  const promptPath = join(process.cwd(), 'src/lib/server/prompts', filename);

  try {
    let content = readFileSync(promptPath, 'utf-8');

    // Remove the title header (first # line)
    content = content.replace(/^#\s+.*\n+/, '');

    // Remove markdown code block markers but keep content
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    // Trim whitespace
    content = content.trim();

    promptCache.set(filename, content);
    return content;
  } catch (error) {
    console.error(`Failed to load prompt: ${filename}`, error);
    throw new Error(`Prompt file not found: ${filename}`);
  }
}

/**
 * Replace template variables in a prompt
 * Variables are in the format {{variableName}}
 */
export function fillPrompt(template: string, variables: Record<string, string>): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  }

  return result;
}

/**
 * Load and fill a prompt template in one step
 */
export function getPrompt(filename: string, variables: Record<string, string> = {}): string {
  const template = loadPrompt(filename);
  return fillPrompt(template, variables);
}

/**
 * Clear the prompt cache (useful for development hot reloading)
 */
export function clearPromptCache(): void {
  promptCache.clear();
}
