import React, { useState } from 'react';
import { Message, DraftEditingSession, localized, DatabaseStore, Actions } from 'mailspring-exports';
import { RetinaImg, Spinner } from 'mailspring-component-kit';
import { generateReply } from './ai-service';
import AIReplyModal from './ai-reply-modal';

declare const AppEnv: any;

type Props = { draft: Message; session: DraftEditingSession };

// Removed QUOTE_MARKERS and findInsertionPoint since we're using a modal

async function fetchThreadMessages(threadId: string): Promise<Message[]> {
  const { Message: MessageModel } = await import('mailspring-exports');
  const messages = await DatabaseStore.findAll(MessageModel)
    .where({ threadId })
    .include(MessageModel.attributes.body);
  return messages as Message[];
}

const AIReplyComposerButtonInner: React.FC<Props> = ({ draft, session }) => {
  const [isLoading, setIsLoading] = useState(false);

  if (draft.plaintext) {
    return <span />;
  }

  const handleClick = async () => {
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';
    const isSelectionMode = selectedText.length > 0;

    const editor = session._mountedEditor;
    const originalSelection = editor ? editor.value.selection : null;

    if (!isSelectionMode && !draft.threadId) {
      AppEnv.showErrorDialog({
        title: localized('AI Reply'),
        message: localized('Cannot generate reply: no thread context available.'),
      });
      return;
    }

    setIsLoading(true);
    try {
      let messages: Message[] = [];
      if (draft.threadId) {
        messages = await fetchThreadMessages(draft.threadId);
      }

      if (!isSelectionMode && (!messages || messages.length === 0)) {
        throw new Error(localized('No messages found in this thread.'));
      }

      if (isSelectionMode) {
        setIsLoading(true);
        const config = AppEnv.config;
        const provider = config.get('core.aiReply.provider') || 'openai';
        const model = config.get('core.aiReply.model');
        const customEndpoint = config.get('core.aiReply.customEndpoint');
        const customPrompt = config.get('core.aiReply.customPrompt');

        const replyText = await generateReply(messages, draft.from[0]?.email, {
          provider,
          model,
          customEndpoint,
          customPrompt,
          selectedText,
        });

        if (editor && originalSelection) {
          editor.select(originalSelection);
        }
        document.execCommand('insertText', false, replyText);
        if (editor) {
          editor.focus();
        }
      } else {
        // Full reply generation: show the iterative modal instead of injecting directly into Slate
        Actions.openModal({
          component: <AIReplyModal messages={messages} myEmail={draft.from[0]?.email} />,
          width: 700,
          height: 500,
        });
      }
    } catch (err: any) {
      AppEnv.showErrorDialog({
        title: localized('AI Reply Error'),
        message: err.message || localized('An unknown error occurred.'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      tabIndex={-1}
      className="btn btn-toolbar btn-ai-reply narrow pull-right"
      onClick={handleClick}
      onMouseDown={(e) => e.preventDefault()}
      title={localized('Generate AI Reply')}
      aria-label={localized('Generate AI Reply')}
      disabled={isLoading}
    >
      {isLoading ? (
        <Spinner style={{ width: 14, height: 14 }} />
      ) : (
        <RetinaImg
          url="mailspring://ai-reply/assets/icon-composer-ai-reply@2x.png"
          mode={RetinaImg.Mode.ContentIsMask}
          aria-hidden="true"
        />
      )}
      &nbsp;
      {localized('AI Reply')}
    </button>
  );
};

const AIReplyComposerButton = Object.assign(
  React.memo(AIReplyComposerButtonInner, (prev, next) => prev.draft === next.draft),
  { containerRequired: false as const }
);
AIReplyComposerButton.displayName = 'AIReplyComposerButton';

export default AIReplyComposerButton;
