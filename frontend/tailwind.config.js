export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0c10",
        // The accent for the handful of components pinned to the dark scheme
        // rather than reading the active palette — see StepsTracker and
        // ManageMetrics. Kept in step with Canvas in src/theme.ts.
        accent: "#9fb0c4",
        "accent-dim": "#566578",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        system: [
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "system-ui",
          "sans-serif",
        ],
      },
      keyframes: {
        rtBlink: {
          "0%, 100%": {
            opacity: "1",
            boxShadow: "0 0 0 0 rgba(37,99,235,.55)",
          },
          "50%": { opacity: ".4", boxShadow: "0 0 0 7px rgba(37,99,235,0)" },
        },
      },
      animation: {
        rtBlink: "rtBlink 1.15s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
