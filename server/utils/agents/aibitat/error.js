class AIbitatError extends Error {}

class APIError extends AIbitatError {
  constructor(message) {
    super(message);
  }
}

/**
 * The error when the AI provider returns an error that should be treated as something
 * that should be retried.
 */
class RetryError extends APIError {}

/**
 * The error when the input exceeds the model's context window.
 * Unlike RetryError, this should NOT be retried — it fails immediately.
 */
class ContextWindowError extends APIError {
  constructor(message) {
    super(
      `The input exceeds this model's context window. ${message || "Please reduce the conversation length or use a model with a larger context."}`
    );
    this.name = "ContextWindowError";
  }
}

module.exports = {
  APIError,
  RetryError,
  ContextWindowError,
};
