import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

export async function getAllPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  return posts.sort((a, b) => +new Date(b.data.pubDate) - +new Date(a.data.pubDate));
}

export function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}. ${mm}. ${dd}`;
}

export function getPostUrl(post: Post): string {
  return `/post/${post.slug}/`;
}

export function normalizeCategories(input: unknown): string[] {
  // Accept:
  // - "Programming" (string)
  // - ["Programming", "Python"] (array)
  // - ["Programming/Python"] (array with slashes)
  if (!input) return [];
  if (typeof input === 'string') {
    return input.split('/').map(s => s.trim()).filter(Boolean);
  }
  if (Array.isArray(input)) {
    // Flatten "A/B" into ["A","B"] while preserving ["A","B"].
    const out: string[] = [];
    for (const v of input) {
      if (typeof v === 'string') out.push(...v.split('/').map(s => s.trim()).filter(Boolean));
    }
    return out;
  }
  return [];
}

export type CategoryNode = {
  name: string;
  path: string;   // e.g. "Programming/Python"
  count: number;
  children: CategoryNode[];
};

export function buildCategoryTree(posts: Post[]): CategoryNode[] {
  const root = new Map<string, any>(); // internal tree

  const add = (segments: string[]) => {
    let cur = root;
    let pathAcc: string[] = [];
    for (const seg of segments) {
      pathAcc.push(seg);
      const key = seg;
      if (!cur.has(key)) {
        cur.set(key, { name: seg, path: pathAcc.join('/'), count: 0, children: new Map<string, any>() });
      }
      const node = cur.get(key);
      node.count += 1;
      cur = node.children;
    }
  };

  for (const p of posts) {
    const cats = normalizeCategories(p.data.categories);
    if (cats.length) add(cats);
  }

  const toArray = (m: Map<string, any>): CategoryNode[] => {
    return Array.from(m.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .map((n) => ({
        name: n.name,
        path: n.path,
        count: n.count,
        children: toArray(n.children),
      }));
  };

  return toArray(root);
}

export function collectTags(posts: Post[]): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  for (const p of posts) {
    for (const t of (p.data.tags ?? [])) {
      const key = String(t).trim();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
