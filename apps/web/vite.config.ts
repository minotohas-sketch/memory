import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // utile pour tester depuis le téléphone via un tunnel (ngrok/cloudflared) en dev
    host: true,
  },
});
