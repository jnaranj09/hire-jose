import { openSession, readAccessToken } from './access.js';
import { SUGGESTED_QUESTIONS } from './questions.js';
import { mountPrompts } from './prompts.js';

const INTRO = [
  "I'm Jose's AI representative. Ask me about his infrastructure work, how he",
  'runs releases, or what he did during a specific incident.',
  'I answer from his own notes, and I say so when something is not in them.'
].join(' ');

const THEME = {
  primary: '#109f5a',
  ocwiWidth: '380px',
  ocwiHeight: '540px',
  ocwiRadius: '14px',
  ocwiBg: '#232321',
  ocwiBorder: '#1c4440',
  ocwiHeaderBg: '#202e3a',
  ocwiHeaderText: '#dbcccc',
  ocwiBubbleUserBg: '#109f5a',
  ocwiBubbleUserText: '#ffffff',
  ocwiBubbleAssistantBg: '#1b1b19',
  ocwiBubbleAssistantText: '#d5d5d5',
  ocwiInputBg: '#1e1e1c',
  ocwiInputText: '#d5d5d5',
  ocwiInputPlaceholder: '#85857f',
  ocwiSendBg: '#109f5a',
  ocwiSendText: '#ffffff',
  ocwiFabBg: '#109f5a',
  ocwiFabText: '#ffffff'
};

const FEATURES = {
  minimize: true,
  close: true,
  serverStatus: true,
  sendButton: true,
  stopButton: true,
  placeholder: true,
  nameDisplay: true,
  messageCopy: true,
  languageSelector: false,
  authentication: false,
  watermark: false,
  avatarDisplay: false,
  messageEdit: false,
  messageDelete: false,
  messageRefresh: false
};

function mountWidget(chatUrl) {
  return window.OCWI('#chat', {
    api: { danaUrl: chatUrl, timeoutMs: 90000 },
    ui: {
      name: "Jose's AI representative",
      placeholder: 'Ask about his work…',
      introductionMessage: INTRO,
      position: 'bottom-right',
      initialState: 'collapsed'
    },
    features: FEATURES,
    theme: THEME
  });
}

// No chat is a normal way to read this page, not an error — but the hops ask
// the visitor to talk to the assistant, so say up front that those parts will
// not answer.
function announceNoChat() {
  document.querySelector('#no-chat')?.removeAttribute('hidden');
}

async function start() {
  const accessToken = readAccessToken();
  if (!accessToken) {
    announceNoChat();
    return;
  }

  const configured = document.querySelector('meta[name="chat-api-url"]')?.content;
  const apiUrl = configured || window.location.origin;

  // A token the backend refuses looks the same to a reader as no token at all.
  const session = await openSession(apiUrl, accessToken).catch(() => null);
  if (!session) {
    announceNoChat();
    return;
  }

  document.querySelector('#ask')?.removeAttribute('hidden');

  mountPrompts({
    container: document.querySelector('#suggested-prompts'),
    questions: SUGGESTED_QUESTIONS,
    widget: mountWidget(`${apiUrl}/api/chat/${session}`)
  });
}

start();
