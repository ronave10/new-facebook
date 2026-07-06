import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dfe9ff",
          200: "#c5d7fe",
          300: "#a2bcfc",
          400: "#7d97f8",
          500: "#5d72f1",
          600: "#4450e5",
          700: "#3840ca",
          800: "#3038a3",
          900: "#2d3581",
          950: "#1b1e4b"
        },
        surface: {
          DEFAULT: "#f8fafc",
          card: "#ffffff",
          sidebar: "#0f172a"
        }
      },
      fontFamily: {
        sans: ["Heebo", "Noto Sans Hebrew", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
