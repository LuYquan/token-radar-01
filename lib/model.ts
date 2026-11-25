// Token Radar's model (radar-2): one sealed snapshot in, one ranked board out.
//
// The board ranks the protocols that can still launch a token, by an implied
// value priced from the snapshot's own figures. Nothing here names a protocol:
// the same functions score every row, and every number the dashboard shows
// comes from the snapshot passed to buildRadar.
//
// The funnel (all 758 protocols accounted for):
//   758 in the snapshot
//   342 record no token (no market cap, no CoinGecko id, no symbol)
//   198 survive the launch-candidate rule below  -> the board
//   144 pre-token protocols are set aside by that rule (see exclusionReasons)
//   416 already trade                              -> the Live view, market caps
//   198 + 144 + 416 = 758.
//
// The launch-candidate rule is the watchlist's rule, applied to every row, not
// just the watchlist: a wrapped, staked or bridged product of a token that
// already trades is not a launch (WBTC is Bitcoin on Ethereum, Binance staked
// ETH is ETH in a staking product). So a row must record no token, must not be
// a Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC
// or CEX product, must not carry a whole word wrapped/staked/staking, must not
// end in a version marker, and must not begin with an exchange's name.
// The watchlist is the floor: all 40 of its slugs are on the board.
//
// Implied value (comparables-calibrated, radar-2):
//   comp multiple  = the category's live-token protocols' median mcap/TVL,
//                    shrunk toward the global median (weight n/(n+8)) and
//                    clamped to [0.05, 2.0]; categories with no live comp use
//                    the global median (0.205 on this snapshot).
//   growthMult     = 1 + clamp(change_7d, -50, 100)/100 * 0.5
//   maturityMult   = 0.70 + min(age_days, 1095)/1095 * 0.30 (unknown age: 365d)
//   breadthMult    = 1 + 0.03 * ln(number of chains)
//   implied        = max(1, round(tvl_usd * comp * growthMult * maturityMult * breadthMult))
// A token's implied value is the entry's own claim, never make.fun's, and
// never a prediction that a token will launch or when.
//
// Farm verdict (costed, from the row's own figures): FARM when the implied
// value is at least $50M and 7-day growth is no worse than -20%, THIN when it
// is at least $5M, SKIP otherwise. Every plan states its capital, its gas and
// its hold in dollars and days, and the gas bill as basis points of the row's
// implied value, so a reader can see what the farm costs before they start.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_weight: number;
  shrink_k: number;
  multiple_floor: number;
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_weight: 0.03,
  shrink_k: 8,
  multiple_floor: 0.05,
  multiple_cap: 2.0,
};

export const MODEL_VERSION = 'radar-2';

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  farm_cost_usd: number;
  model: {
    comp_multiple: number;
    comp_median: number | null;
    comp_n: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  farm_cost_usd: number;
  watchlist: boolean;
  comp_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface CompRow {
  category: string;
  n: number;
  median: number | null;
  multiple: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  median_implied_usd: number;
  funnel: { snapshot: number; pre_token: number; board: number; excluded: number; live: number };
  excluded_reasons: { reason: string; count: number }[];
  comps: CompRow[];
  global_comp_median: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Why a pre-token protocol is not a launch candidate, or null when it is one. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'token already trades';
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return `category ${p.category}`;
  if (VERSIONED.test(p.name)) return 'versioned product name';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped / staked product name';
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return 'exchange-named product';
  return null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return exclusionReason(p) === null;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Live-token comparables: median mcap/TVL per category and globally. */
export function calibration(snapshot: Snapshot, model: ModelConstants): { globalMedian: number; comps: CompRow[] } {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const ratios = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMedian = ratios.length > 0 ? median(ratios) : 0.2;
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const arr = byCat.get(p.category ?? 'Other') ?? [];
    arr.push(p.mcap_usd! / p.tvl_usd);
    byCat.set(p.category ?? 'Other', arr);
  }
  const comps: CompRow[] = [];
  const cats = new Set(snapshot.protocols.map((p) => p.category ?? 'Other'));
  for (const cat of [...cats].sort()) {
    const arr = byCat.get(cat) ?? [];
    const n = arr.length;
    const med = n > 0 ? median(arr) : null;
    const w = n / (n + model.shrink_k);
    const multiple = Math.min(
      model.multiple_cap,
      Math.max(model.multiple_floor, Math.exp(w * Math.log(med ?? globalMedian) + (1 - w) * Math.log(globalMedian))),
    );
    comps.push({ category: cat, n, median: med === null ? null : Math.round(med * 10000) / 10000, multiple: Math.round(multiple * 10000) / 10000 });
  }
  return { globalMedian: Math.round(globalMedian * 10000) / 10000, comps };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  compMultiple: number,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + model.breadth_weight * Math.log(Math.max(1, protocol.chains.length));
  const implied = Math.max(1, Math.round(protocol.tvl_usd * compMultiple * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

export function verdictFor(implied: number, growthPct: number): 'FARM' | 'THIN' | 'SKIP' {
  if (implied >= 50_000_000 && growthPct >= -20) return 'FARM';
  if (implied >= 5_000_000) return 'THIN';
  return 'SKIP';
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function cat(p: SnapshotProtocol): string {
  return (p.category ?? '').toLowerCase();
}

/** The protocol's first farm action, from its category, chain and capital. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = cat(p);
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow 25% of it in the same app and repay it within the week.`;
  if (c.includes('dex') || c.includes('liquidity manager')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain}, then swap $10 through the same pool.`;
  if (c.includes('yield') || c.includes('farm') || c.includes('leveraged farm')) return `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and keep the vault shares.`;
  if (c.includes('risk curator') || c.includes('capital allocator')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and note which curator allocation it joins.`;
  if (c.includes('restak') || c.includes('staking pool') || c.includes('restaking')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name} on ${chain} and open one small basis position.`;
  if (c.includes('derivative') || c.includes('perpetual')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedge, no leverage above 2x.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and place one small position on a market that settles within 30 days.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the hold period.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('bridge') || c.includes('chain')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds in one app on that chain.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name} on ${chain} and vote on one live proposal with the position.`;
  if (c.includes('index')) return `Buy $${capital} of ${name}'s index token on ${chain} and hold it.`;
  if (c.includes('payment') || c.includes('card')) return `Load $${capital} onto ${name} on ${chain} and make one real payment with it.`;
  if (c.includes('otc')) return `Place one $${capital} order on ${name} and settle it in full.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The second, different qualifying action for the same protocol. */
function secondActionFor(p: SnapshotProtocol): string {
  const c = cat(p);
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Make a second borrow-and-repay cycle, smaller than the first, in the same app.';
  if (c.includes('dex') || c.includes('liquidity manager')) return 'Swap a second pair through the same pool, in the opposite direction.';
  if (c.includes('yield') || c.includes('farm') || c.includes('leveraged farm')) return 'Claim or restake the vault rewards once, instead of leaving them idle.';
  if (c.includes('risk curator') || c.includes('capital allocator')) return 'Deposit a second, smaller amount into a different vault run by the same curator.';
  if (c.includes('restak') || c.includes('staking pool') || c.includes('restaking')) return 'Delegate a second, smaller stake to a different validator or operator it lists.';
  if (c.includes('rwa')) return 'Hold the asset through one yield payout and record the amount received.';
  if (c.includes('basis') || c.includes('derivative') || c.includes('perpetual')) return 'Close the first position, then open one smaller position in the opposite direction.';
  if (c.includes('prediction')) return 'Place a second position on a different market the same week.';
  if (c.includes('insurance')) return 'File one test claim enquiry so the cover is on record as used.';
  if (c.includes('bridge') || c.includes('chain')) return 'Bridge a second, smaller amount back the other way through the same route.';
  if (c.includes('governance')) return 'Vote on a second proposal, or delegate the vote to an active delegate.';
  return 'Do one more different action in the same app: a swap, a deposit, a vote or a claim.';
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

export function farmSteps(p: SnapshotProtocol, age: number | null, verdict: 'FARM' | 'THIN' | 'SKIP', implied: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(1, Math.round(hold / 7));
  const gas = 4 + weeks * 2 + 3;
  const bp = Math.round((gas / Math.max(1, implied)) * 10000);
  const verdictLine =
    verdict === 'FARM'
      ? `Verdict: FARM. This row's implied value is $${implied.toLocaleString('en-US')} and the plan below costs about $${gas} of gas plus $${capital} of capital that stays in the position.`
      : verdict === 'THIN'
        ? `Verdict: THIN. Farm this one small: the plan below costs about $${gas} of gas plus $${capital} of capital, and the implied value is $${implied.toLocaleString('en-US')}.`
        : `Verdict: SKIP for now. Watch it instead: the implied value is $${implied.toLocaleString('en-US')}, so the plan below is only worth it if the protocol starts growing.`;
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline, never in a screenshot or a chat.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: secondActionFor(p), cost: 'about $2 of gas', time: '10 minutes' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and never let two weeks pass with no activity.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; never pay a fee to claim.`, cost: 'no fee to check', time: '10 minutes' },
    { text: `${verdictLine} The gas bill is about ${bp} basis points of the implied value. Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, cost: `about $${gas} of gas in total`, time: '5 minutes to log' },
  ];
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const { comps, globalMedian } = calibration(snapshot, model);
  const compByCat = new Map(comps.map((c) => [c.category, c.multiple]));
  const watch = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter(isRankable);
  const scored = chosen.map((p) => {
    const multiple = compByCat.get(p.category ?? 'Other') ?? globalMedian;
    const v = impliedValue(p, snapshot.as_of, model, multiple);
    const verdict = verdictFor(v.implied, v.growthPct);
    return { p, v, multiple, verdict };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const weeks = Math.max(1, Math.round(holdDaysFor(s.v.age) / 7));
    const gas = 4 + weeks * 2 + 3;
    const comp = comps.find((c) => c.category === (s.p.category ?? 'Other'))!;
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      watchlist: watch.has(s.p.slug),
      age_days: s.v.age,
      implied_value_usd: s.v.implied,
      verdict: s.verdict,
      farm_cost_usd: gas,
      model: {
        comp_multiple: s.multiple,
        comp_median: comp.median,
        comp_n: comp.n,
        growth_pct: s.v.growthPct,
        growth_multiplier: round4(s.v.growthMult),
        maturity_multiplier: round4(s.v.maturityMult),
        breadth_multiplier: round4(s.v.breadthMult),
        age_days: s.v.age,
      },
      farm_steps: farmSteps(s.p, s.v.age, s.verdict, s.v.implied).map(stepText),
    };
  });
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    verdict: row.verdict,
    farm_cost_usd: row.farm_cost_usd,
    watchlist: row.watchlist,
    comp_multiple: row.model.comp_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const { comps, globalMedian } = calibration(snapshot, model);
  const preToken = snapshot.protocols.filter(isPreToken).length;
  const reasons = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) continue;
    const r = exclusionReason(p);
    if (r !== null) reasons.set(r, (reasons.get(r) ?? 0) + 1);
  }
  const total = board.reduce((n, r) => n + r.implied_value_usd, 0);
  const sortedImplied = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const mid = Math.floor(sortedImplied.length / 2);
  const medianImplied = sortedImplied.length % 2 === 1 ? sortedImplied[mid]! : Math.round((sortedImplied[mid - 1]! + sortedImplied[mid]!) / 2);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.watchlist).length,
    live_size: live.length,
    total_implied_usd: total,
    median_implied_usd: medianImplied,
    funnel: { snapshot: snapshot.protocols.length, pre_token: preToken, board: board.length, excluded: preToken - board.length, live: snapshot.protocols.length - preToken },
    excluded_reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
    comps,
    global_comp_median: globalMedian,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
