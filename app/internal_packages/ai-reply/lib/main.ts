import { localized, PreferencesUIStore, ComponentRegistry } from 'mailspring-exports';
import AIReplyComposerButton from './composer-button';
import PreferencesAIReply from './preferences-ai-reply';

let preferencesTab: any | null = null;

export function activate() {
  preferencesTab = new PreferencesUIStore.TabItem({
    tabId: 'AIReply',
    displayName: localized('AI Reply'),
    componentClassFn: () => PreferencesAIReply,
    order: 7,
  });

  ComponentRegistry.register(AIReplyComposerButton, {
    role: 'Composer:ActionButton',
  });

  PreferencesUIStore.registerPreferencesTab(preferencesTab);
}

export function deactivate() {
  ComponentRegistry.unregister(AIReplyComposerButton);
  if (preferencesTab) {
    PreferencesUIStore.unregisterPreferencesTab(preferencesTab.tabId);
  }
}

export function serialize() {
  return {};
}
