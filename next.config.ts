import type { NextConfig } from "next";

const config: NextConfig = {
  // The RAG manuals are read from disk at request time, so ship them with the function.
  outputFileTracingIncludes: { "/api/analyze": ["./data/manuals/**/*"] },
};

export default config;
