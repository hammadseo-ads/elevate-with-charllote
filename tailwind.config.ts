import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy:  "#123555",
        teal:  "#6BBAB5",
        coral: "#F5A5B8",
        mint:  "#F2FCFF",
        cream: "#F7FBFC",
        ink:   "#123555",
        muted: "#5F7D8A",
      },
    },
  },
  plugins: [],
};
export default config;
