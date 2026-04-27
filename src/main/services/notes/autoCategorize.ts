import { focusStore } from '../store';

export async function autoCategorize(text: string): Promise<string | null> {
  const categories = focusStore.get('categories');
  if (categories.length === 0) return null;

  const normalized = text.toLowerCase();
  const match = categories.find(category => {
    const terms = [category.name, category.description]
      .join(' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(term => term.length >= 4);
    return terms.some(term => normalized.includes(term));
  });
  return match?.name ?? null;
}
