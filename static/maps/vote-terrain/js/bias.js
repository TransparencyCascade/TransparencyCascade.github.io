/* The tipping state against the nation (history.json "bias", build_history.py): the Road to 270 readout, the History
   tab's fourth chart and the saved views' caption tokens say it in these words. Pure: no DOM. Neutral by rule: both
   numbers and the gap, never a verdict on which party a system favours.
   A row: { year, nat { D, R, votes, points }, tip { st, name, ev, D, R, votes, points }, gap, ratio, ... }; votes and
   points are Democratic minus Republican (positive Democratic); gap = tip.points - nat.points, so a negative gap is a
   tipping state more Republican than the nation. */
import { fmt } from './util.js';

export const PARTY = { D: 'Democratic', R: 'Republican' };
export const SIDE = { D: 'Democrats', R: 'Republicans' };
export const pts = (x) => Math.abs(x).toFixed(1);
const who = (x) => (x > 0 ? 'D' : 'R');
// The gap's size, to the tenth of a point; below that the tipping state voted as the nation did.
export const sameAsNation = (b) => Number(pts(b.gap)) === 0;
export const ratioText = (r) => (r >= 100 ? fmt(r) : r.toFixed(1));
export const rowFor = (H, year) => (H && H.bias ? H.bias.find((b) => b.year === +year) || null : null);
export const gapSentence = (b) => (sameAsNation(b) ? 'The tipping state voted within a tenth of a point of the nation.'
  : `The tipping state voted ${pts(b.gap)} points more ${PARTY[who(b.gap)]} than the nation.`);
export const natLine = (b) => `National popular vote: ${SIDE[who(b.nat.votes)]} ahead by ${fmt(Math.abs(b.nat.votes))} votes, ${pts(b.nat.points)} points of the two-party vote.`;
export const tipLine = (b) => `Tipping state: ${b.tip.name} (${b.tip.ev} electoral votes), ${PARTY[who(b.tip.votes)]} by ${fmt(Math.abs(b.tip.votes))} votes, ${pts(b.tip.points)} points.`;
export const ratioLine = (b) => `The national vote margin was ${ratioText(b.ratio)} times the tipping state's vote margin.`;
// The row as caption tokens read it: unsigned figures, the party named.
export const tokens = (b) => ({ year: b.year, winName: SIDE[b.winner], evW: b.winner === 'D' ? b.evD : b.evR, evL: b.winner === 'D' ? b.evR : b.evD,
  natName: SIDE[who(b.nat.votes)], natVotes: Math.abs(b.nat.votes), natPts: Math.abs(b.nat.points),
  tipSt: b.tip.st, tipName: b.tip.name, tipEv: b.tip.ev, tipParty: PARTY[who(b.tip.votes)], tipVotes: Math.abs(b.tip.votes), tipPts: Math.abs(b.tip.points),
  gap: b.gap, gapPts: Math.abs(b.gap), gapToward: PARTY[who(b.gap)], ratio: b.ratio, sentence: gapSentence(b) });
