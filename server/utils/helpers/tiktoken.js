const { getEncodingNameForModel, getEncoding } = require("js-tiktoken");

/**
 * @class TokenManager
 *
 * @notice
 * We cannot do estimation of tokens here like we do in the collector
 * because we need to know the model to do it.
 * Other issues are we also do reverse tokenization here for the chat history during cannonballing.
 * So here we are stuck doing the actual tokenization and encoding until we figure out what to do with prompt overflows.
 */
class TokenManager {
  static instance = null;
  static currentModel = null;

  constructor(model = "gpt-3.5-turbo") {
    if (TokenManager.instance && TokenManager.currentModel === model) {
      this.log("Returning existing instance for model:", model);
      return TokenManager.instance;
    }

    this.model = model;
    this.encoderName = this.#getEncodingFromModel(model);
    this.encoder = getEncoding(this.encoderName);

    TokenManager.instance = this;
    TokenManager.currentModel = model;
    this.log("Initialized new TokenManager instance for model:", model);
    return this;
  }

  log(text, ...args) {
    console.log(`\x1b[35m[TokenManager]\x1b[0m ${text}`, ...args);
  }

  #getEncodingFromModel(model) {
    try {
      return getEncodingNameForModel(model);
    } catch {
      return "cl100k_base";
    }
  }

  /**
   * Pass in an empty array of disallowedSpecials to handle all tokens as text and to be tokenized.
   * @param {string} input
   * @returns {number[]}
   */
  tokensFromString(input = "") {
    try {
      const tokens = this.encoder.encode(String(input), undefined, []);
      return tokens;
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  /**
   * Converts an array of tokens back to a string.
   * @param {number[]} tokens
   * @returns {string}
   */
  bytesFromTokens(tokens = []) {
    const bytes = this.encoder.decode(tokens);
    return bytes;
  }

  /**
   * Counts the number of tokens in a string.
   * Includes defensive handling for multimodal array content.
   * @param {string|object[]} input
   * @returns {number}
   */
  countFromString(input = "") {
    // Defensive: if an array (multimodal content) is passed, delegate to contentTokenCount
    if (Array.isArray(input)) return this.contentTokenCount(input);
    const tokens = this.tokensFromString(input);
    return tokens.length;
  }

  /**
   * Counts tokens from message content, handling both string and
   * multimodal array formats (e.g., [{type:"input_text", text:...}, {type:"input_image",...}]).
   * Images are estimated at a fixed token cost since base64 data
   * should not be tokenized directly.
   * @param {string|object[]} content
   * @returns {number}
   */
  contentTokenCount(content) {
    // String content → existing logic
    if (typeof content === "string") return this.countFromString(content);

    // Multimodal array content → count text tokens + fixed estimate per image
    if (Array.isArray(content)) {
      const IMAGE_TOKEN_ESTIMATE = 1000; // Conservative estimate for high-detail images
      let tokens = 0;
      for (const item of content) {
        if (item.type === "input_text" || item.type === "text") {
          tokens += this.countFromString(item.text || "");
        } else if (
          item.type === "input_image" ||
          item.type === "image_url" ||
          item.type === "image"
        ) {
          tokens += IMAGE_TOKEN_ESTIMATE;
        }
      }
      return tokens;
    }

    // Fallback: convert to string
    return this.countFromString(String(content));
  }

  /**
   * Estimates the number of tokens in a string or array of messages.
   * @param {string | object[]} input
   * @returns {number}
   */
  statsFrom(input) {
    if (typeof input === "string") return this.countFromString(input);

    // What is going on here?
    // https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb Item 6.
    // The only option is to estimate. From repeated testing using the static values in the code we are always 2 off,
    // which means as of Nov 1, 2023 the additional factor on ln: 476 changed from 3 to 5.
    if (Array.isArray(input)) {
      const perMessageFactorTokens = input.length * 3;
      const tokensFromContent = input.reduce(
        (a, b) => a + this.contentTokenCount(b.content),
        0
      );
      const diffCoefficient = 5;
      return perMessageFactorTokens + tokensFromContent + diffCoefficient;
    }

    throw new Error("Not a supported tokenized format.");
  }
}

module.exports = {
  TokenManager,
};
