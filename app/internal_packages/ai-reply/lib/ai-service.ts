import {
  KeyManager,
  localized,
  Utils,
  QuotedHTMLTransformer,
  Thread,
  Message,
} from 'mailspring-exports';

const KEY_NAME = 'ai-reply-api-key';

interface AIProviderConfig {
  name: string;
  defaultEndpoint: string;
  defaultModel: string;
  headers: (apiKey: string) => Record<string, string>;
  formatBody: (messages: ThreadMessage[], model: string, systemPrompt: string) => unknown;
  extractResponse: (json: any) => string | undefined;
}

interface ThreadMessage {
  role: 'user' | 'assistant';
  content: string;
  sender: string;
}

interface GenerateOptions {
  provider?: string;
  model?: string;
  customEndpoint?: string;
  customPrompt?: string;
  selectedText?: string;
}

const AI_PROVIDERS: Record<string, AIProviderConfig> = {
  openai: {
    name: 'OpenAI',
    defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
    formatBody: (messages, model, systemPrompt) => ({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.7,
      max_tokens: 2000,
    }),
    extractResponse: (json) => json.choices?.[0]?.message?.content,
  },
  custom: {
    name: 'Custom',
    defaultEndpoint: '',
    defaultModel: '',
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
    formatBody: (messages, model, systemPrompt) => ({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.7,
      max_tokens: 2000,
    }),
    extractResponse: (json) => json.choices?.[0]?.message?.content,
  },
};

function buildSystemPrompt(
  customPrompt?: string,
  selectedText?: string,
  hasThread?: boolean
): string {
  if (selectedText) {
    if (hasThread) {
      return `You are a helpful email assistant. The user has selected a portion of their draft to improve/translate.
Your task is to:
1. Improve the selected text by fixing any grammar or spelling mistakes.
2. Ensure the tone is professional, clear, and matches the email thread context.
3. If the selected text's language is different from the language of the email thread, translate the improved text into the language used in the email thread. Otherwise, keep it in the same language.
4. Output ONLY the improved/translated text. Do not include any introductory phrases, explanations, markdown quotes, formatting, or email headers. Output only the plain text to replace the selection.`;
    } else {
      return `You are a helpful email assistant. The user has selected a portion of their draft to improve.
Your task is to:
1. Improve the selected text by fixing any grammar or spelling mistakes.
2. Ensure the tone is professional and clear.
3. Output ONLY the improved text. Do not include any introductory phrases, explanations, markdown quotes, formatting, or email headers. Output only the plain text to replace the selection.`;
    }
  }
  return (
    customPrompt ||
    localized(
      `You are a helpful email assistant. Write a professional, concise reply to the email thread below. Match the tone of the conversation. Do not include signatures unless they are part of the quoted thread. Respond in the same language as the thread. Do not include any headers like "Subject:", "From:", "To:", "Date:", or "Re:" in your response. Generate ONLY the email body itself.`
    )
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function replyTextToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br>').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
}

function extractCleanTextFromMessage(message: Message): string {
  if (!message.body) {
    return '';
  }
  const plain = Utils.extractTextFromHtml(message.body);
  const clean = QuotedHTMLTransformer.removeQuotedHTML(plain);
  return clean.trim();
}

export function buildThreadContext(messages: Message[], myEmail?: string): ThreadMessage[] {
  return messages.map((message) => {
    const isFromMe = message.from.some((contact: any) => contact.email === myEmail);
    const cleanText = extractCleanTextFromMessage(message);
    const sender = message.from.map((c: any) => c.toString()).join(', ');
    return {
      role: isFromMe ? 'assistant' : 'user',
      content: `From: ${sender}\nSubject: ${message.subject || ''}\nDate: ${message.date}\n\n${cleanText}`,
      sender,
    };
  });
}

export async function getApiKey(): Promise<string | undefined> {
  return KeyManager.getPassword(KEY_NAME);
}

export async function setApiKey(apiKey: string): Promise<void> {
  if (apiKey) {
    await KeyManager.replacePassword(KEY_NAME, apiKey);
  } else {
    await KeyManager.deletePassword(KEY_NAME);
  }
}

export async function generateReply(
  messages: Message[],
  myEmail: string | undefined,
  options: GenerateOptions = {}
): Promise<string> {
  const { provider = 'openai', model, customEndpoint, customPrompt, selectedText } = options;

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error(
      localized('AI API key not configured. Please add it in Preferences > AI Reply.')
    );
  }

  const providerConfig = AI_PROVIDERS[provider] || AI_PROVIDERS.openai;
  const endpoint = customEndpoint || providerConfig.defaultEndpoint;
  const selectedModel = model || providerConfig.defaultModel;

  if (provider === 'custom' && !endpoint) {
    throw new Error(localized('Custom provider requires an API endpoint.'));
  }
  if (!selectedModel) {
    throw new Error(localized('Please configure an AI model.'));
  }

  const hasThread = messages && messages.length > 0;
  const systemPrompt = buildSystemPrompt(customPrompt, selectedText, hasThread);
  const threadMessages = buildThreadContext(messages, myEmail);

  if (selectedText) {
    if (hasThread) {
      threadMessages.push({
        role: 'user',
        content: `Based on the thread context above, improve and translate (if necessary) this selected text from my draft: "${selectedText}". Correct any spelling or grammar errors. Return ONLY the improved text.`,
        sender: 'user',
      });
    } else {
      threadMessages.push({
        role: 'user',
        content: `Improve this selected text from my draft: "${selectedText}". Correct any spelling or grammar errors. Return ONLY the improved text.`,
        sender: 'user',
      });
    }
  }

  const body = providerConfig.formatBody(threadMessages, selectedModel, systemPrompt);
  const headers = providerConfig.headers(apiKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(localized('AI API error %@: %@', response.status, errorText));
    }

    const json = await response.json();
    const replyText = providerConfig.extractResponse(json);

    if (!replyText) {
      throw new Error(localized('The AI returned an empty response.'));
    }

    const cleanedText = replyText
      .replace(/^(?:Subject|From|To|Date|Re)\s*:[^\n]*\n?/gim, '')
      .replace(/^(?:Re)\s*:[^\n]*\n?/gim, '')
      .trim();

    return cleanedText;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(
        localized('AI request timed out. Please check your connection and try again.')
      );
    }
    throw err;
  }
}

export async function testConnection(options: GenerateOptions = {}): Promise<void> {
  const { provider = 'openai', model, customEndpoint } = options;
  const providerConfig = AI_PROVIDERS[provider] || AI_PROVIDERS.openai;
  const endpoint = customEndpoint || providerConfig.defaultEndpoint;
  const selectedModel = model || providerConfig.defaultModel;

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error(localized('AI API key not configured.'));
  }

  const body = providerConfig.formatBody(
    [{ role: 'user', content: 'Hi', sender: 'test' }],
    selectedModel,
    'You are a helpful assistant. Reply with only the word "OK".'
  );
  const headers = providerConfig.headers(apiKey);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(localized('AI API error %@: %@', response.status, errorText));
  }
}
