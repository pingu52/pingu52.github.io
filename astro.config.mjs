import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://pingu52.github.io',
  // NOTE: This repo is <username>.github.io so you do NOT need `base`.
  // If you later deploy to a repo like https://<user>.github.io/<repo>/ then set:
  // base: '/<repo>',
  markdown: {
    shikiConfig: {
      theme: 'github-dark'
    }
  }
});
