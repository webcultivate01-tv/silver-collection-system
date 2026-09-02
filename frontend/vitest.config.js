import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Deliberately narrow. The suite targets the logic that decides
      // something - which token a request carries, whether a route opens, what
      // ends up in a downloaded file - not the presentational components,
      // where a snapshot test would cost more to maintain than it catches.
      include: [
        "src/api/**",
        "src/store/**",
        "src/utils/**",
        "src/components/ProtectedRoute.jsx",
        "src/components/EmployeeProtectedRoute.jsx",
        "src/components/UserProtectedRoute.jsx",
      ],
    },
  },
});
