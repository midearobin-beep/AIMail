import MailspringStore from 'mailspring-store';

import url from 'url';
import querystring from 'querystring';

import * as Utils from '../models/utils';
import * as Actions from '../actions';
import KeyManager from '../../key-manager';
import { makeRequest, rootURLForServer } from '../mailspring-api-request';
import { Disposable } from 'event-kit';
import { debounce } from 'underscore';

// Note this key name is used when migrating to Mailspring Pro accounts from old N1.
const PASSWORD_NAME = 'Mailspring Account';

export interface IIdentity {
  id: string;
  token: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  stripePlan: string;
  stripePlanEffective: string;
  featureUsage: {
    [featureKey: string]: {
      featureLimitName: 'pro';
      usedInPeriod: number;
      quota: number;
      period: 'weekly' | 'monthly';
    };
  };
  createdAt?: string;
  updatedAt?: string;
}

export type IdentityAuthResponse = IIdentity | { skipped: true };

export const EMPTY_FEATURE_USAGE = {
  featureLimitName: 'pro',
  period: 'monthly',
  usedInPeriod: 0,
  quota: 0,
};

class _IdentityStore extends MailspringStore {
  _identity: IIdentity = {
    id: 'aimail-local-user',
    token: 'aimail-local-token',
    firstName: 'AIMail',
    lastName: 'User',
    emailAddress: 'local@aimail.local',
    stripePlan: 'pro',
    stripePlanEffective: 'pro',
    featureUsage: {},
    createdAt: '2026-06-15T00:00:00Z',
    updatedAt: '2026-06-15T00:00:00Z',
  };
  _displayedPasswordError = false;
  _disp: Disposable;

  constructor() {
    super();

    if (AppEnv.isEmptyWindow()) {
      AppEnv.onWindowPropsReceived(() => {
        this._onIdentityChanged();
      });
      return;
    }

    AppEnv.config.onDidChange('identity', this._onIdentityChanged);
    this._onIdentityChanged();

    this.listenTo(Actions.logoutMailspringIdentity, this._onLogoutMailspringIdentity);
  }

  deactivate() {
    if (this._disp) this._disp.dispose();
    this.stopListeningToAll();
  }

  identity() {
    return Utils.deepClone(this._identity);
  }

  identityId() {
    return 'aimail-local-user';
  }

  hasProFeatures() {
    return true;
  }

  _fetchAndPollRemoteIdentity() {
    // No-op for local-only AIMail
  }

  async saveIdentity(identity: IIdentity | null) {
    if (!identity) {
      this._identity = null;
      AppEnv.config.set('identity', null);
      return;
    }

    this._identity = identity;
    AppEnv.config.set('identity', identity);
  }

  /**
   * When the identity changes in the database, update our local store
   * cache and set the token from the keychain.
   */
  _onIdentityChanged = async () => {
    // Keep using the mock identity locally without querying keychain
    this.trigger();
  };

  _onLogoutMailspringIdentity = async () => {
    // Do not touch the keychain or restart the app during specs.
    if (AppEnv.inSpecMode()) return;
    await this.saveIdentity(null);
    // We need to relaunch the app to clear the webview session
    // and prevent the webview from re signing in with the same MailspringID
    require('@electron/remote').app.relaunch();
    require('@electron/remote').app.quit();
  };

  /**
   * This passes utm_source, utm_campaign, and utm_content params to the
   * Mailspring billing site. Please reference:
   * https://paper.dropbox.com/doc/Analytics-ID-Unification-oVDTkakFsiBBbk9aeuiA3
   * for the full list of utm_ labels.
   */
  async fetchSingleSignOnURL(
    path: string,
    { source, campaign, content }: { source?: string; campaign?: string; content?: string } = {}
  ) {
    return Promise.reject(new Error('Single Sign On is disabled in offline mode.'));
  }

  fetchIdentitySoon = debounce(() => this.fetchIdentity(), 5000, true);

  async fetchIdentity() {
    return this._identity;
  }
}

export const IdentityStore = new _IdentityStore();
