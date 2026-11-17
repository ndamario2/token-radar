// Token radar, model "radar-2.1" — written for token-radar-01.
//
// The model turns the sealed snapshot's own figures into one number per protocol,
// the implied value of its token if it launched with the record it has today.
// Nothing is a black box: every input is shown per protocol on the dashboard,
// and the formula is printed on the page.
//
//   implied_value_usd = round(tvl_usd x category_multiple x growth x maturity x breadth)
//
//   category_multiple  how much of a protocol's TVL a token is worth, by what the
//                      protocol sells. In v2 the multiples are CALIBRATED from the
//                      snapshot's own live-token protocols (see calibrateMultiples):
//                      the median mcap/TVL of a category's live peers where at least
//                      five exist, shrunk toward the global median where fewer exist,
//                      and the v1 hand-set multiple where one or none exists. No
//                      multiple is credited above 1.00: a launch is never worth more
//                      than the protocol's own TVL.
//   growth             1 + clamp(change_7d, -50, 150) / 100 x 0.6 — a protocol
//                      growing 10% in a week is worth 6% more; a shrinking one less.
//                      No 7-day figure reported: 1.00.
//   maturity           0.55 + 0.45 x min(age_days, 1095) / 1095 — a protocol tracked
//                      for three years earns the full weight; a week-old one earns
//                      barely half. No listing date reported: 180 days.
//   breadth            1 + 0.03 x min(chains - 1, 4) — each extra chain up to four
//                      adds 3%: multi-chain reach is real distribution.
//
// A protocol is rankable when it records no token (mcap, gecko_id and symbol all
// null) and is not a wrapped, staked or bridged product of one that trades:
// category outside CEX, Bridge, Canonical Bridge, Liquid Staking, Liquid
// Restaking and Restaked BTC, name without a version marker, and no whole word
// wrapped / staked / staking in the name. The board is EVERY rankable protocol:
// the whole 40-protocol watchlist plus every other rankable protocol, above or
// below the $50M floor — 198 rows in this snapshot. The floor is a floor,
// never a ceiling, and the watchlist is not the whole board.
//
// Sibling rule: the snapshot carries no parentProtocol field, so two rows may
// share one brand (Figure Markets Prime and Figure Markets Exchange are two
// products of one brand, each with its own TVL in the snapshot). No TVL is
// counted twice — every row carries exactly its own protocol's TVL — and rows
// that share a brand family name it in `siblings`, so the reader sees the
// relationship instead of it being hidden. A row whose brand already has a
// live-token protocol names it in `brand_live`; a row whose brand sibling
// records a token symbol (but no market cap) names it in `brand_token`.

export const MODEL_VERSION = 'radar-2.1';
export const LIVE_ROWS = 24;
export const FLOOR_USD = 50_000_000;
export const MATURITY_DAYS = 1095;
export const UNKNOWN_AGE_DAYS = 180;
export const GROWTH_WEIGHT = 0.6;
export const GROWTH_LO = -50;
export const GROWTH_HI = 150;
export const BREADTH_STEP = 0.03;
export const BREADTH_MAX_CHAINS = 4;

/** Pseudo-count for the empirical-Bayes shrink of small peer sets. */
export const SHRINK_K = 3;
/** No launch is credited with more than the protocol's own TVL. */
export const MULTIPLE_CAP = 1.0;
/** A live token worth less than this carries no price signal (a dead listing). */
export const LIVE_MIN_MCAP_USD = 0;

/**
 * The v1 hand-set multiples. Still the fallback where the snapshot gives no
 * usable peer signal: a category with one live peer or none. A single peer
 * cannot calibrate a category — one observation, however extreme (the lone
 * Prediction Market peer trades at 400x its TVL), is not a distribution.
 */
export const V1_CATEGORY_MULTIPLE: Record<string, number> = {
  Dexs: 0.38,
  Lending: 0.34,
  Derivatives: 0.32,
  RWA: 0.32,
  'Risk Curators': 0.3,
  'Onchain Capital Allocator': 0.3,
  CDP: 0.3,
  'Collateral Markets': 0.28,
  Yield: 0.28,
  'Basis Trading': 0.26,
  Restaking: 0.26,
  'Yield Aggregator': 0.26,
  'Staking Pool': 0.24,
  CeDeFi: 0.24,
  Payments: 0.24,
  'Stablecoin Wrapper': 0.22,
  Insurance: 0.22,
  'Governance Incentives': 0.2,
  Chain: 0.2,
};
export const DEFAULT_MULTIPLE = 0.22;

export const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

export interface Protocol {
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
  protocols: Protocol[];
  watchlist: string[];
}

export interface Scored {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  watchlist: boolean;
  multiple: number;
  growth: number;
  maturity: number;
  breadth: number;
  implied_value_usd: number;
  farm_steps: string[];
  rank: number;
  /** Other board rows sharing this row's brand family (first word of the name). */
  siblings: string[];
  /** Live-token protocols sharing this row's brand family. */
  brand_live: string[];
  /** Same-brand protocols that record a token symbol (or gecko id) but no market cap. */
  brand_token: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

export interface CalibrationRow {
  category: string;
  peers: number;
  raw_median: number | null;
  method: 'median' | 'shrunk' | 'v1 fallback';
  multiple: number;
}

export interface Backtest {
  /** Live-token protocols with a positive market cap (a $0 token is no price signal). */
  n: number;
  /** Live-token protocols excluded for recording a zero market cap. */
  excluded_zero_mcap: number;
  /** Median absolute % error, v1 hand-set multiples, leave-one-out is not needed (fixed). */
  v1_median_ape: number;
  /** Median absolute % error, v2 calibrated multiples, leave-one-out per protocol. */
  v2_median_ape: number;
  /** Median |ln(pred / actual)|, v1 multiples. */
  v1_median_log_err: number;
  /** Median |ln(pred / actual)|, v2 multiples, leave-one-out. */
  v2_median_log_err: number;
}

export interface Calibration {
  /** Median mcap/TVL over live peers in board-eligible categories. */
  global_median: number;
  global_n: number;
  shrink_k: number;
  multiple_cap: number;
  table: CalibrationRow[];
  backtest: Backtest;
}

export interface Coverage {
  rows: number;
  watchlist: number;
  above_floor_added: number;
  below_floor: number;
  brand_families: number;
  sibling_rule: string;
}

export interface RadarData {
  meta: { as_of: string; model: string; floor_usd: number; rows: number; watchlist: number };
  model: {
    formula: string;
    multiples: Record<string, number>;
    default_multiple: number;
    growth_weight: number;
    growth_lo: number;
    growth_hi: number;
    maturity_days: number;
    unknown_age_days: number;
    breadth_step: number;
  };
  calibration: Calibration;
  coverage: Coverage;
  rows: Scored[];
  live: LiveRow[];
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: expected { protocols: [], watchlist: [] }');
  }
  return raw;
}

/** Median of numbers; null when the list is empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A live peer: a protocol whose token records a positive market cap. */
export function isLivePeer(p: Protocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > LIVE_MIN_MCAP_USD && p.tvl_usd > 0;
}

/**
 * Calibrate the category multiples from the snapshot's own live-token peers.
 *
 * One multiple per category present in the snapshot, from the peers' mcap/TVL:
 * - 5 or more peers: the raw median.
 * - 2 to 4 peers: the median shrunk toward the global median with pseudo-count
 *   SHRINK_K, then capped at MULTIPLE_CAP.
 * - 0 or 1 peers: the v1 hand-set multiple (or the default when the category
 *   has none) — one peer is not a distribution.
 * The global median is taken over live peers in board-eligible categories
 * (excluded categories never appear on the board, so their tokens are not
 * peers for it). `excludeSlug` drops one protocol from the peer set, for the
 * leave-one-out backtest. Multiples are rounded to three decimals so the
 * board is byte-identical on every run.
 */
export function calibrateMultiples(
  snapshot: Snapshot,
  excludeSlug: string | null = null,
): { multiples: Record<string, number>; calibration: Calibration } {
  const peers = snapshot.protocols.filter((p) => isLivePeer(p) && p.slug !== excludeSlug);
  const eligible = peers.filter((p) => p.category === null || !EXCLUDED_CATEGORIES.has(p.category));
  const globalMedian = median(eligible.map((p) => (p.mcap_usd as number) / p.tvl_usd)) ?? DEFAULT_MULTIPLE;
  const byCategory = new Map<string, number[]>();
  for (const p of peers) {
    const key = p.category ?? '';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [(p.mcap_usd as number) / p.tvl_usd]);
    else list.push((p.mcap_usd as number) / p.tvl_usd);
  }
  const multiples: Record<string, number> = {};
  const table: CalibrationRow[] = [];
  const categories = [...new Set(snapshot.protocols.map((p) => p.category))].sort((a, b) =>
    (a ?? '').localeCompare(b ?? ''),
  );
  for (const category of categories) {
    const key = category ?? '';
    const ratios = byCategory.get(key) ?? [];
    const n = ratios.length;
    const raw = median(ratios);
    const v1 = category !== null && V1_CATEGORY_MULTIPLE[category] !== undefined ? V1_CATEGORY_MULTIPLE[category]! : DEFAULT_MULTIPLE;
    let multiple: number;
    let method: CalibrationRow['method'];
    if (n >= 5 && raw !== null) {
      multiple = raw;
      method = 'median';
    } else if (n >= 2 && raw !== null) {
      multiple = Math.min(MULTIPLE_CAP, (n * raw + SHRINK_K * globalMedian) / (n + SHRINK_K));
      method = 'shrunk';
    } else {
      multiple = v1;
      method = 'v1 fallback';
    }
    multiple = Math.round(multiple * 1000) / 1000;
    multiples[key] = multiple;
    table.push({ category: category ?? '(no category)', peers: n, raw_median: raw === null ? null : Math.round(raw * 1000) / 1000, method, multiple });
  }
  const calibration: Calibration = {
    global_median: Math.round(globalMedian * 1000) / 1000,
    global_n: eligible.length,
    shrink_k: SHRINK_K,
    multiple_cap: MULTIPLE_CAP,
    table,
    backtest: { n: 0, excluded_zero_mcap: 0, v1_median_ape: 0, v2_median_ape: 0, v1_median_log_err: 0, v2_median_log_err: 0 },
  };
  return { multiples, calibration };
}

/** The multiple for one category out of a calibrated map. */
export function categoryMultiple(category: string | null, multiples: Record<string, number>): number {
  const v = multiples[category ?? ''];
  return v === undefined ? DEFAULT_MULTIPLE : v;
}

/**
 * Leave-one-out backtest of the calibration: for each live-token protocol
 * with a positive market cap, predict its market cap as TVL x multiple,
 * with the multiple calibrated from every peer except the protocol itself
 * (so the protocol never grades its own homework), and report the median
 * absolute % error and the median |ln(pred / actual)| — the second because
 * % error is one-sided: it is bounded at 100% below and unbounded above,
 * so it rewards over-prediction. The v1 baseline uses the fixed hand-set
 * multiples. A protocol recording a zero market cap is excluded: a $0 token
 * is a dead listing, not a price signal.
 */
export function backtestCalibration(snapshot: Snapshot): Backtest {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const excluded = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd <= 0).length;
  const v1Ape: number[] = [];
  const v2Ape: number[] = [];
  const v1Log: number[] = [];
  const v2Log: number[] = [];
  for (const p of live) {
    const actual = p.mcap_usd as number;
    const v1m = p.category !== null && V1_CATEGORY_MULTIPLE[p.category] !== undefined ? V1_CATEGORY_MULTIPLE[p.category]! : DEFAULT_MULTIPLE;
    const pred1 = p.tvl_usd * v1m;
    v1Ape.push(Math.abs(pred1 - actual) / actual);
    v1Log.push(Math.abs(Math.log(pred1 / actual)));
    const { multiples } = calibrateMultiples(snapshot, p.slug);
    const v2m = categoryMultiple(p.category, multiples);
    const pred2 = p.tvl_usd * v2m;
    v2Ape.push(Math.abs(pred2 - actual) / actual);
    v2Log.push(Math.abs(Math.log(pred2 / actual)));
  }
  const round3 = (v: number | null): number => (v === null ? 0 : Math.round(v * 1000) / 1000);
  return {
    n: live.length,
    excluded_zero_mcap: excluded,
    v1_median_ape: round3(median(v1Ape)),
    v2_median_ape: round3(median(v2Ape)),
    v1_median_log_err: round3(median(v1Log)),
    v2_median_log_err: round3(median(v2Log)),
  };
}

export function ageDays(listedAt: string | null, asOf: string): number {
  if (listedAt === null) return UNKNOWN_AGE_DAYS;
  const listed = Date.parse(`${listedAt}T00:00:00Z`);
  const as = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(listed) || Number.isNaN(as)) return UNKNOWN_AGE_DAYS;
  return Math.max(0, Math.floor((as - listed) / 86_400_000));
}

export function growthFactor(change7d: number | null): number {
  if (change7d === null || Number.isNaN(change7d)) return 1;
  const clamped = Math.min(GROWTH_HI, Math.max(GROWTH_LO, change7d));
  return 1 + (clamped / 100) * GROWTH_WEIGHT;
}

export function maturityFactor(age: number): number {
  return 0.55 + 0.45 * (Math.min(age, MATURITY_DAYS) / MATURITY_DAYS);
}

export function breadthFactor(chains: string[]): number {
  return 1 + BREADTH_STEP * Math.min(Math.max(chains.length - 1, 0), BREADTH_MAX_CHAINS);
}

export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSION_MARKER = /(?:^|[\s._-])v\d+(?:\.\d+)?$/i;
const WRAPPED_WORD = /\b(?:wrapped|staked|staking)\b/i;

export function isRankable(p: Protocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_MARKER.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  return true;
}

export function capitalFor(tvl: number): number {
  if (tvl >= 500_000_000) return 250;
  if (tvl >= 100_000_000) return 150;
  if (tvl >= 50_000_000) return 100;
  return 50;
}

export function holdDaysFor(age: number): number {
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function chainName(chains: string[]): string {
  return chains.length > 0 ? chains[0]! : 'Ethereum';
}

/** The core action, per category: what the farm actually does with the capital. */
function coreAction(p: Protocol, capital: number, chain: string): [string, string] {
  const n = p.name;
  switch (p.category) {
    case 'Dexs':
      return [
        `Swap $${capital} through ${n} on ${chain}, routing the trade across its deepest pool so the volume is real and the slippage stays under 0.5%. Cost: about $3 gas. Time: 15 minutes.`,
        `Provide $${capital} as liquidity in ${n}'s largest ${chain} pool and leave it earning fees for the full hold period. Cost: about $3 gas. Time: 10 minutes.`,
      ];
    case 'Lending':
      return [
        `Supply $${capital} as collateral on ${n} (${chain}) and keep the loan-to-value under 50% so a price swing never risks liquidation. Cost: about $3 gas. Time: 15 minutes.`,
        `Borrow a small amount, about $20, against the deposit on ${n}, hold it a week, then repay it in full to show both sides of the market. Cost: about $4 gas plus a few cents of interest. Time: 10 minutes.`,
      ];
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return [
        `Deposit $${capital} into a ${n} vault on ${chain}, choosing the vault whose curator has the longest track record, not the highest advertised yield. Cost: about $3 gas. Time: 15 minutes.`,
        `Allocate a second $${Math.round(capital / 2)} to a different ${n} vault with a different risk profile, so the farm is not a single-position bet. Cost: about $3 gas. Time: 10 minutes.`,
      ];
    case 'RWA':
      return [
        `Buy $${capital} of tokenised real-world assets through ${n} on ${chain}, starting with the asset class the protocol has held longest. Cost: about $3 gas. Time: 15 minutes.`,
        `Hold the position and collect the yield ${n} pays out, reinvesting it once a month instead of withdrawing it. Cost: about $2 gas a month. Time: 5 minutes a month.`,
      ];
    case 'Derivatives':
      return [
        `Open a small hedged position of $${capital} on ${n} (${chain}), long the underlying and short the same size elsewhere, so the farm earns funding without directional risk. Cost: about $3 gas. Time: 15 minutes.`,
        `Close and reopen the hedge once a week to keep the position active and the funding stream current. Cost: about $3 gas a week. Time: 10 minutes a week.`,
      ];
    case 'CDP':
      return [
        `Lock $${capital} of collateral in ${n} on ${chain} and mint stablecoins at no more than 40% of the collateral value, keeping a wide safety margin. Cost: about $3 gas. Time: 15 minutes.`,
        `Repay a quarter of the minted stablecoins after a month, then mint them back, so the position shows real repayment behaviour. Cost: about $3 gas. Time: 10 minutes.`,
      ];
    case 'Yield':
    case 'Yield Aggregator':
      return [
        `Deposit $${capital} into ${n}'s ${chain} yield vault and let it compound, choosing the strategy with the longest live history. Cost: about $3 gas. Time: 15 minutes.`,
        `Move half the deposit to a second ${n} strategy on ${chain} after a month to spread the farm across two strategies. Cost: about $3 gas. Time: 10 minutes.`,
      ];
    case 'Staking Pool':
    case 'Restaking':
      return [
        `Stake $${capital} through ${n} on ${chain} and keep the stake bonded for the full hold period instead of unstaking early. Cost: about $3 gas. Time: 15 minutes.`,
        `Restake the rewards ${n} pays out once a month so the position compounds. Cost: about $2 gas a month. Time: 5 minutes a month.`,
      ];
    case 'Basis Trading':
      return [
        `Deposit $${capital} into ${n}'s basis vault on ${chain} and let the delta-neutral strategy earn the funding spread while the position stays hedged. Cost: about $3 gas. Time: 15 minutes.`,
        `Check the vault's hedge ratio once a week and top it up with $${Math.round(capital / 2)} if the basis widens, so the farm stays fully hedged. Cost: about $3 gas. Time: 10 minutes a week.`,
      ];
    case 'Prediction Market':
      return [
        `Trade $${capital} across ${n}'s ${chain} prediction markets, taking positions on outcomes you have researched rather than chasing the favourite, so the volume is real. Cost: about $3 gas. Time: 15 minutes.`,
        `Provide $${capital / 2} of liquidity to ${n}'s deepest ${chain} market and leave it earning trading fees for the full hold period. Cost: about $3 gas. Time: 10 minutes.`,
      ];
    case 'Cross Chain Bridge':
      return [
        `Bridge $${capital} through ${n} from ${chain} to another chain the protocol supports, using its own route rather than an aggregator, so the volume is counted on the protocol. Cost: about $5 in bridge fees. Time: 15 minutes.`,
        `Bridge a second $${Math.round(capital / 2)} back a week later, keeping a small balance on each side so the farm shows repeat use. Cost: about $5 in bridge fees. Time: 10 minutes.`,
      ];
    case 'CDP Manager':
      return [
        `Open a vault on ${n} (${chain}) with $${capital} of collateral and manage it through the protocol's own dashboard, keeping the collateral ratio above 200%. Cost: about $3 gas. Time: 15 minutes.`,
        `Rebalance the vault once a month through ${n}, repaying part of the debt and drawing it again, so the position shows active management. Cost: about $3 gas. Time: 10 minutes a month.`,
      ];
    case 'OTC Marketplace':
      return [
        `Place a $${capital} OTC order on ${n} (${chain}) at a price inside the quoted spread, settling it in full rather than leaving a partial fill. Cost: about $3 gas. Time: 15 minutes.`,
        `List a second $${Math.round(capital / 2)} order on ${n} the following week on the other side of the book, so the farm shows both taking and making. Cost: about $3 gas. Time: 10 minutes.`,
      ];
    case 'Farm':
      return [
        `Deposit $${capital} into ${n}'s highest-TVL farm on ${chain} and leave it staked for the full hold period, compounding the rewards monthly. Cost: about $3 gas. Time: 15 minutes.`,
        `Move half the deposit to a second ${n} farm on ${chain} after a month to spread the farm across two pools. Cost: about $3 gas. Time: 10 minutes.`,
      ];
    case 'Stablecoin Wrapper':
      return [
        `Wrap $${capital} into ${n}'s stablecoin on ${chain} and hold the wrapped position, using it in the protocol's own yield venue rather than swapping it away. Cost: about $3 gas. Time: 15 minutes.`,
        `Unwrap and re-wrap $${Math.round(capital / 2)} once a month through ${n} so the position shows repeated use of the wrapper. Cost: about $3 gas. Time: 10 minutes a month.`,
      ];
    default:
      return [
        `Use ${n} on ${chain} with $${capital}, taking its core action — the one the protocol's own docs present first — and keep the position open. Cost: about $3 gas. Time: 15 minutes.`,
        `Repeat ${n}'s core action with a second $${Math.round(capital / 2)} tranche on ${chain} so the farm is not a single transaction. Cost: about $3 gas. Time: 10 minutes.`,
      ];
  }
}

/** Six steps, each 20–600 characters, each carrying its cost and its time. */
export function farmSteps(p: Protocol, age: number): string[] {
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(age);
  const chain = chainName(p.chains);
  const [first, second] = coreAction(p, capital, chain);
  return [
    `Set up a fresh wallet for this farm only, keep its seed phrase offline, and fund it with $${capital} in a stablecoin plus about $5 for gas on ${chain}. Cost: about $5 gas. Time: 5 minutes.`,
    first,
    second,
    `Repeat one qualifying action on ${p.name} each week for ${hold} days so the activity reads as real use, not a one-off airdrop grab. Cost: about $2 gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days and check ${p.name}'s points or rewards page once a month to confirm the activity is actually counted. Cost: $0. Time: 5 minutes a month.`,
    `Claim only from ${p.name}'s own published link, never pay a fee to claim a token, and unwind the position in stages once a launch is announced. Cost: $0 to claim. Time: 10 minutes.`,
  ];
}

export function score(p: Protocol, asOf: string, onWatchlist: boolean, multiples: Record<string, number>): Scored {
  const age = ageDays(p.listed_at, asOf);
  const multiple = categoryMultiple(p.category, multiples);
  const growth = growthFactor(p.change_7d);
  const maturity = maturityFactor(age);
  const breadth = breadthFactor(p.chains);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growth * maturity * breadth));
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    age_days: age,
    watchlist: onWatchlist,
    multiple,
    growth,
    maturity,
    breadth,
    implied_value_usd: implied,
    farm_steps: farmSteps(p, age),
    rank: 0,
    siblings: [],
    brand_live: [],
    brand_token: [],
  };
}

/** The brand family of a protocol: the first word of its name, lowercased. */
export function brandOf(name: string): string {
  return name.split(' ')[0]!.toLowerCase();
}

export function buildRadar(snapshot: Snapshot): { board: Scored[]; radar: RadarData } {
  const { multiples, calibration } = calibrateMultiples(snapshot);
  calibration.backtest = backtestCalibration(snapshot);
  const watch = new Set(snapshot.watchlist);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchRows: Scored[] = [];
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p === undefined) throw new Error(`snapshot: watchlist slug ${slug} is not in protocols`);
    watchRows.push(score(p, snapshot.as_of, true, multiples));
  }
  // Every other rankable protocol, above or below the floor: the floor is a
  // floor, never a ceiling, and the watchlist is not the whole board.
  const rest = snapshot.protocols
    .filter((p) => !watch.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .map((p) => score(p, snapshot.as_of, false, multiples));
  const board = [...watchRows, ...rest].sort((a, b) => b.implied_value_usd - a.implied_value_usd);
  board.forEach((row, i) => {
    row.rank = i + 1;
  });
  // Sibling flags: rows sharing a brand family name each other, and a row
  // whose brand already has a live-token protocol (or one recording a token
  // symbol) says so — the relationship is shown, never hidden.
  const byBrand = new Map<string, Protocol[]>();
  for (const p of snapshot.protocols) {
    const list = byBrand.get(brandOf(p.name));
    if (list === undefined) byBrand.set(brandOf(p.name), [p]);
    else list.push(p);
  }
  const boardSlugs = new Set(board.map((r) => r.slug));
  for (const row of board) {
    const kin = byBrand.get(brandOf(row.name)) ?? [];
    row.siblings = kin.filter((p) => p.slug !== row.slug && boardSlugs.has(p.slug)).map((p) => p.slug);
    row.brand_live = kin
      .filter((p) => p.slug !== row.slug && p.mcap_usd !== null && p.mcap_usd > 0)
      .map((p) => p.slug);
    row.brand_token = kin
      .filter((p) => p.slug !== row.slug && (p.mcap_usd === null || p.mcap_usd <= 0) && (p.gecko_id !== null || p.symbol !== null))
      .map((p) => p.slug);
  }
  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
    }));
  const aboveFloor = rest.filter((r) => r.tvl_usd >= FLOOR_USD).length;
  const families = new Set(board.map((r) => brandOf(r.name)));
  let multiFamily = 0;
  for (const brand of families) {
    if (board.filter((r) => brandOf(r.name) === brand).length > 1) multiFamily += 1;
  }
  const radar: RadarData = {
    meta: { as_of: snapshot.as_of, model: MODEL_VERSION, floor_usd: FLOOR_USD, rows: board.length, watchlist: snapshot.watchlist.length },
    model: {
      formula: 'implied = round(tvl_usd x category_multiple x growth x maturity x breadth)',
      multiples,
      default_multiple: DEFAULT_MULTIPLE,
      growth_weight: GROWTH_WEIGHT,
      growth_lo: GROWTH_LO,
      growth_hi: GROWTH_HI,
      maturity_days: MATURITY_DAYS,
      unknown_age_days: UNKNOWN_AGE_DAYS,
      breadth_step: BREADTH_STEP,
    },
    calibration,
    coverage: {
      rows: board.length,
      watchlist: snapshot.watchlist.length,
      above_floor_added: aboveFloor,
      below_floor: rest.length - aboveFloor,
      brand_families: multiFamily,
      sibling_rule:
        'The snapshot carries no parentProtocol field, so two rows can share one brand. Each row carries exactly its own protocol\u2019s TVL — no TVL is counted twice — and rows sharing a brand name each other on the detail view. A row whose brand already has a live-token protocol, or one recording a token symbol, says so too.',
    },
    rows: board,
    live,
  };
  return { board, radar };
}

/** The gate's own refusal reasons, checked before anything is written. */
export function boardIssue(board: Scored[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100-4000`;
  const slugs = new Set<string>();
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (slugs.has(row.slug)) return `slug ${row.slug} appears twice`;
    slugs.add(row.slug);
    if (row.rank !== i + 1) return `row ${row.slug} has rank ${row.rank}, expected ${i + 1}`;
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `implied value rises at rank ${row.rank}`;
    }
    if (typeof row.implied_value_usd !== 'number' || row.implied_value_usd <= 0) {
      return `row ${row.slug} has no positive implied value`;
    }
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps, outside 3-12`;
    }
    for (const step of row.farm_steps) {
      const n = step.trim().length;
      if (n < 20 || n > 600) return `row ${row.slug} has a farm step of ${n} characters, outside 20-600`;
    }
  }
  const values = new Set(board.map((r) => r.implied_value_usd));
  if (board.length >= 2 && values.size === 1) return 'every implied value is the same';
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}

/** The dashboard's data file: the board, the live-token set and the model. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
