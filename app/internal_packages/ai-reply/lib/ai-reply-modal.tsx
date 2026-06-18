import React from 'react';
import { Actions, localized, Message } from 'mailspring-exports';
import { generateReply } from './ai-service';

declare const AppEnv: any;
const { clipboard } = require('electron');

interface AIReplyModalProps {
  messages: Message[];
  myEmail?: string;
  onClose?: () => void;
}

type Step = 'analyzing' | 'answering' | 'generating' | 'refining';

interface AIReplyModalState {
  step: Step;
  error?: string;
  mode: string;
}

export default class AIReplyModal extends React.Component<AIReplyModalProps, AIReplyModalState> {
  private editorRef = React.createRef<HTMLDivElement>();

  constructor(props: AIReplyModalProps) {
    super(props);
    const config = AppEnv.config;
    const mode = config.get('core.aiReply.mode') || 'auto';
    this.state = {
      mode,
      step: mode === 'guided' ? 'analyzing' : 'generating',
    };
  }

  componentDidMount() {
    this.applyLiquidGlassStyles();
    
    if (this.state.mode === 'guided') {
      this.startAnalysis();
    } else {
      this.startGeneration();
    }
  }

  private applyLiquidGlassStyles() {
    if (this.editorRef.current) {
      const modalNode = this.editorRef.current.closest('.modal') as HTMLElement;
      if (modalNode) {
        // Hide default Mailspring close button
        const closeBtn = modalNode.querySelector('.modal-close') as HTMLElement;
        if (closeBtn) closeBtn.style.display = 'none';

        // Apply Liquid Glass UI
        modalNode.style.setProperty('background-color', 'rgba(255, 255, 255, 0.65)', 'important');
        modalNode.style.setProperty('backdrop-filter', 'blur(24px) saturate(1.5)', 'important');
        modalNode.style.setProperty('-webkit-backdrop-filter', 'blur(24px) saturate(1.5)', 'important');
        modalNode.style.setProperty('border-radius', '16px', 'important');
        modalNode.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.4)', 'important');
        modalNode.style.setProperty('box-shadow', '0 25px 50px -12px rgba(0, 0, 0, 0.25)', 'important');
        modalNode.style.setProperty('overflow', 'hidden', 'important'); // Keep blur within rounded corners
      }
    }
  }

  private runGeneration = async (customPrompt?: string, nextStep?: Step) => {
    this.setState({ error: undefined });
    
    if (this.editorRef.current) {
      this.editorRef.current.innerHTML = '';
    }
    
    try {
      const config = AppEnv.config;
      const provider = config.get('core.aiReply.provider') || 'openai';
      const model = config.get('core.aiReply.model');
      const customEndpoint = config.get('core.aiReply.customEndpoint');
      const defaultCustomPrompt = config.get('core.aiReply.customPrompt');

      await generateReply(
        this.props.messages,
        this.props.myEmail,
        {
          provider,
          model,
          customEndpoint,
          customPrompt: customPrompt || defaultCustomPrompt,
          onProgress: (chunk, fullText) => {
            if (this.editorRef.current) {
              this.editorRef.current.innerHTML = fullText.replace(/\n/g, '<br>');
            }
          }
        }
      );
      if (nextStep) {
        this.setState({ step: nextStep });
      }
    } catch (err: any) {
      this.setState({ error: err.message, step: 'refining' });
    }
  };

  private startAnalysis = () => {
    this.setState({ step: 'analyzing' });
    const prompt = `You are a helpful email assistant. Your task is to analyze the email thread. Generate a brief outline of the 3-5 most important questions or points the user needs to provide to write a comprehensive reply. Format as a numbered list. DO NOT write the actual reply email.
IMPORTANT: Please output this outline entirely in Chinese (Simplified).`;
    this.runGeneration(prompt, 'answering');
  };

  private startGeneration = () => {
    this.setState({ step: 'generating' });
    this.runGeneration(undefined, 'refining');
  };

  private handleGenerateDraft = () => {
    if (!this.editorRef.current) return;
    this.setState({ step: 'generating' });
    const html = this.editorRef.current.innerHTML;
    const prompt = `You are a helpful email assistant. The user has provided an outline of questions/points along with their answers marked in red font (<font color="red"> or style="color: red").
Please write a complete, professional email reply based on the thread context and the user's answers. Output ONLY the email text. Do not include any headers like "Subject:" or "To:". Do not output HTML tags.
CRITICAL INSTRUCTION: The user's outline and answers are in Chinese, but you MUST write the final generated email in the SAME LANGUAGE as the original email thread received from the customer.

User's Outline and Answers:
${html}`;
    this.runGeneration(prompt, 'refining');
  };

  private handleRegenerate = () => {
    if (!this.editorRef.current) return;
    this.setState({ step: 'generating' });
    const html = this.editorRef.current.innerHTML;
    const prompt = `You are a helpful email assistant. The user has reviewed your draft and added inline comments or instructions, which are marked in red font (<font color="red"> or style="color: red").
Please rewrite the draft incorporating the user's inline instructions. Output only the plain text of the final revised email. Do not output HTML tags unless necessary for standard email formatting. Do not include the red text directly in the final output.
CRITICAL INSTRUCTION: The user's instructions are in Chinese, but you MUST write the final generated email in the SAME LANGUAGE as the original email thread received from the customer.

Draft with User Comments:
${html}`;
    this.runGeneration(prompt, 'refining');
  };

  private handleCopy = () => {
    if (this.editorRef.current) {
      const text = this.editorRef.current.innerText || '';
      clipboard.writeText(text);
      Actions.closeModal();
    }
  };

  private enforceRedColor = () => {
    document.execCommand('foreColor', false, '#ff3b30'); // macOS red
  };

  render() {
    const { step, error } = this.state;
    const isBusy = step === 'analyzing' || step === 'generating';

    let title = localized('AI Reply Draft');
    let hint = localized('Click anywhere to add instructions (text will be red).');
    
    if (step === 'analyzing') {
      title = localized('Analyzing Thread...');
      hint = '';
    } else if (step === 'answering') {
      title = localized('Provide Reply Details');
      hint = localized('Answer the questions above by typing (your text will appear in red).');
    } else if (step === 'generating') {
      title = localized('Generating Draft...');
      hint = '';
    }

    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
        
        {/* macOS Traffic Lights */}
        <div style={{ display: 'flex', gap: '8px', padding: '0 0 15px 0' }}>
          <div onClick={() => Actions.closeModal()} style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ff5f56', cursor: 'pointer', border: '1px solid #e0443e' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ffbd2e', border: '1px solid #dea123' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#27c93f', border: '1px solid #1aab29' }} />
        </div>

        <h2 style={{ marginTop: 0, marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '18px', fontWeight: 600, color: 'rgba(0,0,0,0.85)' }}>
          <span>{title}</span>
          {isBusy && <span style={{ fontSize: '13px', color: 'rgba(0,0,0,0.5)', fontWeight: 'normal' }}>{localized('Please wait...')}</span>}
        </h2>
        
        {error && (
          <div style={{ color: '#ff3b30', marginBottom: '10px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
          <div
            ref={this.editorRef}
            contentEditable={!isBusy}
            onKeyDown={this.enforceRedColor}
            onClick={this.enforceRedColor}
            onKeyUp={this.enforceRedColor}
            style={{
              flex: 1,
              padding: '16px',
              overflowY: 'auto',
              outline: 'none',
              lineHeight: '1.6',
              fontSize: '14px',
              backgroundColor: 'rgba(255, 255, 255, 0.4)',
              borderRadius: '12px',
              color: 'rgba(0,0,0,0.85)',
              whiteSpace: 'pre-wrap',
              border: '1px solid rgba(255,255,255,0.6)',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
              transition: 'background-color 0.3s',
            }}
          />
          {!isBusy && (
            <div style={{ position: 'absolute', bottom: '-24px', left: '4px', fontSize: '12px', color: 'rgba(0,0,0,0.45)' }}>
              {hint}
            </div>
          )}
        </div>

        <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={() => Actions.closeModal()}
            style={this.getPillStyle(false, false)}
          >
            {localized('Cancel')}
          </button>

          {step === 'answering' && (
            <button
              onClick={this.handleGenerateDraft}
              disabled={isBusy}
              style={this.getPillStyle(true, isBusy)}
            >
              {localized('Generate Draft')}
            </button>
          )}

          {step === 'refining' && (
            <button
              onClick={this.handleRegenerate}
              disabled={isBusy}
              style={this.getPillStyle(false, isBusy)}
            >
              {localized('Regenerate')}
            </button>
          )}

          {step === 'refining' && (
            <button
              onClick={this.handleCopy}
              disabled={isBusy}
              style={this.getPillStyle(true, isBusy)}
            >
              {localized('Copy to Clipboard')}
            </button>
          )}
        </div>
      </div>
    );
  }

  private getPillStyle(primary: boolean, disabled: boolean): React.CSSProperties {
    return {
      padding: '8px 20px',
      borderRadius: '20px',
      border: primary ? 'none' : '1px solid rgba(0,0,0,0.1)',
      backgroundColor: primary ? '#007aff' : 'rgba(255,255,255,0.6)',
      color: primary ? 'white' : 'rgba(0,0,0,0.75)',
      fontSize: '13px',
      fontWeight: 500,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      boxShadow: primary ? '0 4px 12px rgba(0, 122, 255, 0.25)' : '0 2px 5px rgba(0,0,0,0.02)',
      outline: 'none',
      transition: 'all 0.2s ease',
    };
  }
}
