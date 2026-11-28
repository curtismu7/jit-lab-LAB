// The talk track is generated here; docs/talk-track.md must match (a repo test pins it).
export const TALK_INTRO = 'One credential minted once and held for 30 days; one minted per call for 300 seconds, bound to a single tool. Same attacker, same capture. The banner stays on screen, also in presenter mode.';
export const TALK_OUTRO = 'Revoke the tool at the issuer and show that even a fresh JIT credential is refused: TTL and revocation are independent controls.';

export const talkLines = () => [
  { id: 'standing', title: 'The standing credential', say: 'Minted once, held for 30 days, reused on every call. Convenient - and every day it lives is a day a captured copy works.' },
  { id: 'jit', title: 'The JIT credential', say: 'Minted per call, 300 seconds, bound to one tool. The captured copy is dead within minutes; the fresh one cannot be replayed against a different tool.' },
  { id: 'replay', title: 'The replay', say: 'Drag the capture age from minutes to hours. The standing credential keeps being accepted the whole time. That is the whole problem in one slider.' },
  { id: 'revocation', title: 'Revocation', say: 'Revoke the tool at the issuer: even a fresh JIT credential is refused. Short TTL limits the window; revocation closes it.' },
];

export function renderTalkTrackMarkdown() {
  return `# Talk track\n\n${TALK_INTRO}\n\n${talkLines().map((l) => `- **${l.title}.** ${l.say}`).join('\n')}\n\n${TALK_OUTRO}\n`;
}
