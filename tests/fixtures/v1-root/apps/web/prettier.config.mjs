import baseConfig from "@repo/prettier-config";

const config = {
  ...baseConfig,
  plugins: ["prettier-plugin-tailwindcss"],
};

export default config;