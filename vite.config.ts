import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    base: './', // অনেক সময় Vercel-এ রিলেটিভ পাথ দরকার হয়
    build: {
      outDir: 'dist',
    }
  },
});