import PreLoader from "@/components/Preloader";
import System from "@/models/system";
import AnythingLLMIcon from "@/media/logo/anything-llm-icon.png";
import OpenAiLogo from "@/media/llmprovider/openai.png";
import GenericOpenAiLogo from "@/media/llmprovider/generic-openai.png";
import AzureOpenAiLogo from "@/media/llmprovider/azure.png";
import AnthropicLogo from "@/media/llmprovider/anthropic.png";
import GeminiLogo from "@/media/llmprovider/gemini.png";
import OllamaLogo from "@/media/llmprovider/ollama.png";
import TogetherAILogo from "@/media/llmprovider/togetherai.png";
import FireworksAILogo from "@/media/llmprovider/fireworksai.jpeg";
import NvidiaNimLogo from "@/media/llmprovider/nvidia-nim.png";
import LMStudioLogo from "@/media/llmprovider/lmstudio.png";
import LocalAiLogo from "@/media/llmprovider/localai.png";
import MistralLogo from "@/media/llmprovider/mistral.jpeg";
import HuggingFaceLogo from "@/media/llmprovider/huggingface.png";
import PerplexityLogo from "@/media/llmprovider/perplexity.png";
import OpenRouterLogo from "@/media/llmprovider/openrouter.jpeg";
import NovitaLogo from "@/media/llmprovider/novita.png";
import GroqLogo from "@/media/llmprovider/groq.png";
import KoboldCPPLogo from "@/media/llmprovider/koboldcpp.png";
import TextGenWebUILogo from "@/media/llmprovider/text-generation-webui.png";
import LiteLLMLogo from "@/media/llmprovider/litellm.png";
import AWSBedrockLogo from "@/media/llmprovider/bedrock.png";
import DeepSeekLogo from "@/media/llmprovider/deepseek.png";
import APIPieLogo from "@/media/llmprovider/apipie.png";
import XAILogo from "@/media/llmprovider/xai.png";
import CohereLogo from "@/media/llmprovider/cohere.png";
import ZillizLogo from "@/media/vectordbs/zilliz.png";
import AstraDBLogo from "@/media/vectordbs/astraDB.png";
import ChromaLogo from "@/media/vectordbs/chroma.png";
import PineconeLogo from "@/media/vectordbs/pinecone.png";
import LanceDbLogo from "@/media/vectordbs/lancedb.png";
import WeaviateLogo from "@/media/vectordbs/weaviate.png";
import QDrantLogo from "@/media/vectordbs/qdrant.png";
import MilvusLogo from "@/media/vectordbs/milvus.png";
import VoyageAiLogo from "@/media/embeddingprovider/voyageai.png";
import PPIOLogo from "@/media/llmprovider/ppio.png";
import PGVectorLogo from "@/media/vectordbs/pgvector.png";
import DPAISLogo from "@/media/llmprovider/dpais.png";
import React, { useState, useEffect } from "react";
import paths from "@/utils/paths";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export const LLM_SELECTION_PRIVACY = {
  openai: {
    name: "OpenAI",
    description: ["privacy.llm.description", "privacy.llm.openai.description"],
    logo: OpenAiLogo,
  },
  azure: {
    name: "Azure OpenAI",
    description: ["privacy.llm.description", "privacy.llm.azure.description"],
    logo: AzureOpenAiLogo,
  },
  anthropic: {
    name: "Anthropic",
    description: [
      "privacy.llm.description",
      "privacy.llm.anthropic.description",
    ],
    logo: AnthropicLogo,
  },
  gemini: {
    name: "Google Gemini",
    description: [
      "privacy.llm.gemini.description",
      "privacy.llm.gemini.description2",
    ],
    logo: GeminiLogo,
  },
  "nvidia-nim": {
    name: "NVIDIA NIM",
    description: ["privacy.llm.nvidia_nim.description"],
    logo: NvidiaNimLogo,
  },
  lmstudio: {
    name: "LMStudio",
    description: ["privacy.llm.lmstudio.description"],
    logo: LMStudioLogo,
  },
  localai: {
    name: "LocalAI",
    description: ["privacy.llm.localai.description"],
    logo: LocalAiLogo,
  },
  ollama: {
    name: "Ollama",
    description: ["privacy.llm.ollama.description"],
    logo: OllamaLogo,
  },
  togetherai: {
    name: "TogetherAI",
    description: [
      "privacy.llm.description",
      "privacy.llm.togetherai.description",
    ],
    logo: TogetherAILogo,
  },
  fireworksai: {
    name: "FireworksAI",
    description: [
      "privacy.llm.description",
      "privacy.llm.fireworksai.description",
    ],
    logo: FireworksAILogo,
  },
  mistral: {
    name: "Mistral",
    description: "privacy.llm.mistral.description",
    logo: MistralLogo,
  },
  huggingface: {
    name: "HuggingFace",
    description: "privacy.llm.huggingface.description",
    logo: HuggingFaceLogo,
  },
  perplexity: {
    name: "Perplexity AI",
    description: [
      "privacy.llm.description",
      "privacy.llm.perplexity.description",
    ],
    logo: PerplexityLogo,
  },
  openrouter: {
    name: "OpenRouter",
    description: [
      "privacy.llm.description",
      "privacy.llm.openrouter.description",
    ],
    logo: OpenRouterLogo,
  },
  novita: {
    name: "Novita AI",
    description: ["privacy.llm.description", "privacy.llm.novita.description"],
    logo: NovitaLogo,
  },
  groq: {
    name: "Groq",
    description: ["privacy.llm.description", "privacy.llm.groq.description"],
    logo: GroqLogo,
  },
  koboldcpp: {
    name: "KoboldCPP",
    description: ["privacy.llm.koboldcpp.description"],
    logo: KoboldCPPLogo,
  },
  textgenwebui: {
    name: "Oobabooga Web UI",
    description: ["privacy.llm.textgenwebui.description"],
    logo: TextGenWebUILogo,
  },
  "generic-openai": {
    name: "Generic OpenAI compatible service",
    description: ["privacy.llm.generic_openai.description"],
    logo: GenericOpenAiLogo,
  },
  cohere: {
    name: "Cohere",
    description: ["privacy.llm.cohere.description"],
    logo: CohereLogo,
  },
  litellm: {
    name: "LiteLLM",
    description: ["privacy.llm.litellm.description"],
    logo: LiteLLMLogo,
  },
  bedrock: {
    name: "AWS Bedrock",
    description: ["privacy.llm.bedrock.description"],
    logo: AWSBedrockLogo,
  },
  deepseek: {
    name: "DeepSeek",
    description: ["privacy.llm.deepseek.description"],
    logo: DeepSeekLogo,
  },
  apipie: {
    name: "APIpie.AI",
    description: ["privacy.llm.apipie.description"],
    logo: APIPieLogo,
  },
  xai: {
    name: "xAI",
    description: ["privacy.llm.xai.description"],
    logo: XAILogo,
  },
  ppio: {
    name: "PPIO",
    description: ["privacy.llm.description", "privacy.llm.ppio.description"],
    logo: PPIOLogo,
  },
  dpais: {
    name: "Dell Pro AI Studio",
    description: ["privacy.llm.dpais.description"],
    logo: DPAISLogo,
  },
};

export const VECTOR_DB_PRIVACY = {
  pgvector: {
    name: "PGVector",
    description: [
      "Your vectors and document text are stored on your PostgreSQL instance",
      "Access to your instance is managed by you",
    ],
    logo: PGVectorLogo,
  },
  chroma: {
    name: "Chroma",
    description: [
      "Your vectors and document text are stored on your Chroma instance",
      "Access to your instance is managed by you",
    ],
    logo: ChromaLogo,
  },
  pinecone: {
    name: "Pinecone",
    description: [
      "Your vectors and document text are stored on Pinecone's servers",
      "Access to your data is managed by Pinecone",
    ],
    logo: PineconeLogo,
  },
  qdrant: {
    name: "Qdrant",
    description: [
      "Your vectors and document text are stored on your Qdrant instance (cloud or self-hosted)",
    ],
    logo: QDrantLogo,
  },
  weaviate: {
    name: "Weaviate",
    description: [
      "Your vectors and document text are stored on your Weaviate instance (cloud or self-hosted)",
    ],
    logo: WeaviateLogo,
  },
  milvus: {
    name: "Milvus",
    description: [
      "Your vectors and document text are stored on your Milvus instance (cloud or self-hosted)",
    ],
    logo: MilvusLogo,
  },
  zilliz: {
    name: "Zilliz Cloud",
    description: [
      "Your vectors and document text are stored on your Zilliz cloud cluster.",
    ],
    logo: ZillizLogo,
  },
  astra: {
    name: "AstraDB",
    description: [
      "Your vectors and document text are stored on your cloud AstraDB database.",
    ],
    logo: AstraDBLogo,
  },
  lancedb: {
    name: "LanceDB",
    description: [
      "Your vectors and document text are stored privately on this instance of AnythingLLM",
    ],
    logo: LanceDbLogo,
  },
};

export const EMBEDDING_ENGINE_PRIVACY = {
  native: {
    name: "AnythingLLM Embedder",
    description: [
      "Your document text is embedded privately on this instance of AnythingLLM",
    ],
    logo: AnythingLLMIcon,
  },
  openai: {
    name: "OpenAI",
    description: [
      "Your document text is sent to OpenAI servers",
      "Your documents are not used for training",
    ],
    logo: OpenAiLogo,
  },
  azure: {
    name: "Azure OpenAI",
    description: [
      "Your document text is sent to your Microsoft Azure service",
      "Your documents are not used for training",
    ],
    logo: AzureOpenAiLogo,
  },
  localai: {
    name: "LocalAI",
    description: [
      "Your document text is embedded privately on the server running LocalAI",
    ],
    logo: LocalAiLogo,
  },
  ollama: {
    name: "Ollama",
    description: [
      "Your document text is embedded privately on the server running Ollama",
    ],
    logo: OllamaLogo,
  },
  lmstudio: {
    name: "LMStudio",
    description: [
      "Your document text is embedded privately on the server running LMStudio",
    ],
    logo: LMStudioLogo,
  },
  cohere: {
    name: "Cohere",
    description: [
      "Data is shared according to the terms of service of cohere.com and your localities privacy laws.",
    ],
    logo: CohereLogo,
  },
  voyageai: {
    name: "Voyage AI",
    description: [
      "Data sent to Voyage AI's servers is shared according to the terms of service of voyageai.com.",
    ],
    logo: VoyageAiLogo,
  },
  mistral: {
    name: "Mistral AI",
    description: [
      "Data sent to Mistral AI's servers is shared according to the terms of service of https://mistral.ai.",
    ],
    logo: MistralLogo,
  },
  litellm: {
    name: "LiteLLM",
    description: [
      "Your document text is only accessible on the server running LiteLLM and to the providers you configured in LiteLLM.",
    ],
    logo: LiteLLMLogo,
  },
  "generic-openai": {
    name: "Generic OpenAI compatible service",
    description: [
      "Data is shared according to the terms of service applicable with your generic endpoint provider.",
    ],
    logo: GenericOpenAiLogo,
  },
  gemini: {
    name: "Google Gemini",
    description: [
      "Your document text is sent to Google Gemini's servers for processing",
      "Your document text is stored or managed according to the terms of service of Google Gemini API Terms of Service",
    ],
    logo: GeminiLogo,
  },
};

export const FALLBACKS = {
  LLM: (provider) => ({
    name: "Unknown",
    description: [
      `"${provider}" has no known data handling policy defined in AnythingLLM`,
    ],
    logo: AnythingLLMIcon,
  }),
  EMBEDDING: (provider) => ({
    name: "Unknown",
    description: [
      `"${provider}" has no known data handling policy defined in AnythingLLM`,
    ],
    logo: AnythingLLMIcon,
  }),
  VECTOR: (provider) => ({
    name: "Unknown",
    description: [
      `"${provider}" has no known data handling policy defined in AnythingLLM`,
    ],
    logo: AnythingLLMIcon,
  }),
};

export default function DataHandling({ setHeader, setForwardBtn, setBackBtn }) {
  const { t } = useTranslation();
  const [llmChoice, setLLMChoice] = useState("openai");
  const [loading, setLoading] = useState(true);
  const [vectorDb, setVectorDb] = useState("pinecone");
  const [embeddingEngine, setEmbeddingEngine] = useState("openai");
  const navigate = useNavigate();

  const TITLE = t("onboarding.data.title");
  const DESCRIPTION = t("onboarding.data.description");

  useEffect(() => {
    setHeader({ title: TITLE, description: DESCRIPTION });
    setForwardBtn({ showing: true, disabled: false, onClick: handleForward });
    setBackBtn({ showing: false, disabled: false, onClick: handleBack });
    async function fetchKeys() {
      const _settings = await System.keys();
      setLLMChoice(_settings?.LLMProvider || "openai");
      setVectorDb(_settings?.VectorDB || "lancedb");
      setEmbeddingEngine(_settings?.EmbeddingEngine || "openai");

      setLoading(false);
    }
    fetchKeys();
  }, []);

  function handleForward() {
    navigate(paths.onboarding.survey());
  }

  function handleBack() {
    navigate(paths.onboarding.userSetup());
  }

  if (loading)
    return (
      <div className="w-full h-full flex justify-center items-center p-20">
        <PreLoader />
      </div>
    );

  const LLMSelection =
    LLM_SELECTION_PRIVACY?.[llmChoice] || FALLBACKS.LLM(llmChoice);
  const EmbeddingEngine =
    EMBEDDING_ENGINE_PRIVACY?.[embeddingEngine] ||
    FALLBACKS.EMBEDDING(embeddingEngine);
  const VectorDb = VECTOR_DB_PRIVACY?.[vectorDb] || FALLBACKS.VECTOR(vectorDb);

  return (
    <div className="w-full flex items-center justify-center flex-col gap-y-6">
      <div className="p-8 flex flex-col gap-8">
        <div className="flex flex-col gap-y-2 border-b border-theme-sidebar-border pb-4">
          <div className="text-theme-text-primary text-base font-bold">
            {t("privacy.llm.title")}
          </div>
          <div className="flex items-center gap-2.5">
            <img
              src={LLMSelection.logo}
              alt="LLM Logo"
              className="w-8 h-8 rounded"
            />
            <p className="text-theme-text-primary text-sm font-bold">
              {LLMSelection.name}
            </p>
          </div>
          <ul className="flex flex-col list-disc ml-4">
            {LLMSelection.description.map((desc) => (
              <li className="text-theme-text-primary text-sm" key={desc}>
                {t(desc)}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-y-2 border-b border-theme-sidebar-border pb-4">
          <div className="text-theme-text-primary text-base font-bold">
            {t("privacy.embedding.title")}
          </div>
          <div className="flex items-center gap-2.5">
            <img
              src={EmbeddingEngine.logo}
              alt="LLM Logo"
              className="w-8 h-8 rounded"
            />
            <p className="text-theme-text-primary text-sm font-bold">
              {EmbeddingEngine.name}
            </p>
          </div>
          <ul className="flex flex-col list-disc ml-4">
            {EmbeddingEngine.description.map((desc) => (
              <li className="text-theme-text-primary text-sm" key={desc}>
                {t(desc)}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-y-2 pb-4">
          <div className="text-theme-text-primary text-base font-bold">
            {t("privacy.vector.title")}
          </div>
          <div className="flex items-center gap-2.5">
            <img
              src={VectorDb.logo}
              alt="LLM Logo"
              className="w-8 h-8 rounded"
            />
            <p className="text-theme-text-primary text-sm font-bold">
              {VectorDb.name}
            </p>
          </div>
          <ul className="flex flex-col list-disc ml-4">
            {VectorDb.description.map((desc) => (
              <li className="text-theme-text-primary text-sm" key={desc}>
                {t(desc)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-theme-text-secondary text-sm font-medium py-1">
        {t("onboarding.data.settingsHint")}
      </p>
    </div>
  );
}
