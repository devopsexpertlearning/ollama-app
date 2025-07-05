declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_OLLAMA_URL: string;
      EXPO_PUBLIC_OPENAI_API_KEY: string;
      EXPO_PUBLIC_ANTHROPIC_API_KEY: string;
    }
  }
}

export {};