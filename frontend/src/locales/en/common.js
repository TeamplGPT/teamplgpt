const TRANSLATIONS = {
  onboarding: {
    home: {
      title: "Welcome to",
      getStarted: "Get Started",
    },
    llm: {
      title: "LLM Preference",
      description:
        "AnythingLLM can work with many LLM providers. This will be the service which handles chatting.",
    },
    userSetup: {
      title: "User Setup",
      description: "Configure your user settings.",
      howManyUsers: "How many users will be using this instance?",
      justMe: "Just me",
      myTeam: "My team",
      instancePassword: "Instance Password",
      setPassword: "Would you like to set up a password?",
      passwordReq: "Passwords must be at least 8 characters.",
      passwordWarn:
        "It's important to save this password because there is no recovery method.",

      adminUsername: "Admin account username",
      adminUsernameReq:
        "Username must be at least 6 characters long and only contain lowercase letters, numbers, underscores, and hyphens with no spaces.",
      adminPassword: "Admin account password",
      adminPasswordReq: "Passwords must be at least 8 characters.",
      teamHint:
        "By default, you will be the only admin. Once onboarding is completed you can create and invite others to be users or admins. Do not lose your password as only admins can reset passwords.",
    },
    data: {
      title: "Data Handling & Privacy",
      description:
        "We are committed to transparency and control when it comes to your personal data.",
      settingsHint:
        "These settings can be reconfigured at any time in the settings.",
    },
    survey: {
      title: "Welcome to AnythingLLM",
      description: "Help us make AnythingLLM built for your needs. Optional.",

      email: "What's your email?",
      useCase: "What will you use AnythingLLM for?",
      useCaseWork: "For work",
      useCasePersonal: "For personal use",
      useCaseOther: "Other",
      comment: "How did you hear about AnythingLLM?",
      commentPlaceholder:
        "Reddit, Twitter, GitHub, YouTube, etc. - Let us know how you found us!",
      skip: "Skip Survey",
      thankYou: "Thank you for your feedback!",
    },
    workspace: {
      title: "Create your first workspace",
      description:
        "Create your first workspace and get started with AnythingLLM.",
    },
  },

  common: {
    "workspaces-name": "Workspaces Name",
    error: "error",
    success: "success",
    user: "User",
    selection: "Model Selection",
    saving: "Saving...",
    save: "Save changes",
    previous: "Previous Page",
    next: "Next Page",
    optional: "Optional",
    yes: "Yes",
    no: "No",
    "your-admin-password": "Your admin password",
  },

  // Setting Sidebar menu items.
  settings: {
    title: "Instance Settings",
    system: "General Settings",
    invites: "Invites",
    users: "Users",
    workspaces: "Workspaces",
    "workspace-chats": "Workspace Chats",
    customization: "Customization",
    interface: "UI Preferences",
    branding: "Branding & Whitelabeling",
    chat: "Chat",
    "api-keys": "Developer API",
    llm: "LLM",
    transcription: "Transcription",
    embedder: "Embedder",
    "text-splitting": "Text Splitter & Chunking",
    "voice-speech": "Voice & Speech",
    "vector-database": "Vector Database",
    embeds: "Chat Embed",
    "embed-chats": "Chat Embed History",
    security: "Security",
    "event-logs": "Event Logs",
    privacy: "Privacy & Data",
    "ai-providers": "AI Providers",
    "agent-skills": "Agent Skills",
    admin: "Admin",
    tools: "Tools",
    "system-prompt-variables": "System Prompt Variables",
    "experimental-features": "Experimental Features",
    contact: "Contact Support",
    "browser-extension": "Browser Extension",
  },

  // Page Definitions
  login: {
    "multi-user": {
      welcome: "Welcome to",
      "placeholder-username": "Username",
      "placeholder-password": "Password",
      login: "Login",
      validating: "Validating...",
      "forgot-pass": "Forgot password",
      reset: "Reset",
    },
    "sign-in": {
      start: "Sign in to your",
      end: "account.",
    },
    "password-reset": {
      title: "Password Reset",
      description:
        "Provide the necessary information below to reset your password.",
      "recovery-codes": "Recovery Codes",
      "recovery-code": "Recovery Code {{index}}",
      "back-to-login": "Back to Login",
    },
  },

  welcomeMessage: {
    part1:
      "Welcome to AnythingLLM, AnythingLLM is an open-source AI tool by Mintplex Labs that turns anything into a trained chatbot you can query and chat with. AnythingLLM is a BYOK (bring-your-own-keys) software so there is no subscription, fee, or charges for this software outside of the services you want to use with it.",
    part2:
      "AnythingLLM is the easiest way to put powerful AI products like OpenAi, GPT-4, LangChain, PineconeDB, ChromaDB, and other services together in a neat package with no fuss to increase your productivity by 100x.",
    part3:
      "AnythingLLM can run totally locally on your machine with little overhead you wont even notice it's there! No GPU needed. Cloud and on-premises installation is available as well.\nThe AI tooling ecosystem gets more powerful everyday. AnythingLLM makes it easy to use.",
    githubIssue: "Create an issue on GitHub",
    user1: "How do I get started?!",
    part4:
      "It's simple. All collections are organized into buckets we call \"Workspaces\". Workspaces are buckets of files, documents, images, PDFs, and other files which will be transformed into something LLM's can understand and use in conversation.\n\nYou can add and remove files at anytime.",
    createWorkspace: "Create your first workspace",
    user2:
      "Is this like an AI dropbox or something? What about chatting? It is a chatbot isn't it?",
    part5:
      "AnythingLLM is more than a smarter Dropbox.\n\nAnythingLLM offers two ways of talking with your data:\n\n<i>Query:</i> Your chats will return data or inferences found with the documents in your workspace it has access to. Adding more documents to the Workspace make it smarter! \n\n<i>Conversational:</i> Your documents + your on-going chat history both contribute to the LLM knowledge at the same time. Great for appending real-time text-based info or corrections and misunderstandings the LLM might have. \n\nYou can toggle between either mode \n<i>in the middle of chatting!</i>",
    user3: "Wow, this sounds amazing, let me try it out already!",
    part6: "Have Fun!",
    starOnGitHub: "Star on GitHub",
    contact: "Contact Mintplex Labs",
  },

  "main-page": {
    noWorkspaceError: "Please create a workspace before starting a chat.",
    checklist: {
      title: "Getting Started",
      tasksLeft: "tasks left",
      completed: "You're on your way to becoming an AnythingLLM expert!",
      dismiss: "close",
      tasks: {
        create_workspace: {
          title: "Create a workspace",
          description: "Create your first workspace to get started",
          action: "Create",
        },
        send_chat: {
          title: "Send a chat",
          description: "Start a conversation with your AI assistant",
          action: "Chat",
        },
        embed_document: {
          title: "Embed a document",
          description: "Add your first document to your workspace",
          action: "Embed",
        },
        setup_system_prompt: {
          title: "Set up a system prompt",
          description: "Configure your AI assistant's behavior",
          action: "Set Up",
        },
        define_slash_command: {
          title: "Define a slash command",
          description: "Create custom commands for your assistant",
          action: "Define",
        },
        visit_community: {
          title: "Visit Community Hub",
          description: "Explore community resources and templates",
          action: "Browse",
        },
      },
    },
    quickLinks: {
      title: "Quick Links",
      sendChat: "Send Chat",
      embedDocument: "Embed a Document",
      createWorkspace: "Create Workspace",
    },
    exploreMore: {
      title: "Explore more features",
      features: {
        customAgents: {
          title: "Custom AI Agents",
          description: "Build powerful AI Agents and automations with no code.",
          primaryAction: "Chat using @agent",
          secondaryAction: "Build an agent flow",
        },
        slashCommands: {
          title: "Slash Commands",
          description:
            "Save time and inject prompts using custom slash commands.",
          primaryAction: "Create a Slash Command",
          secondaryAction: "Explore on Hub",
        },
        systemPrompts: {
          title: "System Prompts",
          description:
            "Modify the system prompt to customize the AI replies of a workspace.",
          primaryAction: "Modify a System Prompt",
          secondaryAction: "Manage prompt variables",
        },
      },
    },
    announcements: {
      title: "Updates & Announcements",
    },
    resources: {
      title: "Resources",
      links: {
        docs: "Docs",
        star: "Star on Github",
      },
      keyboardShortcuts: "Keyboard Shortcuts",
    },
    footer: {
      github: "View source code on GitHub",
      docs: "Open AnythingLLM help docs",
      community: "Join the AnythingLLM Discord",
      settings: "Open settings",
    },
  },

  "new-workspace": {
    title: "New Workspace",
    placeholder: "My Workspace",
  },

  // Workspace Settings menu items
  "workspaces—settings": {
    general: "General Settings",
    chat: "Chat Settings",
    vector: "Vector Database",
    members: "Members",
    agent: "Agent Configuration",
  },

  // General Appearance
  general: {
    vector: {
      title: "Vector Count",
      description: "Total number of vectors in your vector database.",
    },
    names: {
      description: "This will only change the display name of your workspace.",
    },
    message: {
      title: "Suggested Chat Messages",
      description:
        "Customize the messages that will be suggested to your workspace users.",
      add: "Add new message",
      save: "Save Messages",
      heading: "Explain to me",
      body: "the benefits of AnythingLLM",
    },
    pfp: {
      title: "Assistant Profile Image",
      description:
        "Customize the profile image of the assistant for this workspace.",
      image: "Workspace Image",
      remove: "Remove Workspace Image",
    },
    delete: {
      title: "Delete Workspace",
      description:
        "Delete this workspace and all of its data. This will delete the workspace for all users.",
      delete: "Delete Workspace",
      deleting: "Deleting Workspace...",
      "confirm-start": "You are about to delete your entire",
      "confirm-end":
        "workspace. This will remove all vector embeddings in your vector database.\n\nThe original source files will remain untouched. This action is irreversible.",
    },
  },

  // Chat Settings
  chat: {
    llm: {
      title: "Workspace LLM Provider",
      description:
        "The specific LLM provider & model that will be used for this workspace. By default, it uses the system LLM provider and settings.",
      search: "Search all LLM providers",
    },
    model: {
      title: "Workspace Chat model",
      description:
        "The specific chat model that will be used for this workspace. If empty, will use the system LLM preference.",
      wait: "-- waiting for models --",
    },
    mode: {
      title: "Chat mode",
      chat: {
        title: "Chat",
        "desc-start": "will provide answers with the LLM's general knowledge",
        and: "and",
        "desc-end": "document context that is found.",
      },
      query: {
        title: "Query",
        "desc-start": "will provide answers",
        only: "only",
        "desc-end": "if document context is found.",
      },
    },
    history: {
      title: "Chat History",
      "desc-start":
        "The number of previous chats that will be included in the response's short-term memory.",
      recommend: "Recommend 20. ",
      "desc-end":
        "Anything more than 45 is likely to lead to continuous chat failures depending on message size.",
    },
    prompt: {
      title: "System Prompt",
      description:
        "The prompt that will be used on this workspace. Define the context and instructions for the AI to generate a response. You should to provide a carefully crafted prompt so the AI can generate a relevant and accurate response.",
      history: {
        title: "System Prompt History",
        clearAll: "Clear All",
        noHistory: "No system prompt history available",
        restore: "Restore",
        delete: "Delete",
        publish: "Publish to Community Hub",
        deleteConfirm: "Are you sure you want to delete this history item?",
        clearAllConfirm:
          "Are you sure you want to clear all history? This action cannot be undone.",
        expand: "Expand",
      },
    },
    refusal: {
      title: "Query mode refusal response",
      "desc-start": "When in",
      query: "query",
      "desc-end":
        "mode, you may want to return a custom refusal response when no context is found.",
      "tooltip-title": "Why am I seeing this?",
      "tooltip-description":
        "You are in query mode, which only uses information from your documents. Switch to chat mode for more flexible conversations, or click here to visit our documentation to learn more about chat modes.",
    },
    temperature: {
      title: "LLM Temperature",
      "desc-start":
        'This setting controls how "creative" your LLM responses will be.',
      "desc-end":
        "The higher the number the more creative. For some models this can lead to incoherent responses when set too high.",
      hint: "Most LLMs have various acceptable ranges of valid values. Consult your LLM provider for that information.",
    },
  },

  // Vector Database
  "vector-workspace": {
    identifier: "Vector database identifier",
    snippets: {
      title: "Max Context Snippets",
      description:
        "This setting controls the maximum amount of context snippets the will be sent to the LLM for per chat or query.",
      recommend: "Recommended: 4",
    },
    doc: {
      title: "Document similarity threshold",
      description:
        "The minimum similarity score required for a source to be considered related to the chat. The higher the number, the more similar the source must be to the chat.",
      zero: "No restriction",
      low: "Low (similarity score ≥ .25)",
      medium: "Medium (similarity score ≥ .50)",
      high: "High (similarity score ≥ .75)",
    },
    reset: {
      reset: "Reset Vector Database",
      resetting: "Clearing vectors...",
      confirm:
        "You are about to reset this workspace's vector database. This will remove all vector embeddings currently embedded.\n\nThe original source files will remain untouched. This action is irreversible.",
      error: "Workspace vector database could not be reset!",
      success: "Workspace vector database was reset!",
    },
  },

  // Agent Configuration
  agent: {
    "performance-warning":
      "Performance of LLMs that do not explicitly support tool-calling is highly dependent on the model's capabilities and accuracy. Some abilities may be limited or non-functional.",
    provider: {
      title: "Workspace Agent LLM Provider",
      description:
        "The specific LLM provider & model that will be used for this workspace's @agent agent.",
    },
    mode: {
      chat: {
        title: "Workspace Agent Chat model",
        description:
          "The specific chat model that will be used for this workspace's @agent agent.",
      },
      title: "Workspace Agent model",
      description:
        "The specific LLM model that will be used for this workspace's @agent agent.",
      wait: "-- waiting for models --",
    },

    skill: {
      title: "Default agent skills",
      description:
        "Improve the natural abilities of the default agent with these pre-built skills. This set up applies to all workspaces.",
      rag: {
        title: "RAG & long-term memory",
        description:
          'Allow the agent to leverage your local documents to answer a query or ask the agent to "remember" pieces of content for long-term memory retrieval.',
      },
      view: {
        title: "View & summarize documents",
        description:
          "Allow the agent to list and summarize the content of workspace files currently embedded.",
      },
      scrape: {
        title: "Scrape websites",
        description:
          "Allow the agent to visit and scrape the content of websites.",
      },
      generate: {
        title: "Generate charts",
        description:
          "Enable the default agent to generate various types of charts from data provided or given in chat.",
      },
      save: {
        title: "Generate & save files to browser",
        description:
          "Enable the default agent to generate and write to files that save and can be downloaded in your browser.",
      },
      web: {
        title: "Live web search and browsing",
        "desc-start":
          "Enable your agent to search the web to answer your questions by connecting to a web-search (SERP) provider.",
        "desc-end":
          "Web search during agent sessions will not work until this is set up.",
      },
    },
  },

  // Workspace Chats
  recorded: {
    title: "Workspace Chats",
    description:
      "These are all the recorded chats and messages that have been sent by users ordered by their creation date.",
    export: "Export",
    table: {
      id: "ID",
      by: "Sent By",
      workspace: "Workspace",
      prompt: "Prompt",
      response: "Response",
      at: "Sent At",
    },
    clear: "Clear Chats",
    next: "Next Page",
    previous: "Previous Page",
    chatrow: {
      "failed-to-parse": "-- Failed to parse --",
      "export-failed": "Failed to export chats.",
      "export-success": "Chats exported successfully as ",
      "clear-all-confirm":
        "Are you sure you want to clear all chats?\n\nThis action is irreversible.",
      "clear-all-success": "Cleared all chats.",
      "delete-confirm":
        "Are you sure you want to delete this chat?\n\nThis action is irreversible.",
      "viewing-text": "Viewing Text",
    },
  },

  customization: {
    interface: {
      title: "UI Preferences",
      description: "Set your UI preferences for AnythingLLM.",
    },
    branding: {
      title: "Branding & Whitelabeling",
      description:
        "White-label your AnythingLLM instance with custom branding.",
    },
    chat: {
      title: "Chat",
      description: "Set your chat preferences for AnythingLLM.",
      auto_submit: {
        title: "Auto-Submit Speech Input",
        description:
          "Automatically submit speech input after a period of silence",
      },
      auto_speak: {
        title: "Auto-Speak Responses",
        description: "Automatically speak responses from the AI",
      },
      spellcheck: {
        title: "Enable Spellcheck",
        description: "Enable or disable spellcheck in the chat input field",
      },
    },
    items: {
      theme: {
        title: "Theme",
        description: "Select your preferred color theme for the application.",
      },
      "show-scrollbar": {
        title: "Show Scrollbar",
        description: "Enable or disable the scrollbar in the chat window.",
      },
      "support-email": {
        title: "Support Email",
        description:
          "Set the support email address that should be accessible by users when they need help.",
      },
      "app-name": {
        title: "Name",
        description:
          "Set a name that is displayed on the login page to all users.",
      },
      "chat-message-alignment": {
        title: "Chat Message Alignment",
        description:
          "Select the message alignment mode when using the chat interface.",
      },
      "display-language": {
        title: "Display Language",
        description:
          "Select the preferred language to render AnythingLLM's UI in - when translations are available.",
      },
      logo: {
        title: "Brand Logo",
        description: "Upload your custom logo to showcase on all pages.",
        add: "Add a custom logo",
        recommended: "Recommended size: 800 x 200",
        remove: "Remove",
        replace: "Replace",
      },
      "welcome-messages": {
        title: "Welcome Messages",
        description:
          "Customize the welcome messages displayed to your users. Only non-admin users will see these messages.",
        new: "New",
        system: "system",
        user: "user",
        message: "message",
        assistant: "AnythingLLM Chat Assistant",
        "double-click": "Double click to edit...",
        save: "Save Messages",
      },
      "browser-appearance": {
        title: "Browser Appearance",
        description:
          "Customize the appearance of the browser tab and title when the app is open.",
        tab: {
          title: "Title",
          description:
            "Set a custom tab title when the app is open in a browser.",
        },
        favicon: {
          title: "Favicon",
          description: "Use a custom favicon for the browser tab.",
        },
      },
      "sidebar-footer": {
        title: "Sidebar Footer Items",
        description:
          "Customize the footer items displayed on the bottom of the sidebar.",
        icon: "Icon",
        link: "Link",
      },
    },
  },

  // API Keys
  api: {
    title: "API Keys",
    description:
      "API keys allow the holder to programmatically access and manage this AnythingLLM instance.",
    link: "Read the API documentation",
    generate: "Generate New API Key",
    table: {
      key: "API Key",
      by: "Created By",
      created: "Created",
    },
  },

  llm: {
    title: "LLM Preference",
    description:
      "These are the credentials and settings for your preferred LLM chat & embedding provider. It is important that these keys are current and correct, or else AnythingLLM will not function properly.",
    provider: "LLM Provider",
    providers: {
      azure_openai: {
        description:
          "The enterprise option of OpenAI hosted on Azure services.",
        azure_service_endpoint: "Azure Service Endpoint",
        chat_deployment_name: "Chat Deployment Name",
        chat_model_token_limit: "Chat Model Token Limit",
        model_type: "Model Type",
        default: "Default",
        reasoning: "Reasoning",
      },
      openai: {
        description: "The standard option for most non-commercial use.",
      },
      anthropic: {
        description: "A friendly AI Assistant hosted by Anthropic.",
      },
      gemini: {
        description: "Google's largest and most capable AI model",
      },
      nvidia_nim: {
        description:
          "Run full parameter LLMs directly on your NVIDIA RTX GPU using NVIDIA NIM.",
        base_url_description: "Enter the URL where NVIDIA NIM is running.",
      },
      huggingface: {
        description:
          "Access 150,000+ open-source LLMs and the world's AI community",
        inference_endpoint: "HuggingFace Inference Endpoint",
        access_token: "HuggingFace Access Token",
        model_token_limit: "Model Token Limit",
      },
      ollama: {
        description: "Run LLMs locally on your own machine.",
        model: "Ollama Model",
        model_description:
          "Select the Ollama model you want to use. Models will load after entering a valid Ollama URL.",
        model_description_2:
          "Choose the Ollama model you want to use for your conversations.",
        enter_ollama_url_first: "Enter Ollama URL first",
        model_token_limit: "Max Tokens",
        model_token_limit_description:
          "Maximum number of tokens for context and response.",
        base_url_description: "Enter the URL where Ollama is running.",
        performance_mode: "Performance Mode",
        performance_mode_description:
          "Choose the performance mode for the Ollama model.",
        base_mode: "Base (Default)",
        maximum_mode: "Maximum",
        note: "Note:",
        note_description:
          "Be careful with the Maximum mode. It may increase resource usage significantly.",
        maximum_mode_description:
          "Uses the full context window (up to Max Tokens). Will result in increased resource usage but allows for larger context conversations. <br /><br /> This is not recommended for most users.",
        base_mode_description:
          "Ollama automatically limits the context to 2048 tokens, keeping resources usage low while maintaining good performance. Suitable for most users and models.",
        keep_alive: "Ollama Keep Alive",
        no_cache: "No cache",
        five_minutes: "5 minutes",
        one_hour: "1 hour",
        forever: "Forever",
        keep_alive_description:
          "Choose how long Ollama should keep your model in memory before unloading.",
        learn_more: "Learn more",
        auth_token: "Auth Token",
        auth_token_description:
          "Enter a <code>Bearer</code> Auth Token for interacting with your Ollama server.",
        auth_token_description_2:
          "Used <b>only</b> if running Ollama behind an authentication server.",
      },
      dpais: {
        description:
          "Run powerful LLMs quickly on NPU powered by Dell Pro AI Studio.",
        dell_pro_ai_studio_base_url: "Dell Pro AI Studio Base URL",
      },
      lmstudio: {
        description:
          "Discover, download, and run thousands of cutting edge LLMs in a few clicks.",
        alert:
          "LMStudio as your LLM requires you to set an embedding service to use.",
        manage_embedding: "Manage embedding",
        max_tokens_description:
          "Maximum number of tokens for context and response.",
        hide_endpoint_input: "Hide Manual Endpoint Input",
        show_endpoint_input: "Show Manual Endpoint Input",
        base_url_description: "Enter the URL where LM Studio is running.",
        model: "LM Studio Model",
        enter_url_first: "Enter LM Studio URL first",
        model_description:
          "Select the LM Studio model you want to use. Models will load after entering a valid LM Studio URL.",
        model_description_2:
          "Choose the LM Studio model you want to use for your conversations.",
      },
      localai: {
        description: "Run LLMs locally on your own machine.",
      },
      novita: {
        description:
          "Reliable, Scalable, and Cost-Effective for LLMs from Novita AI",
      },
      togetherai: {
        description: "Run open source models from Together AI.",
      },
      fireworksai: {
        description:
          "The fastest and most efficient inference engine to build production-ready, compound AI systems.",
      },
      mistral: {
        description: "Run open source models from Mistral AI.",
      },
      perplexity: {
        description:
          "Run powerful and internet-connected models hosted by Perplexity AI.",
      },
      openrouter: {
        description: "A unified interface for LLMs.",
      },
      groq: {
        description:
          "The fastest LLM inferencing available for real-time AI applications.",
      },
      koboldcpp: {
        description: "Run local LLMs using KoboldCPP.",
        max_tokens_description:
          "Maximum number of tokens for context and response.",
        max_response_tokens: "Max response tokens",
        max_response_tokens_description:
          "Maximum number of tokens for the response.",
        hide_manual_endpoint_input: "Hide Manual Endpoint Input",
        show_manual_endpoint_input: "Show Manual Endpoint Input",
        base_url_description: "Enter the URL where KoboldCPP is running.",
        model: "KoboldCPP Model",
        model_description:
          "Select the KoboldCPP model you want to use. Models will load after entering a valid KoboldCPP URL.",
        model_description_2:
          "Choose the KoboldCPP model you want to use for your conversations.",
      },
      textgenwebui: {
        description: "Run local LLMs using Oobabooga's Text Generation Web UI.",
      },
      cohere: {
        description: "Run Cohere's powerful Command models.",
      },
      litellm: {
        description: "Run LiteLLM's OpenAI compatible proxy for various LLMs.",
      },
      deepseek: {
        description: "Run DeepSeek's powerful LLMs.",
      },
      ppio: {
        description:
          "Run stable and cost-efficient open-source LLM APIs, such as DeepSeek, Llama, Qwen etc.",
      },
      bedrock: {
        description:
          "Run powerful foundation models privately with AWS Bedrock.",
        alert: "You should use a properly defined IAM user for inferencing.",
        read_more: "Read more on how to use AWS Bedrock in AnythingLLM",
        use_session_token: "Use session token",
        select_method: "Select the method to authenticate with AWS Bedrock.",
        iam_explicit_credentials: "IAM (Explicit Credentials)",
        session_token: "Session Token (Temporary Credentials)",
        iam_role: "IAM Role (Implied Credentials)",
        iam_access_id: "AWS Bedrock IAM Access ID",
        iam_access_key: "AWS Bedrock IAM Access Key",
        session_token_placeholder: "AWS Bedrock Session Token",
        aws_region: "AWS region",
        model_id: "Model ID",
        model_id_placeholder: "Model id from AWS eg: meta.llama3.1-v0.1",
        model_context_window: "Model context window",
        model_context_window_placeholder: "Content window limit (eg: 8192)",
        model_max_output_tokens: "Model max output tokens",
        model_max_output_tokens_placeholder: "Max output tokens (eg: 4096)",
      },
      apipie: {
        description: "A unified API of AI services from leading providers",
      },
      generic_openai: {
        description:
          "Connect to any OpenAi-compatible service via a custom configuration",
        chat_model_name: "Chat Model Name",
        model_id_used_for_chat_requests: "Model id used for chat requests",
        max_tokens_per_request_placeholder: "Max tokens per request (eg: 1024)",
      },
      xai: {
        description: "Run xAI's powerful LLMs like Grok-2 and more.",
      },
      api_key: "API Key",
      chat_model_selection: "Chat Model Selection",
      loading_models: "Loading available models...",
      enter_valid_api_key:
        "Enter a valid API key to view all available models for your account.",
      model_type: "Model Type",
      default: "Default",
      token_context_window: "Token Context Window",
      show_advanced_settings: "Show Advanced Settings",
      hide_advanced_settings: "Hide Advanced Settings",
      auto_detect: "Auto-Detect",
      base_url: "Base URL",
      waiting_for_url: "Waiting for URL",
      waiting_for_api_key: "Waiting for API Key",
      optional: "optional",
      select_llm_required: "You need to select an LLM",
      max_tokens: "Max Tokens",
      token_context_window_placeholder: "Content window limit (eg: 4096)",
    },
  },

  // Vector Database
  vector: {
    title: "Vector Database",
    description:
      "These are the credentials and settings for how your AnythingLLM instance will function. It's important these keys are current and correct.",
    provider: {
      title: "Vector Database Provider",
      description: "There is no configuration needed for LanceDB.",
      search: "Search all vector database providers",
      lancedb: {
        description:
          "100% local vector DB that runs on the same instance as AnythingLLM.",
      },
      pgvector: {
        description: "Vector search powered by PostgreSQL.",
        connectionString: "Postgres Connection String",
        tableName: "Vector Table Name",
        tooltip: {
          intro:
            "This is the connection string for the Postgres database in the format of <br /><code>postgresql://username:password@host:port/database</code>",
          permissions:
            "The user for the database must have the following permissions:",
          permission_db: "Read access to the database",
          permission_schema: "Read access to the database schem",
          permission_create: "Create access to the database",
          pgvector:
            "You must have the pgvector extension installed on the database.",
          desc_1:
            "This is the name of the table in the Postgres database that will store the vectors",
          desc_2:
            "By default, the table name is <code>anythingllm_vectors</code>.",
          desc_3:
            "This table must not already exist on the database - it will be created automatically.",
        },
      },
      chroma: {
        description:
          "Open source vector database you can host yourself or on the cloud.",
        endpoint: "Chroma Endpoint",
        apiHeader: "API Header",
      },
      pinecone: {
        description:
          "100% cloud-based vector database for enterprise use cases.",
        apiKey: "Pinecone DB API Key",
        indexName: "Pinecone Index Name",
      },
      zilliz: {
        description:
          "Cloud hosted vector database built for enterprise with SOC 2 compliance.",
        clusterEndpoint: "Cluster Endpoint",
        apiToken: "API Token",
      },
      qdrant: {
        description: "Open source local and distributed cloud vector database.",
        QDrantAPIEndpoint: "QDrant API Endpoint",
      },
      weaviate: {
        description:
          "Open source local and cloud hosted multi-modal vector database.",
        endpoint: "Weaviate Endpoint",
      },
      milvus: {
        description: "Open-source, highly scalable, and blazing fast.",
        dbAddress: "Milvus DB Address",
        username: "Milvus Username",
        password: "Milvus Password",
      },
      astra: {
        description: "Vector Search for Real-world GenAI.",
        endpoint: "Astra DB Endpoint",
        applicationToken: "Astra DB Application Token",
      },
      apiKey: "API Key",
    },
  },

  embedding: {
    title: "Embedding Preference",
    "desc-start":
      "When using an LLM that does not natively support an embedding engine - you may need to additionally specify credentials to for embedding text.",
    "desc-end":
      "Embedding is the process of turning text into vectors. These credentials are required to turn your files and prompts into a format which AnythingLLM can use to process.",
    provider: {
      title: "Embedding Provider",
      description:
        "There is no set up required when using AnythingLLM's native embedding engine.",
      search: "Search all embedding providers",
    },
    providers: {
      native: {
        description:
          "Use the built-in embedding provider for AnythingLLM. Zero setup!",
      },
      openai: {
        description: "The standard option for most non-commercial use.",
      },
      azure: {
        description:
          "The enterprise option of OpenAI hosted on Azure services.",
        azure_service_endpoint: "Azure Service Endpoint",
        embedding_deployment_name: "Embedding Deployment Name",
      },
      gemini: {
        description: "Run powerful embedding models from Google AI.",
      },
      localai: {
        description: "Run embedding models locally on your own machine.",
        embedding_model_name: "Embedding Model Name",
        local_ai_api_key: "Local AI API Key",
        local_ai_base_url: "LocalAI Base URL",
      },
      ollama: {
        description: "Run embedding models locally on your own machine.",
        ollama_embedding_model: "Ollama Embedding Model",
        enter_ollama_url_first: "Enter Ollama URL first",
        ollama_embedding_model_description:
          "Select the Ollama model for embeddings. Models will load after entering a valid Ollama URL.",
        ollama_embedding_model_description_2:
          "Choose the Ollama model you want to use for generating embeddings.",
        ollama_base_url: "Ollama Base URL",
        ollama_base_url_description: "Enter the URL where Ollama is running.",
      },
      lmstudio: {
        description:
          "Discover, download, and run thousands of cutting edge LLMs in a few clicks.",
        lmstudio_embedding_model: "LM Studio Embedding Model",
        lmstudio_embedding_model_description:
          "Select the LM Studio model for embeddings. Models will load after entering a valid LM Studio URL.",
        lmstudio_embedding_model_description_2:
          "Choose the LM Studio model you want to use for generating embeddings.",
        enter_lmstudio_url_first: "Enter LM Studio URL first",
        lmstudio_base_url: "LM Studio Base URL",
        lmstudio_base_url_description:
          "Enter the URL where LM Studio is running.",
      },
      cohere: {
        description: "Run powerful embedding models from Cohere.",
      },
      voyageai: {
        description: "Run powerful embedding models from Voyage AI.",
      },
      litellm: {
        description: "Run powerful embedding models from LiteLLM.",
      },
      mistral: {
        description: "Run powerful embedding models from Mistral AI.",
      },
      generic_openai: {
        description:
          "Run embedding models from any OpenAI compatible API service.",
        embedding_model: "Embedding Model",
        max_concurrent_chunks: "Max Concurrent Chunks",
      },
      endpoint_discovery: {
        success: "Provider endpoint discovered automatically.",
        manual_required:
          "Couldn't automatically discover the provider endpoint. Please enter it manually.",
      },
      api_key: "API Key",
      base_url: "Base URL",
      embedding_model_selection: "Embedding Model Selection",
      model_preference: "Model Preference",
      available_embedding_models: "Available embedding models",
      show_advanced_settings: "Show Advanced Settings",
      hide_advanced_settings: "Hide Advanced Settings",
      your_loaded_models: "Your loaded models",
      auto_detect: "Auto-Detect",
      optional: "optional",
      loading_models: "-- loading available models --",
      waiting_for_url: "-- waiting for URL --",
      max_embedding_chunk_length: "Max Embedding Chunk Length",
      max_embedding_chunk_length_description:
        "Maximum length of text chunks for embedding.",
    },
  },

  text: {
    title: "Text splitting & Chunking Preferences",
    "desc-start":
      "Sometimes, you may want to change the default way that new documents are split and chunked before being inserted into your vector database.",
    "desc-end":
      "You should only modify this setting if you understand how text splitting works and it's side effects.",
    "warn-start": "Changes here will only apply to",
    "warn-center": "newly embedded documents",
    "warn-end": ", not existing documents.",
    size: {
      title: "Text Chunk Size",
      description:
        "This is the maximum length of characters that can be present in a single vector.",
      recommend: "Embed model maximum length is",
    },

    overlap: {
      title: "Text Chunk Overlap",
      description:
        "This is the maximum overlap of characters that occurs during chunking between two adjacent text chunks.",
    },
  },

  "speech-text": {
    provider: "Provider",
    speech: {
      title: "Speech-to-text Preference",
      description:
        "Here you can specify what kind of text-to-speech and speech-to-text providers you would want to use in your AnythingLLM experience. By default, we use the browser's built in support for these services, but you may want to use others.",
      success: "Speech-to-text preferences saved successfully.",
      search: "Search speech to text providers",
      providers: {
        native: {
          description: "Uses your browser's built in STT service if supported.",
          description2: "There is no configuration needed for this provider.",
        },
      },
    },
    text: {
      title: "Text-to-speech Preference",
      description:
        "Here you can specify what kind of text-to-speech providers you would want to use in your AnythingLLM experience. By default, we use the browser's built in support for these services, but you may want to use others.",
      success: "Text-to-speech preferences saved successfully.",
      error: "Failed to save preferences",
      search: "Search text to speech providers",
      providers: {
        native: {
          description: "Uses your browser's built in TTS service if supported.",
          description2: "There is no configuration needed for this provider.",
        },
        openai: {
          description: "Use OpenAI's text to speech voices.",
        },
        elevenlabs: {
          description: "Use ElevenLabs's text to speech voices and technology.",
          organization: "premade",
        },
        piper_local: {
          description: "Run TTS models locally in your browser privately.",
          description2:
            "All PiperTTS models will run in your browser locally. This can be resource intensive on lower-end devices.",
          description3:
            "The '✔' indicates this model is already stored locally and does not need to be downloaded when run.",
          info: "All voices flushed from browser storage",
          flush_voice_cache: "Flush voice cache",
          stop_demo: "Stop demo",
          loading_voice: "Loading voice",
          play_sample: "Play sample",
        },
        generic_openai: {
          description:
            "Connect to an OpenAI compatible TTS service running locally or remotely.",
          description2:
            "This should be the base URL of the OpenAI compatible TTS service you will generate TTS responses from.",
          description3:
            "Some TTS services require an API key to generate TTS responses - this is optional if your service does not require one.",
          description4:
            "Most TTS services will have several voice models available, this is the identifier for the voice model you want to use.",
          voice_model_placeholder: "Your voice model identifier",
        },
      },
    },
    api_key: "API Key",
    voice_model: "Voice Model",
    loading_models: "loading available models",
    base_url: "Base URL",
  },

  transcription: {
    title: "Transcription Model Preference",
    description:
      "These are the credentials and settings for your preferred transcription model provider. Its important these keys are current and correct or else media files and audio will not transcribe.",
    provider: "Transcription Provider",
    providers: {
      openai: {
        description:
          "Leverage the OpenAI Whisper-large model using your API key.",
        whisper_model: "Whisper Model",
      },
      local: {
        description: "Run a built-in whisper model on this instance privately.",
      },
    },
    "warn-start":
      "Using the local whisper model on machines with limited RAM or CPU can stall AnythingLLM when processing media files.",
    "warn-recommend":
      "We recommend at least 2GB of RAM and upload files <10Mb.",
    "warn-end":
      "The built-in model will automatically download on the first use.",
    search: "Search audio transcription providers",
    api_key: "API Key",
  },

  // Embeddable Chat Widgets
  embeddable: {
    title: "Embeddable Chat Widgets",
    description:
      "Embeddable chat widgets are public facing chat interfaces that are tied to a single workspace. These allow you to build workspaces that then you can publish to the world.",
    create: "Create embed",
    table: {
      workspace: "Workspace",
      chats: "Sent Chats",
      active: "Active Domains",
      created: "Created",
    },
  },

  "embed-chats": {
    title: "Embed Chat History",
    export: "Export",
    description:
      "These are all the recorded chats and messages from any embed that you have published.",
    table: {
      embed: "Embed",
      sender: "Sender",
      message: "Message",
      response: "Response",
      at: "Sent At",
    },
  },

  multi: {
    title: "Multi-User Mode",
    description:
      "Set up your instance to support your team by activating Multi-User Mode.",
    enable: {
      "is-enable": "Multi-User Mode is Enabled",
      enable: "Enable Multi-User Mode",
      description:
        "By default, you will be the only admin. As an admin you will need to create accounts for all new users or admins. Do not lose your password as only an Admin user can reset passwords.",
      username: "Admin account username",
      password: "Admin account password",
    },
    password: {
      title: "Password Protection",
      description:
        "Protect your AnythingLLM instance with a password. If you forget this there is no recovery method so ensure you save this password.",
    },
    instance: {
      title: "Password Protect Instance",
      description:
        "By default, you will be the only admin. As an admin you will need to create accounts for all new users or admins. Do not lose your password as only an Admin user can reset passwords.",
      password: "Instance password",
    },
  },

  // Event Logs
  event: {
    title: "Event Logs",
    description:
      "View all actions and events happening on this instance for monitoring.",
    clear: "Clear Event Logs",
    table: {
      type: "Event Type",
      user: "User",
      occurred: "Occurred At",
    },
  },

  // Privacy & Data-Handling
  privacy: {
    title: "Privacy & Data-Handling",
    description:
      "This is your configuration for how connected third party providers and AnythingLLM handle your data.",
    llm: {
      title: "LLM Selection",
      openai: {
        description:
          "Your prompts and document text used in response creation are visible to OpenAI",
      },
      azure: {
        description:
          "Your text and embedding text are not visible to OpenAI or Microsoft",
      },
      anthropic: {
        description:
          "Your prompts and document text used in response creation are visible to Anthropic",
      },
      gemini: {
        description: "Your chats are de-identified and used in training",
        description2:
          "Your prompts and document text used in response creation are visible to Google",
      },
      nvidia_nim: {
        description:
          "Your model and chats are only accessible on the machine running the NVIDIA NIM",
      },
      lmstudio: {
        description:
          "Your model and chats are only accessible on the server running LMStudio",
      },
      localai: {
        description:
          "Your model and chats are only accessible on the server running LocalAI",
      },
      ollama: {
        description:
          "Your model and chats are only accessible on the machine running Ollama models",
      },
      togetherai: {
        description:
          "Your prompts and document text used in response creation are visible to TogetherAI",
      },
      fireworksai: {
        description2:
          "Your prompts and document text used in response creation are visible to Fireworks AI",
      },
      mistral: {
        description:
          "Your prompts and document text used in response creation are visible to Mistral",
      },
      huggingface: {
        description:
          "Your prompts and document text used in response are sent to your HuggingFace managed endpoint",
      },
      perplexity: {
        description:
          "Your prompts and document text used in response creation are visible to Perplexity AI",
      },
      openrouter: {
        description:
          "Your prompts and document text used in response creation are visible to OpenRouter",
      },
      novita: {
        description:
          "Your prompts and document text used in response creation are visible to Novita AI",
      },
      groq: {
        description:
          "Your prompts and document text used in response creation are visible to Groq",
      },
      koboldcpp: {
        description:
          "Your model and chats are only accessible on the server running KoboldCPP",
      },
      textgenwebui: {
        description:
          "Your model and chats are only accessible on the server running the Oobabooga Text Generation Web UI",
      },
      generic_openai: {
        description:
          "Data is shared according to the terms of service applicable with your generic endpoint provider.",
      },
      cohere: {
        description:
          "Data is shared according to the terms of service of cohere.com and your localities privacy laws.",
      },
      litellm: {
        description:
          "Your model and chats are only accessible on the server running LiteLLM",
      },
      bedrock: {
        description:
          "You model and chat contents are subject to the agreed EULA for AWS and the model provider on aws.amazon.com",
      },
      deepseek: {
        description: "Your model and chat contents are visible to DeepSeek",
      },
      apipie: {
        description:
          "Your model and chat contents are visible to APIpie in accordance with their terms of service.",
      },
      xai: {
        description:
          "Your model and chat contents are visible to xAI in accordance with their terms of service.",
      },
      ppio: {
        description:
          "Your prompts and document text used in response creation are visible to PPIO",
      },
      dpais: {
        description:
          "Your model and chat contents are only accessible on the computer running Dell Pro AI Studio",
      },
      description: "Your chats will not be used for training",
    },
    embedding: {
      title: "Embedding Preference",
      native: {
        description:
          "Your document text is embedded privately on this instance of AnythingLLM",
      },
      openai: {
        description: "Your document text is sent to OpenAI servers",
      },
      azure: {
        description:
          "Your document text is sent to your Microsoft Azure service",
      },
      localai: {
        description:
          "Your document text is embedded privately on the server running LocalAI",
      },
      ollama: {
        description:
          "Your document text is embedded privately on the server running Ollama",
      },
      lmstudio: {
        description:
          "Your document text is embedded privately on the server running LMStudio",
      },
      cohere: {
        description:
          "Data is shared according to the terms of service of cohere.com and your localities privacy laws.",
      },
      voyageai: {
        description:
          "Data sent to Voyage AI's servers is shared according to the terms of service of voyageai.com.",
      },
      mistral: {
        description:
          "Data sent to Mistral AI's servers is shared according to the terms of service of https://mistral.ai.",
      },
      litellm: {
        description:
          "Your document text is only accessible on the server running LiteLLM and to the providers you configured in LiteLLM.",
      },
      generic_openai: {
        description:
          "Data is shared according to the terms of service applicable with your generic endpoint provider.",
      },
      gemini: {
        description:
          "Your document text is sent to Google Gemini's servers for processing",
        description2:
          "Your document text is stored or managed according to the terms of service of Google Gemini API Terms of Service",
      },
      description: "Your documents are not used for training",
    },
    vector: {
      title: "Vector Database",
      pgvector: {
        description:
          "Your vectors and document text are stored on your PostgreSQL instance",
      },
      chroma: {
        description:
          "Your vectors and document text are stored on your Chroma instance",
      },
      pinecone: {
        description:
          "Your vectors and document text are stored on Pinecone's servers",
        description2: "Access to your data is managed by Pinecone",
      },
      qdrant: {
        description:
          "Your vectors and document text are stored on your Qdrant instance (cloud or self-hosted)",
      },
      weaviate: {
        description:
          "Your vectors and document text are stored on your Weaviate instance (cloud or self-hosted)",
      },
      milvus: {
        description:
          "Your vectors and document text are stored on your Milvus instance (cloud or self-hosted)",
      },
      zilliz: {
        description:
          "Your vectors and document text are stored on your Zilliz cloud cluster.",
      },
      astra: {
        description:
          "Your vectors and document text are stored on your cloud AstraDB database.",
      },
      lancedb: {
        description:
          "Your vectors and document text are stored privately on this instance of AnythingLLM",
      },
      description: "Access to your instance is managed by you",
    },

    anonymous: "Anonymous Telemetry Enabled",
  },

  connectors: {
    "search-placeholder": "Search data connectors",
    "no-connectors": "No data connectors found.",
    obsidian: {
      name: "Obsidian",
      description: "Import Obsidian vault in a single click.",
      vault_location: "Vault Location",
      vault_description:
        "Select your Obsidian vault folder to import all notes and their connections.",
      selected_files: "Found {{count}} markdown files",
      importing: "Importing vault...",
      import_vault: "Import Vault",
      processing_time:
        "This may take a while depending on the size of your vault.",
      vault_warning:
        "To avoid any conflicts, make sure your Obsidian vault is not currently open.",
    },
    github: {
      name: "GitHub Repo",
      description:
        "Import an entire public or private GitHub repository in a single click.",
      URL: "GitHub Repo URL",
      URL_explained: "Url of the GitHub repo you wish to collect.",
      token: "GitHub Access Token",
      optional: "optional",
      token_explained: "Access Token to prevent rate limiting.",
      token_explained_start: "Without a ",
      token_explained_link1: "Personal Access Token",
      token_explained_middle:
        ", the GitHub API may limit the number of files that can be collected due to rate limits. You can ",
      token_explained_link2: "create a temporary Access Token",
      token_explained_end: " to avoid this issue.",
      ignores: "File Ignores",
      git_ignore:
        "List in .gitignore format to ignore specific files during collection. Press enter after each entry you want to save.",
      task_explained:
        "Once complete, all files will be available for embedding into workspaces in the document picker.",
      branch: "Branch you wish to collect files from.",
      branch_loading: "-- loading available branches --",
      branch_explained: "Branch you wish to collect files from.",
      token_information:
        "Without filling out the <b>GitHub Access Token</b> this data connector will only be able to collect the <b>top-level</b> files of the repo due to GitHub's public API rate-limits.",
      token_personal:
        "Get a free Personal Access Token with a GitHub account here.",
    },
    gitlab: {
      name: "GitLab Repo",
      description:
        "Import an entire public or private GitLab repository in a single click.",
      URL: "GitLab Repo URL",
      URL_explained: "URL of the GitLab repo you wish to collect.",
      token: "GitLab Access Token",
      optional: "optional",
      token_explained: "Access Token to prevent rate limiting.",
      token_description:
        "Select additional entities to fetch from the GitLab API.",
      token_explained_start: "Without a ",
      token_explained_link1: "Personal Access Token",
      token_explained_middle:
        ", the GitLab API may limit the number of files that can be collected due to rate limits. You can ",
      token_explained_link2: "create a temporary Access Token",
      token_explained_end: " to avoid this issue.",
      fetch_issues: "Fetch Issues as Documents",
      ignores: "File Ignores",
      git_ignore:
        "List in .gitignore format to ignore specific files during collection. Press enter after each entry you want to save.",
      task_explained:
        "Once complete, all files will be available for embedding into workspaces in the document picker.",
      branch: "Branch you wish to collect files from",
      branch_loading: "-- loading available branches --",
      branch_explained: "Branch you wish to collect files from.",
      token_information:
        "Without filling out the <b>GitLab Access Token</b> this data connector will only be able to collect the <b>top-level</b> files of the repo due to GitLab's public API rate-limits.",
      token_personal:
        "Get a free Personal Access Token with a GitLab account here.",
    },
    youtube: {
      name: "YouTube Transcript",
      description:
        "Import the transcription of an entire YouTube video from a link.",
      URL: "YouTube Video URL",
      URL_explained_start:
        "Enter the URL of any YouTube video to fetch its transcript. The video must have ",
      URL_explained_link: "closed captions",
      URL_explained_end: " available.",
      task_explained:
        "Once complete, the transcript will be available for embedding into workspaces in the document picker.",
      language: "Transcript Language",
      language_explained:
        "Select the language of the transcript you want to collect.",
      loading_languages: "-- loading available languages --",
    },
    "website-depth": {
      name: "Bulk Link Scraper",
      description: "Scrape a website and its sub-links up to a certain depth.",
      URL: "Website URL",
      URL_explained: "URL of the website you want to scrape.",
      depth: "Crawl Depth",
      depth_explained:
        "This is the number of child-links that the worker should follow from the origin URL.",
      max_pages: "Maximum Pages",
      max_pages_explained: "Maximum number of links to scrape.",
      task_explained:
        "Once complete, all scraped content will be available for embedding into workspaces in the document picker.",
    },
    confluence: {
      name: "Confluence",
      description: "Import an entire Confluence page in a single click.",
      deployment_type: "Confluence deployment type",
      deployment_type_explained:
        "Determine if your Confluence instance is hosted on Atlassian cloud or self-hosted.",
      base_url: "Confluence base URL",
      base_url_explained: "This is the base URL of your Confluence space.",
      space_key: "Confluence space key",
      space_key_explained:
        "This is the spaces key of your confluence instance that will be used. Usually begins with ~",
      username: "Confluence Username",
      username_explained: "Your Confluence username",
      auth_type: "Confluence Auth Type",
      auth_type_explained:
        "Select the authentication type you want to use to access your Confluence pages.",
      auth_type_username: "Username and Access Token",
      auth_type_personal: "Personal Access Token",
      token: "Confluence Access Token",
      token_explained_start:
        "You need to provide an access token for authentication. You can generate an access token",
      token_explained_link: "here",
      token_desc: "Access token for authentication",
      pat_token: "Confluence Personal Access Token",
      pat_token_explained: "Your Confluence personal access token.",
      task_explained:
        "Once complete, the page content will be available for embedding into workspaces in the document picker.",
    },

    manage: {
      documents: "Documents",
      "data-connectors": "Data Connectors",
      "desktop-only":
        "Editing these settings are only available on a desktop device. Please access this page on your desktop to continue.",
      dismiss: "Dismiss",
      editing: "Editing",
    },
    directory: {
      "my-documents": "My Documents",
      "new-folder": "New Folder",
      "search-document": "Search for document",
      "no-documents": "No Documents",
      "move-workspace": "Move to Workspace",
      name: "Name",
      "delete-confirmation":
        "Are you sure you want to delete these files and folders?\nThis will remove the files from the system and remove them from any existing workspaces automatically.\nThis action is not reversible.",
      "removing-message":
        "Removing {{count}} documents and {{folderCount}} folders. Please wait.",
      "move-success": "Successfully moved {{count}} documents.",
      date: "Date",
      type: "Type",
      no_docs: "No Documents",
      select_all: "Select All",
      deselect_all: "Deselect All",
      remove_selected: "Remove Selected",
      costs: "*One time cost for embeddings",
      save_embed: "Save and Embed",
    },
    upload: {
      "processor-offline": "Document Processor Unavailable",
      "processor-offline-desc":
        "We can't upload your files right now because the document processor is offline. Please try again later.",
      "click-upload": "Click to upload or drag and drop",
      "file-types":
        "supports text files, csv's, spreadsheets, audio files, and more!",
      "or-submit-link": "or submit a link",
      "placeholder-link": "https://example.com",
      fetching: "Fetching...",
      "fetch-website": "Fetch website",
      "privacy-notice":
        "These files will be uploaded to the document processor running on this AnythingLLM instance. These files are not sent or shared with a third party.",
    },
    pinning: {
      what_pinning: "What is document pinning?",
      pin_explained_block1:
        "When you <b>pin</b> a document in AnythingLLM we will inject the entire content of the document into your prompt window for your LLM to fully comprehend.",
      pin_explained_block2:
        "This works best with <b>large-context models</b> or small files that are critical to its knowledge-base.",
      pin_explained_block3:
        "If you are not getting the answers you desire from AnythingLLM by default then pinning is a great way to get higher quality answers in a click.",
      accept: "Okay, got it",
    },
    watching: {
      what_watching: "What does watching a document do?",
      watch_explained_block1:
        "When you <b>watch</b> a document in AnythingLLM we will <i>automatically</i> sync your document content from it's original source on regular intervals. This will automatically update the content in every workspace where this file is managed.",
      watch_explained_block2:
        "This feature currently supports online-based content and will not be available for manually uploaded documents.",
      watch_explained_block3_start:
        "You can manage what documents are watched from the ",
      watch_explained_block3_link: "File manager",
      watch_explained_block3_end: " admin view.",
      accept: "Okay, got it",
    },
  },

  chat_window: {
    welcome: "Welcome to your new workspace.",
    get_started: "To get started either",
    get_started_default: "To get started",
    upload: "upload a document",
    or: "or",
    attachments_processing: "Attachments are processing. Please wait...",
    send_chat: "send a chat.",
    send_message: "Send a message",
    attach_file: "Attach a file to this chat",
    slash: "View all available slash commands for chatting.",
    agents: "View all available agents you can use for chatting.",
    text_size: "Change text size.",
    microphone: "Speak your prompt.",
    send: "Send prompt message to workspace",
    tts_speak_message: "TTS Speak message",
    copy: "Copy",
    regenerate: "Regenerate",
    regenerate_response: "Regenerate response",
    good_response: "Good response",
    more_actions: "More actions",
    hide_citations: "Hide citations",
    show_citations: "Show citations",
    pause_tts_speech_message: "Pause TTS speech of message",
    fork: "Fork",
    delete: "Delete",
    save_submit: "Save & Submit",
    cancel: "Cancel",
    edit_prompt: "Edit prompt",
    edit_response: "Edit response",
    at_agent: "@agent",
    default_agent_description: " - the default agent for this workspace.",
    custom_agents_coming_soon: "custom agents are coming soon!",
    slash_reset: "/reset",
    preset_reset_description: "Clear your chat history and begin a new chat",
    add_new_preset: " Add New Preset",
    command: "Command",
    your_command: "your-command",
    placeholder_prompt:
      "This is the content that will be injected in front of your prompt.",
    description: "Description",
    placeholder_description: "Responds with a poem about LLMs.",
    save: "Save",
    small: "Small",
    normal: "Normal",
    large: "Large",
    workspace_llm_manager: {
      search: "Search LLM providers",
      loading_workspace_settings: "Loading workspace settings...",
      available_models: "Available Models for {{provider}}",
      available_models_description: "Select a model to use for this workspace.",
      save: "Use this model",
      saving: "Setting model as workspace default...",
      missing_credentials: "This provider is missing credentials!",
      missing_credentials_description: "Click to set up credentials",
    },
  },

  profile_settings: {
    edit_account: "Edit Account",
    profile_picture: "Profile Picture",
    remove_profile_picture: "Remove Profile Picture",
    username: "Username",
    username_description:
      "Username must be only contain lowercase letters, numbers, underscores, and hyphens with no spaces",
    new_password: "New Password",
    passwort_description: "Password must be at least 8 characters long",
    cancel: "Cancel",
    update_account: "Update Account",
    theme: "Theme Preference",
    language: "Preferred language",
    failed_upload: "Failed to upload profile picture: {{error}}",
    upload_success: "Profile picture uploaded.",
    failed_remove: "Failed to remove profile picture: {{error}}",
    profile_updated: "Profile updated.",
    failed_update_user: "Failed to update user: {{error}}",
    account: "Account",
    support: "Support",
    signout: "Sign out",
  },

  "keyboard-shortcuts": {
    title: "Keyboard Shortcuts",
    shortcuts: {
      settings: "Open Settings",
      workspaceSettings: "Open Current Workspace Settings",
      home: "Go to Home",
      workspaces: "Manage Workspaces",
      apiKeys: "API Keys Settings",
      llmPreferences: "LLM Preferences",
      chatSettings: "Chat Settings",
      help: "Show keyboard shortcuts help",
      showLLMSelector: "Show workspace LLM Selector",
    },
  },
  community_hub: {
    publish: {
      system_prompt: {
        success_title: "Success!",
        success_description:
          "Your System Prompt has been published to the Community Hub!",
        success_thank_you: "Thank you for sharing to the Community!",
        view_on_hub: "View on Community Hub",
        modal_title: "Publish System Prompt",
        name_label: "Name",
        name_description: "This is the display name of your system prompt.",
        name_placeholder: "My System Prompt",
        description_label: "Description",
        description_description:
          "This is the description of your system prompt. Use this to describe the purpose of your system prompt.",
        tags_label: "Tags",
        tags_description:
          "Tags are used to label your system prompt for easier searching. You can add multiple tags. Max 5 tags. Max 20 characters per tag.",
        tags_placeholder: "Type and press Enter to add tags",
        visibility_label: "Visibility",
        public_description: "Public system prompts are visible to everyone.",
        private_description: "Private system prompts are only visible to you.",
        publish_button: "Publish to Community Hub",
        submitting: "Publishing...",
        submit: "Publish to Community Hub",
        prompt_label: "Prompt",
        prompt_description:
          "This is the actual system prompt that will be used to guide the LLM.",
        prompt_placeholder: "Enter your system prompt here...",
      },
      agent_flow: {
        public_description: "Public agent flows are visible to everyone.",
        private_description: "Private agent flows are only visible to you.",
        success_title: "Success!",
        success_description:
          "Your Agent Flow has been published to the Community Hub!",
        success_thank_you: "Thank you for sharing to the Community!",
        view_on_hub: "View on Community Hub",
        modal_title: "Publish Agent Flow",
        name_label: "Name",
        name_description: "This is the display name of your agent flow.",
        name_placeholder: "My Agent Flow",
        description_label: "Description",
        description_description:
          "This is the description of your agent flow. Use this to describe the purpose of your agent flow.",
        tags_label: "Tags",
        tags_description:
          "Tags are used to label your agent flow for easier searching. You can add multiple tags. Max 5 tags. Max 20 characters per tag.",
        tags_placeholder: "Type and press Enter to add tags",
        visibility_label: "Visibility",
        publish_button: "Publish to Community Hub",
        submitting: "Publishing...",
        submit: "Publish to Community Hub",
        privacy_note:
          "Agent flows are always uploaded as private to protect any sensitive data. You can change the visibility in the Community Hub after publishing. Please verify your flow does not contain any sensitive or private information before publishing.",
      },
      slash_command: {
        success_title: "Success!",
        success_description:
          "Your Slash Command has been published to the Community Hub!",
        success_thank_you: "Thank you for sharing to the Community!",
        view_on_hub: "View on Community Hub",
        modal_title: "Publish Slash Command",
        name_label: "Name",
        name_description: "This is the display name of your slash command.",
        name_placeholder: "My Slash Command",
        description_label: "Description",
        description_description:
          "This is the description of your slash command. Use this to describe the purpose of your slash command.",
        command_label: "Command",
        command_description:
          "This is the slash command that users will type to trigger this preset.",
        command_placeholder: "my-command",
        tags_label: "Tags",
        tags_description:
          "Tags are used to label your slash command for easier searching. You can add multiple tags. Max 5 tags. Max 20 characters per tag.",
        tags_placeholder: "Type and press Enter to add tags",
        visibility_label: "Visibility",
        public_description: "Public slash commands are visible to everyone.",
        private_description: "Private slash commands are only visible to you.",
        publish_button: "Publish to Community Hub",
        submitting: "Publishing...",
        prompt_label: "Prompt",
        prompt_description:
          "This is the prompt that will be used when the slash command is triggered.",
        prompt_placeholder: "Enter your prompt here...",
      },
      generic: {
        unauthenticated: {
          title: "Authentication Required",
          description:
            "You need to authenticate with the AnythingLLM Community Hub before publishing items.",
          button: "Connect to Community Hub",
        },
      },
    },
  },
};

export default TRANSLATIONS;
