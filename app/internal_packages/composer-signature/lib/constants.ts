import crypto from 'crypto';
import URL from 'url';
import { localized } from 'mailspring-exports';
import ReactDOMServer from 'react-dom/server';
import Templates from './templates';

export const DataShape = [
  {
    key: 'name',
    label: localized('Name'),
  },
  {
    key: 'title',
    label: localized('Title'),
  },
  {
    key: 'phone',
    label: localized('Phone'),
  },
  {
    key: 'email',
    label: localized('Email Address'),
  },
  {
    key: 'fax',
    label: localized('Fax'),
  },
  {
    key: 'address',
    label: localized('Address'),
  },
  {
    key: 'websiteURL',
    label: localized('Website'),
  },
  {
    key: 'linkedinURL',
    label: localized('LinkedIn URL'),
  },
  {
    key: 'mediumURL',
    label: localized('Medium Handle'),
  },
  {
    key: 'tintColor',
    label: localized('Theme Color'),
    placeholder: 'ex: #419bf9, purple',
  },
];

export const ResolveSignatureData = (data: Record<string, string>) => {
  data = { ...data };

  ['websiteURL'].forEach((key) => {
    if (data[key] && !data[key].includes(':')) {
      data[key] = `http://${data[key]}`;
    }
  });

  // sanitize linkedin handle
  if (data.linkedinURL) {
    if (!data.linkedinURL.includes('linkedin.com')) {
      data.linkedinURL = `https://www.linkedin.com/in/${data.linkedinURL}`;
    }
  }

  // sanitize medium handle
  if (data.mediumURL) {
    if (!data.mediumURL.includes('medium.com')) {
      if (!data.mediumURL.startsWith('@')) {
        data.mediumURL = `@${data.mediumURL}`;
      }
      data.mediumURL = `https://www.medium.com/${data.mediumURL}`;
    }
  }

  if (data.photoURL === 'gravatar') {
    const hash = crypto
      .createHash('sha256')
      .update((data.email || '').toLowerCase().trim())
      .digest('hex');
    data.photoURL = `https://www.gravatar.com/avatar/${hash}/?s=160&msw=160&msh=160`;
  }

  if (data.photoURL === 'company') {
    const domain =
      (data.websiteURL && URL.parse(data.websiteURL).hostname) ||
      (data.email && data.email.split('@').pop());
    data.photoURL = `https://logo.getmailspring.com/company-logo/${domain}?msw=128&msh=128`;
  }

  if (data.photoURL === 'custom') {
    data.photoURL = '';
  }

  return data;
};

export function RenderSignatureData(data: Record<string, string>) {
  const template = Templates.find((t) => t.name === data.templateName) || Templates[0];
  return ReactDOMServer.renderToStaticMarkup(template(ResolveSignatureData(data)));
}
