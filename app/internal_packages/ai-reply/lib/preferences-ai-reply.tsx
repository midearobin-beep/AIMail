import React, { useEffect, useState } from 'react';
import { localized, KeyManager } from 'mailspring-exports';
import { setApiKey, testConnection } from './ai-service';

declare const AppEnv: any;

type ConfigLike = {
  get: (key: string) => any;
  set: (key: string, value: any) => void;
};

type Props = {
  config: ConfigLike;
};

const PreferencesAIReply: React.FC<Props> = ({ config }) => {
  const [apiKey, setApiKeyState] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [testStatus, setTestStatus] = useState<null | 'testing' | 'success' | 'error'>(null);

  useEffect(() => {
    let cancelled = false;
    KeyManager.getPassword('ai-reply-api-key').then((key) => {
      if (!cancelled) {
        setApiKeyState(key || '');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleApiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setApiKeyState(event.target.value);
  };

  const handleApiKeyBlur = async () => {
    await setApiKey(apiKey);
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    try {
      await setApiKey(apiKey);
      await testConnection({
        provider: config.get('core.aiReply.provider') || 'openai',
        model: config.get('core.aiReply.model'),
        customEndpoint: config.get('core.aiReply.customEndpoint'),
      });
      setTestStatus('success');
    } catch (err: any) {
      setTestStatus('error');
      AppEnv.showErrorDialog({
        title: localized('Connection Test Failed'),
        message: err.message || localized('Could not connect to the AI API.'),
      });
    }
  };

  const provider = config.get('core.aiReply.provider') || 'openai';

  return (
    <div className="preferences-ai-reply container-general">
      <section>
        <div className="section-title">{localized('AI Reply Settings')}</div>

        <div className="item">
          <label htmlFor="ai-reply-enabled">
            <input
              type="checkbox"
              id="ai-reply-enabled"
              checked={config.get('core.aiReply.enabled')}
              onChange={(e) => config.set('core.aiReply.enabled', e.target.checked)}
            />
            {localized('Enable AI Reply')}
          </label>
        </div>

        <div className="item">
          <label>{localized('Provider:')}</label>
          <select
            value={provider}
            onChange={(e) => config.set('core.aiReply.provider', e.target.value)}
          >
            <option value="openai">OpenAI</option>
            <option value="custom">{localized('Custom (OpenAI-compatible)')}</option>
          </select>
        </div>

        <div className="item">
          <label>{localized('API Key:')}</label>
          <div className="row">
            <input
              type={apiKeyVisible ? 'text' : 'password'}
              value={apiKey}
              onChange={handleApiKeyChange}
              onBlur={handleApiKeyBlur}
              placeholder={localized('Enter your API key')}
              style={{ width: 300 }}
            />
            <button className="btn btn-small" onClick={() => setApiKeyVisible(!apiKeyVisible)}>
              {apiKeyVisible ? localized('Hide') : localized('Show')}
            </button>
          </div>
          <div className="note">
            {localized('Your API key is stored securely using your system keychain.')}
          </div>
        </div>

        <div className="item">
          <label>{localized('Model:')}</label>
          <input
            type="text"
            value={config.get('core.aiReply.model') || ''}
            onChange={(e) => config.set('core.aiReply.model', e.target.value)}
            placeholder="gpt-4o-mini"
            style={{ width: 300 }}
          />
        </div>

        {provider === 'custom' && (
          <div className="item">
            <label>{localized('Custom API Endpoint:')}</label>
            <input
              type="text"
              value={config.get('core.aiReply.customEndpoint') || ''}
              onChange={(e) => config.set('core.aiReply.customEndpoint', e.target.value)}
              placeholder="https://api.openai.com/v1/chat/completions"
              style={{ width: 400 }}
            />
          </div>
        )}

        <div className="item">
          <label>{localized('Custom System Prompt:')}</label>
          <textarea
            value={config.get('core.aiReply.customPrompt') || ''}
            onChange={(e) => config.set('core.aiReply.customPrompt', e.target.value)}
            placeholder={localized('Instructions for the AI on how to write replies...')}
            rows={4}
            style={{ width: 400 }}
          />
        </div>

        <div className="item">
          <button
            className="btn"
            onClick={handleTestConnection}
            disabled={testStatus === 'testing'}
          >
            {testStatus === 'testing' ? localized('Testing...') : localized('Test Connection')}
          </button>
          {testStatus === 'success' && (
            <span style={{ color: 'green', marginLeft: 10 }}>
              {localized('Connection successful!')}
            </span>
          )}
          {testStatus === 'error' && (
            <span style={{ color: 'red', marginLeft: 10 }}>{localized('Connection failed.')}</span>
          )}
        </div>
      </section>

      <section style={{ marginTop: 30 }}>
        <div className="section-title">{localized('How to Use')}</div>
        <p>
          {localized(
            'Open any email thread, click Reply, and then click the AI Reply button in the composer toolbar. The AI will analyze the conversation and generate a draft reply for you to edit and send.'
          )}
        </p>
      </section>
    </div>
  );
};

PreferencesAIReply.displayName = 'PreferencesAIReply';

export default PreferencesAIReply;
