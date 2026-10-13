/** Galería de circuitos de ejemplo (src/examples/*.json, generados con scripts/gen-examples.ts). */
const files = import.meta.glob('./*.json', { eager: true, import: 'default' }) as Record<
  string,
  { name: string; description?: string }
>;

export interface ExampleEntry {
  id: string;
  name: string;
  description: string;
  json: string;
}

export const EXAMPLES: ExampleEntry[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, data]) => ({
    id: path.replace('./', '').replace('.json', ''),
    name: data.name,
    description: data.description ?? '',
    json: JSON.stringify(data),
  }));
