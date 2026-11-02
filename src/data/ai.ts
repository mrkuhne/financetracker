import { base44 } from '@/data/client';

/** One structured LLM call. Callers pass aggregated numbers only, never transactions or notes. */
export async function invokeLlm(prompt: string, schema: object): Promise<unknown> {
  return base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema, model: 'claude-sonnet-5' });
}
