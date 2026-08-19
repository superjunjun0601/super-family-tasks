import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        family: {
          bg: "#F8F4EC",
          surface: "#FFFDF8",
          text: "#24302F",
          muted: "#66736F",
          border: "#E7DED2",
          primary: "#4F9D8F",
          primarySoft: "#DDEFEA",
          warm: "#F2B56B",
          danger: "#E86F61",
          magic: "#9A7BEA"
        }
      },
      boxShadow: {
        soft: "0 8px 24px rgba(61, 50, 36, 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
