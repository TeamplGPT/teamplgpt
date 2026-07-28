/**
 * A service that provides an AI client to create a completion.
 */

/**
 * @typedef {Object} LangChainModelConfig
 * @property {(string|null)} baseURL - Override the default base URL process.env for this provider
 * @property {(string|null)} apiKey - Override the default process.env for this provider
 * @property {(number|null)} temperature - Override the default temperature
 * @property {(string|null)} model -  Overrides model used for provider.
 */

const { v4 } = require("uuid");
const { ChatOpenAI } = require("@langchain/openai");
const { ChatAnthropic } = require("@langchain/anthropic");
const { ChatCohere } = require("@langchain/cohere");
const { ChatOllama } = require("@langchain/community/chat_models/ollama");
const { toValidNumber, safeJsonParse } = require("../../../http");
const { getLLMProviderClass } = require("../../../helpers");
const { parseLMStudioBasePath } = require("../../../AiProviders/lmStudio");
const { parseFoundryBasePath } = require("../../../AiProviders/foundry");
const {
  SystemPromptVariables,
} = require("../../../../models/systemPromptVariables");
const {
  createBedrockChatClient,
} = require("../../../AiProviders/bedrock/utils");

const DEFAULT_WORKSPACE_PROMPT =
  "You are a helpful ai assistant who can assist the user and use tools available to help answer the users prompts and questions.";

class Provider {
  _client;

  /**
   * The invocation object containing the user ID and other invocation details.
   * @type {import("@prisma/client").workspace_agent_invocations}
   */
  invocation = {};

  /**
   * The user ID for the chat completion to send to the LLM provider for user tracking.
   * In order for this to be set, the handler props must be attached to the provider after instantiation.
   * ex: this.attachHandlerProps({ ..., invocation: { ..., user_id: 123 } });
   * eg: `user_123`
   * @type {string}
   */
  executingUserId = "";

  constructor(client) {
    if (this.constructor == Provider) {
      return;
    }
    this._client = client;
  }

  providerLog(text, ...args) {
    console.log(
      `\x1b[36m[AgentLLM${this?.model ? ` - ${this.model}` : ""}]\x1b[0m ${text}`,
      ...args
    );
  }

  /**
   * Attaches handler props to the provider for reuse in the provider.
   * - Explicitly sets the invocation object.
   * - Explicitly sets the executing user ID from the invocation object.
   * @param {Object} handlerProps - The handler props to attach to the provider.
   */
  attachHandlerProps(handlerProps = {}) {
    this.invocation = handlerProps?.invocation || {};
    this.executingUserId = this.invocation?.user_id
      ? `user_${this.invocation.user_id}`
      : "";
  }

  get client() {
    return this._client;
  }

  /**
   *
   * @param {string} provider - the string key of the provider LLM being loaded.
   * @param {LangChainModelConfig} config - Config to be used to override default connection object.
   * @returns
   */
  static LangChainChatModel(provider = "openai", config = {}) {
    switch (provider) {
      // Cloud models
      case "openai":
        return new ChatOpenAI({
          apiKey: process.env.OPEN_AI_KEY,
          ...config,
        });
      case "anthropic":
        return new ChatAnthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
          ...config,
        });
      case "groq":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.groq.com/openai/v1",
          },
          apiKey: process.env.GROQ_API_KEY,
          ...config,
        });
      case "mistral":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.mistral.ai/v1",
          },
          apiKey: process.env.MISTRAL_API_KEY ?? null,
          ...config,
        });
      case "openrouter":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: {
              "HTTP-Referer": "https://anythingllm.com",
              "X-Title": "AnythingLLM",
            },
          },
          apiKey: process.env.OPENROUTER_API_KEY ?? null,
          ...config,
        });
      case "perplexity":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.perplexity.ai",
          },
          apiKey: process.env.PERPLEXITY_API_KEY ?? null,
          ...config,
        });
      case "togetherai":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.together.xyz/v1",
          },
          apiKey: process.env.TOGETHER_AI_API_KEY ?? null,
          ...config,
        });
      case "generic-openai":
        return new ChatOpenAI({
          configuration: {
            baseURL: process.env.GENERIC_OPEN_AI_BASE_PATH,
          },
          apiKey: process.env.GENERIC_OPEN_AI_API_KEY,
          maxTokens: toValidNumber(
            process.env.GENERIC_OPEN_AI_MAX_TOKENS,
            1024
          ),
          ...config,
        });
      case "bedrock":
        return createBedrockChatClient(config);
      case "fireworksai":
        return new ChatOpenAI({
          apiKey: process.env.FIREWORKS_AI_LLM_API_KEY,
          ...config,
        });
      case "apipie":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://apipie.ai/v1",
          },
          apiKey: process.env.APIPIE_LLM_API_KEY ?? null,
          ...config,
        });
      case "deepseek":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.deepseek.com/v1",
          },
          apiKey: process.env.DEEPSEEK_API_KEY ?? null,
          ...config,
        });
      case "xai":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.x.ai/v1",
          },
          apiKey: process.env.XAI_LLM_API_KEY ?? null,
          ...config,
        });
      case "zai":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.z.ai/api/paas/v4",
          },
          apiKey: process.env.ZAI_API_KEY ?? null,
          ...config,
        });
      case "novita":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.novita.ai/v3/openai",
          },
          apiKey: process.env.NOVITA_LLM_API_KEY ?? null,
          ...config,
        });
      case "ppio":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.ppinfra.com/v3/openai",
          },
          apiKey: process.env.PPIO_API_KEY ?? null,
          ...config,
        });
      case "gemini":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
          },
          apiKey: process.env.GEMINI_API_KEY ?? null,
          ...config,
        });
      case "moonshotai":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.moonshot.ai/v1",
          },
          apiKey: process.env.MOONSHOT_AI_API_KEY ?? null,
          ...config,
        });
      case "cometapi":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://api.cometapi.com/v1",
          },
          apiKey: process.env.COMETAPI_LLM_API_KEY ?? null,
          ...config,
        });
      case "giteeai":
        return new ChatOpenAI({
          configuration: {
            baseURL: "https://ai.gitee.com/v1",
          },
          apiKey: process.env.GITEE_AI_API_KEY ?? null,
          ...config,
        });
      case "cohere":
        return new ChatCohere({
          apiKey: process.env.COHERE_API_KEY ?? null,
          ...config,
        });
      // OSS Model Runners
      // case "anythingllm_ollama":
      //   return new ChatOllama({
      //     baseUrl: process.env.PLACEHOLDER,
      //     ...config,
      //   });
      case "ollama":
        return new ChatOllama({
          baseUrl: process.env.OLLAMA_BASE_PATH,
          ...config,
        });
      case "lmstudio":
        return new ChatOpenAI({
          configuration: {
            baseURL: parseLMStudioBasePath(process.env.LMSTUDIO_BASE_PATH),
          },
          apiKey: "not-used", // Needs to be specified or else will assume OpenAI
          ...config,
        });
      case "koboldcpp":
        return new ChatOpenAI({
          configuration: {
            baseURL: process.env.KOBOLD_CPP_BASE_PATH,
          },
          apiKey: "not-used",
          ...config,
        });
      case "localai":
        return new ChatOpenAI({
          configuration: {
            baseURL: process.env.LOCAL_AI_BASE_PATH,
          },
          apiKey: process.env.LOCAL_AI_API_KEY ?? "not-used",
          ...config,
        });
      case "textgenwebui":
        return new ChatOpenAI({
          configuration: {
            baseURL: process.env.TEXT_GEN_WEB_UI_BASE_PATH,
          },
          apiKey: process.env.TEXT_GEN_WEB_UI_API_KEY ?? "not-used",
          ...config,
        });
      case "litellm":
        return new ChatOpenAI({
          configuration: {
            baseURL: process.env.LITE_LLM_BASE_PATH,
          },
          apiKey: process.env.LITE_LLM_API_KEY ?? null,
          ...config,
        });
      case "nvidia-nim":
        return new ChatOpenAI({
          configuration: {
            baseURL: process.env.NVIDIA_NIM_LLM_BASE_PATH,
          },
          apiKey: null,
          ...config,
        });
      case "foundry": {
        return new ChatOpenAI({
          configuration: {
            baseURL: parseFoundryBasePath(process.env.FOUNDRY_BASE_PATH),
          },
          apiKey: null,
          ...config,
        });
      }
      default:
        throw new Error(`Unsupported provider ${provider} for this task.`);
    }
  }

  /**
   * Get the context limit for a provider/model combination using static method in AIProvider class.
   * @param {string} provider
   * @param {string} modelName
   * @returns {number}
   */
  static contextLimit(provider = "openai", modelName) {
    const llm = getLLMProviderClass({ provider });
    if (!llm || !llm.hasOwnProperty("promptWindowLimit")) return 8_000;
    return llm.promptWindowLimit(modelName);
  }

  static defaultSystemPromptForProvider(provider = null) {
    switch (provider) {
      case "lmstudio":
        return "You are a helpful ai assistant who can assist the user and use tools available to help answer the users prompts and questions. Tools will be handled by another assistant and you will simply receive their responses to help answer the user prompt - always try to answer the user's prompt the best you can with the context available to you and your general knowledge.";
      default:
        return DEFAULT_WORKSPACE_PROMPT;
    }
  }

  /**
   * Get the system prompt for a provider.
   * @param {string} provider
   * @param {import("@prisma/client").workspaces | null} workspace
   * @param {import("@prisma/client").users | null} user
   * @returns {Promise<string>}
   */
  static async systemPrompt({
    provider = null,
    workspace = null,
    user = null,
  }) {
    const base = !workspace?.openAiPrompt
      ? Provider.defaultSystemPromptForProvider(provider)
      : await SystemPromptVariables.expandSystemPromptVariables(
          workspace.openAiPrompt,
          user?.id || null,
          workspace.id
        );
    const hrGuard = Provider.hrSkillPeriodGuard();
    return hrGuard ? `${base}\n\n${hrGuard}` : base;
  }

  /**
   * Returns HR skill period-parameter strict directive when any HR skill
   * (hr-attendance/hr-salary/hr-personnel/hr-year-end-tax) is active.
   * Injected into Provider.systemPrompt() to prevent the LLM from asking
   * users to clarify omitted year/base_date — server applies defaults.
   * See docs/conventions/hr-skill-description-pattern.md §Location E.
   * @returns {string|null}
   */
  static hrSkillPeriodGuard() {
    const ImportedPlugin = require("../../imported");
    const active = ImportedPlugin.activeImportedPlugins();
    const hrActive = active.some((name) => name.startsWith("@@hr-"));
    if (!hrActive) return null;
    const now = new Date();
    const todayIso = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
    }).format(now);
    const todayWeekday = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      weekday: "short",
    }).format(now);
    return [
      `[HR_DATE_CONTEXT] 오늘 날짜: ${todayIso} (${todayWeekday}). '오늘'·'어제'·'이번 주' 등 상대 날짜 표현은 이 날짜 기준으로 해석하고, 조회 결과 표에서 특정 일자 행을 찾을 때도 이 날짜를 사용하세요. 표의 첫 행이나 임의 행을 오늘로 간주하지 마세요. 오늘 일자 행이 없으면 없다고 답하세요.`,
      "[HR_PERIOD_PARAM_STRICT]",
      "HR skill(hr-attendance/hr-salary/hr-personnel/hr-year-end-tax)의 주기 파라미터(year, year_month, base_date, cal_yy, current_month, previous_month)는 사용자 발화에 연도·월·기준일이 명시되지 않아도 절대 되묻지 마세요.",
      "파라미터가 불명확하면 해당 파라미터를 생략하고 즉시 tool_call을 실행하세요. 서버가 기본값(현재 연도/연월 등)을 자동 적용합니다.",
      "'연도를 알려주십시오'·'기준일을 알려주십시오'·'어느 것으로 진행할까요' 같은 확인 질문을 생성하지 마세요.",
      "[ORDER] HR skill 대상 요청이면 응답의 첫 액션은 반드시 tool_call이어야 합니다. '조회 결과 안내'·'질문 요지'·'요청:' 같은 요약·정리·안내 텍스트를 tool_call보다 먼저 생성하지 마세요. tool_call 결과를 수신한 후에만 텍스트 응답을 작성하세요.",
      "[EXAMPLES] '3월 출퇴근' → 즉시 hr-attendance(query_type='timesheet', year_month='3'). '다음주 업무계획' → 즉시 hr-attendance(query_type='work_plan_weekly', base_date='다음주'). '어제 근무계획' → 즉시 hr-attendance(query_type='work_plan_weekly', base_date='어제'). '지난달 연장근무' → 즉시 hr-attendance(query_type='overtime', year_month='지난달').",
    ].join("\n");
  }

  /**
   * Whether the provider supports agent streaming.
   * Disabled by default and needs to be explicitly enabled in the provider
   * This is temporary while we migrate all providers to support agent streaming
   * @returns {boolean}
   */
  get supportsAgentStreaming() {
    return false;
  }

  /**
   * Stream a chat completion from the LLM with tool calling
   * Note: This using the OpenAI API format and may need to be adapted for other providers.
   *
   * @param {any[]} messages - The messages to send to the LLM.
   * @param {any[]} functions - The functions to use in the LLM.
   * @param {function} eventHandler - The event handler to use to report stream events.
   * @returns {Promise<{ functionCall: any, textResponse: string }>} - The result of the chat completion.
   */
  async stream(messages, functions = [], eventHandler = null) {
    this.providerLog("Provider.stream - will process this chat completion.");
    const msgUUID = v4();
    const stream = await this.client.chat.completions.create({
      model: this.model,
      stream: true,
      messages,
      ...(Array.isArray(functions) && functions?.length > 0
        ? { functions }
        : {}),
    });

    const result = {
      functionCall: null,
      textResponse: "",
    };

    for await (const chunk of stream) {
      if (!chunk?.choices?.[0]) continue; // Skip if no choices
      const choice = chunk.choices[0];

      if (choice.delta?.content) {
        result.textResponse += choice.delta.content;
        eventHandler?.("reportStreamEvent", {
          type: "textResponseChunk",
          uuid: msgUUID,
          content: choice.delta.content,
        });
      }

      if (choice.delta?.function_call) {
        // accumulate the function call
        if (result.functionCall)
          result.functionCall.arguments += choice.delta.function_call.arguments;
        else result.functionCall = choice.delta.function_call;

        eventHandler?.("reportStreamEvent", {
          uuid: `${msgUUID}:tool_call_invocation`,
          type: "toolCallInvocation",
          content: `Assembling Tool Call: ${result.functionCall.name}(${result.functionCall.arguments})`,
        });
      }
    }

    // If there are arguments, parse them as json so that the tools can use them
    if (!!result.functionCall?.arguments)
      result.functionCall.arguments = safeJsonParse(
        result.functionCall.arguments,
        {}
      );

    return {
      textResponse: result.textResponse,
      functionCall: result.functionCall,
    };
  }
}

module.exports = Provider;
