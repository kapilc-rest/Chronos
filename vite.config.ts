import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

function preservePwaAssets() {
  return {
    name: 'preserve-pwa-assets',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      return html
        .replace(/href="[^"]*manifest[^"]*\.json"/g, 'href="./manifest.json"')
        .replace(/href="[^"]*icon[^"]*\.svg"/g, 'href="./icon.svg"')
        .replace(/href="[^"]*apple-touch-icon[^"]*\.png"/g, 'href="./apple-touch-icon.png"');
    },
    closeBundle() {
      try {
        const distDir = path.resolve(import.meta.dirname, 'dist');
        const assetsDir = path.resolve(distDir, 'assets');
        const filesToMirror = ['icon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'apple-touch-icon.png', 'manifest.json'];
        for (const file of filesToMirror) {
          const srcPath = path.resolve(distDir, file);
          const destPath = path.resolve(assetsDir, file);
          if (fs.existsSync(srcPath) && fs.existsSync(assetsDir)) {
            fs.copyFileSync(srcPath, destPath);
          }
        }
        // Ensure dist/index.html uses clean unhashed ./manifest.json and ./icon.svg
        const indexPath = path.resolve(distDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          let html = fs.readFileSync(indexPath, 'utf-8');
          html = html
            .replace(/href="[^"]*manifest[^"]*\.json"/g, 'href="./manifest.json"')
            .replace(/href="[^"]*icon[^"]*\.svg"/g, 'href="./icon.svg"')
            .replace(/href="[^"]*apple-touch-icon[^"]*\.png"/g, 'href="./apple-touch-icon.png"');
          fs.writeFileSync(indexPath, html, 'utf-8');
        }
      } catch {
        // Silently continue
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), preservePwaAssets()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
