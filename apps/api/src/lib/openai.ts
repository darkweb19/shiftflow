import OpenAI from "openai";
import { getEnv } from "../config";

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });
  }
  return _client;
}
