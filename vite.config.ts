import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    build: {
      outDir: "dist", // নিশ্চিত করুন আউটপুট ডিরেক্টরি 'dist'
    },
    // যদি আপনার অ্যাপটি সাব-ডিরেক্টরিতে থাকে তবে base দিন, নাহলে '/' রাখুন
    base: "/", 
  },
});