function firstEnv(names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export function resolveInterviewApiKey(override?: string): string {
  return String(
    override?.trim() ||
      firstEnv(['INTERVIEW_API_KEY', 'DASHSCOPE_API_KEY', 'OPENAI_API_KEY']),
  ).trim();
}

export function resolveInterviewBaseUrl(
  override?: string,
  fallback = 'https://api.openai.com/v1',
): string {
  return normalizeBaseUrl(
    override?.trim() ||
      firstEnv(['INTERVIEW_BASE_URL', 'DASHSCOPE_BASE_URL', 'OPENAI_BASE_URL']) ||
      fallback,
  );
}

export function resolveInterviewModel(
  override?: string,
  fallback = 'gpt-4o-mini',
): string {
  return String(
    override?.trim() ||
      firstEnv(['INTERVIEW_MODEL', 'DASHSCOPE_MODEL', 'OPENAI_MODEL']) ||
      fallback,
  ).trim();
}

export function isDashScopeCompatibleBaseUrl(baseUrl: string): boolean {
  const normalized = baseUrl.toLowerCase();
  return (
    normalized.includes('dashscope.aliyuncs.com/compatible-mode') ||
    normalized.includes('.maas.aliyuncs.com/compatible-mode')
  );
}

export function resolveInterviewEnableThinking(
  baseUrl: string,
): boolean | undefined {
  const explicit = firstEnv([
    'INTERVIEW_ENABLE_THINKING',
    'INTERVIEW_LLM_ENABLE_THINKING',
    'DASHSCOPE_ENABLE_THINKING',
  ]);
  const parsed = parseBoolean(explicit);
  if (parsed !== undefined) return parsed;

  // Deep Interview 的所有 LLM 调用都要求结构化 JSON。百炼 thinking mode
  // 与 response_format=json_object 不能直接混用，因此兼容接口默认关闭 thinking。
  return isDashScopeCompatibleBaseUrl(baseUrl) ? false : undefined;
}

