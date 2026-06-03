/** OpenAI / DeepSeek function `name` 仅允许 [a-zA-Z0-9_-]，Nexus 工具名使用 domain.action 形式。 */
const OPENAI_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export interface OpenAIToolNameMap {
  readonly toApi: ReadonlyMap<string, string>;
  readonly fromApi: ReadonlyMap<string, string>;
}

/**
 * 将 Nexus 工具名编码为 OpenAI 兼容 function name（`.` → `_`）。
 * @stability S3
 */
export function encodeToolNameForOpenAI(name: string): string {
  if (OPENAI_TOOL_NAME_PATTERN.test(name)) {
    return name;
  }
  return name.replace(/\./g, '_');
}

/**
 * 根据本次请求的工具列表构建双向映射，用于请求编码与流式响应解码。
 * @stability S3
 */
export function buildOpenAIToolNameMap(
  tools: readonly { readonly name: string }[],
): OpenAIToolNameMap {
  const toApi = new Map<string, string>();
  const fromApi = new Map<string, string>();
  for (const tool of tools) {
    const apiName = encodeToolNameForOpenAI(tool.name);
    toApi.set(tool.name, apiName);
    fromApi.set(apiName, tool.name);
  }
  return { toApi, fromApi };
}

/**
 * 将 API 返回的 function name 还原为 Nexus 注册名。
 * @stability S3
 */
export function decodeToolNameFromOpenAI(apiName: string, map: OpenAIToolNameMap): string {
  return map.fromApi.get(apiName) ?? apiName;
}
