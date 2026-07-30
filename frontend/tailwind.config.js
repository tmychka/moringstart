export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0a0f1e",
        // The single source of truth for the app's accent. Swapping the scheme
        // means changing these two values plus --carousel-dot in index.css.
        accent: "#818cf8",
        "accent-dim": "#4338ca",
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
