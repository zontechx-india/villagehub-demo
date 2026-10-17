/* Chit calculation engine — pure functions, integer paise only (never floating-point money).
 * One engine is used everywhere: the wizard preview, the simulator, the draft settlement after an auction,
 * member statements and reports — so no two screens can calculate different amounts for the same round
 * (village_chit_auction_module_spec.md §24). In production this file is the server's job; the app only
 * displays server-calculated results. Runs in the browser and in node (tests/engine.test.js). */

const ChitEngine = (() => {
  const VERSION = 'calc-1.0';

  const FEE_BASIS = {
    pool_pct: '% of monthly gross pool',
    discount_pct: '% of winning discount',
    fixed: 'Fixed amount',
    none: 'No fee'
  };
  const FEE_TIMING = { every: 'Every round', first: 'First round only', second: 'Second round only', selected: 'Selected rounds' };
  const FEE_SOURCE = { discount: 'Deducted from the winning discount', separate: 'Charged separately (itemised on the payout)' };
  const DIV_TO = { all: 'All members, including the winner', non_winners: 'Non-winning members only' };
  const REMAINDER = { first_members: 'Leftover paise go one each to the lowest ticket numbers', organiser: 'Leftover paise are recorded as a rounding line to the organiser' };
  const TIE_BREAK = { first_bid: 'First valid bid received by the server at the highest discount wins', lots: 'Organiser draws lots between tied bids (recorded)' };
  const NO_BID = { postpone: 'Postpone the auction by 7 days', lots: 'Organiser draws lots among eligible members at the minimum discount', carry: 'Mark the round as no valid bids and move to the next round' };

  // Human label for the configured fee, e.g. "5% of monthly gross pool" or "Fixed ₹5,000". Never just "5% commission".
  function feeLabel(r, money) {
    if (r.feeBasis === 'none') return 'No fee';
    if (r.feeBasis === 'fixed') return 'Fixed ' + money(r.feeFixedP);
    return (r.feeBps / 100) + FEE_BASIS[r.feeBasis];
  }

  function feeApplies(r, n) {
    switch (r.feeTiming) {
      case 'every': return true;
      case 'first': return n === 1;
      case 'second': return n === 2;
      case 'selected': return (r.feeRounds || []).includes(n);
      default: return false;
    }
  }

  // Fee for round n given the winning discount. Percentages are in basis points (500 = 5%).
  function fee(r, n, discountP) {
    if (r.feeBasis === 'none' || !feeApplies(r, n)) return 0;
    if (r.feeBasis === 'fixed') return r.feeFixedP;
    const base = r.feeBasis === 'pool_pct' ? r.poolP : discountP;
    return Math.round(base * r.feeBps / 10000);
  }

  /* Settlement for one round. `members` are the active members in ticket order ({ id }).
   * Returns every figure in paise plus the reconciliation checks. `errors` must be empty before the
   * result can be finalised; invalid input is reported, never clamped to zero. */
  function settle(r, n, discountP, winnerId, members) {
    const errors = [];
    const poolP = r.poolP;
    if (!(n >= 1 && n <= r.rounds)) errors.push(`Round ${n} is outside the scheme duration (1–${r.rounds}).`);
    if (discountP < r.minDiscountP) errors.push(`Winning discount is below the minimum allowed discount.`);
    if (discountP > r.maxDiscountP) errors.push(`Winning discount is above the maximum allowed discount.`);
    if (winnerId && !members.some(m => m.id === winnerId)) errors.push('Winner is not an active member of this chit.');

    const feeP = fee(r, n, discountP);
    let dividendPoolP;
    if (r.feeSource === 'discount') {
      if (feeP > discountP) errors.push('The fee is larger than the winning discount. The settlement cannot be finalised under the published rule.');
      dividendPoolP = discountP - feeP; // may be negative: reported above, never hidden
    } else {
      dividendPoolP = discountP;
    }

    const recipients = r.dividendTo === 'all' ? members : members.filter(m => m.id !== winnerId);
    if (dividendPoolP > 0 && !recipients.length) errors.push('There are no eligible dividend recipients.');
    const k = recipients.length || 1;
    const perP = dividendPoolP > 0 ? Math.floor(dividendPoolP / k) : 0;
    const remP = dividendPoolP > 0 ? dividendPoolP - perP * recipients.length : 0;
    const allocations = recipients.map((m, i) => ({ memberId: m.id, amountP: perP + (r.remainder === 'first_members' && i < remP ? 1 : 0) }));
    const roundingP = r.remainder === 'organiser' ? remP : 0;

    const payoutGrossP = poolP - discountP;
    const deductions = r.feeSource === 'separate' && feeP ? [{ label: 'Company fee (charged separately)', amountP: feeP }] : [];
    const payoutNetP = payoutGrossP - deductions.reduce((a, d) => a + d.amountP, 0);
    if (payoutNetP < 0) errors.push('The winner payout would be negative.');

    const totalDivP = allocations.reduce((a, x) => a + x.amountP, 0);
    const checks = [];
    if (r.feeSource === 'discount') checks.push({ label: 'Discount = fee + dividend pool', ok: discountP === feeP + dividendPoolP, l: discountP, rr: [feeP, dividendPoolP] });
    checks.push({ label: 'Pool = winner payout + fee + dividends' + (roundingP ? ' + rounding' : ''), ok: poolP === payoutNetP + feeP + totalDivP + roundingP && dividendPoolP >= 0, l: poolP, rr: [payoutNetP, feeP, totalDivP].concat(roundingP ? [roundingP] : []) });
    checks.push({ label: 'Sum of dividend allocations = dividend pool', ok: totalDivP + roundingP === Math.max(dividendPoolP, 0), l: Math.max(dividendPoolP, 0), rr: [totalDivP].concat(roundingP ? [roundingP] : []) });
    if (checks.some(c => !c.ok) && !errors.length) errors.push('Settlement does not reconcile in paise.');

    return {
      version: VERSION, round: n, winnerId, poolP, discountP, feeP, feeApplied: feeApplies(r, n) && r.feeBasis !== 'none',
      dividendPoolP, recipients: recipients.length, perMemberP: perP, remainderP: remP, roundingP, allocations,
      payoutGrossP, deductions, payoutNetP, contributionP: r.contributionP,
      netContributionP: r.contributionP - perP, checks, errors, ok: !errors.length
    };
  }

  // Dividend credited to one member in a settlement (0 if not a recipient).
  const allocationFor = (st, memberId) => (st.allocations.find(a => a.memberId === memberId) || { amountP: 0 }).amountP;

  /* Draft rules validation, used before saving a draft as ready and again before publishing. */
  function validate(r, money) {
    const errors = {}, warnings = [];
    const E = (k, m) => { if (!errors[k]) errors[k] = m; };
    if (!r.name || r.name.trim().length < 3) E('name', 'Enter a chit name (at least 3 characters).');
    if (!(r.poolP > 0)) E('pool', 'Enter the monthly gross pool.');
    if (!(r.members >= 2 && r.members <= 100)) E('members', 'Members must be between 2 and 100.');
    if (!(r.rounds >= 2 && r.rounds <= 120)) E('rounds', 'Rounds must be between 2 and 120.');
    if (r.poolP > 0 && r.members >= 2 && r.poolP % r.members !== 0) {
      E('members', `${money(r.poolP)} ÷ ${r.members} members is not a whole amount in paise. Choose a pool or member count that divides evenly — the app will not round silently.`);
    } else if (r.poolP > 0 && r.members >= 2 && (r.poolP / r.members) % 100 !== 0) {
      warnings.push(`Contribution works out to ${money(r.poolP / r.members)} (includes paise). Check members are comfortable paying this exact amount.`);
    }
    if (r.members >= 2 && r.rounds >= 2 && r.members !== r.rounds) warnings.push(`Members (${r.members}) and rounds (${r.rounds}) differ. If one member must receive the pool each round, these should be equal.`);
    if (r.minDiscountP < 0) E('minDiscount', 'Minimum discount cannot be negative.');
    if (r.maxDiscountP <= r.minDiscountP) E('maxDiscount', 'Maximum discount must be greater than the minimum.');
    if (r.maxDiscountP >= r.poolP) E('maxDiscount', 'Maximum discount must be less than the pool.');
    if (!(r.incrementP > 0)) E('increment', 'Minimum bid increment must be more than ₹0.');
    else if (r.incrementP > r.maxDiscountP - r.minDiscountP) E('increment', 'Increment is larger than the allowed discount range.');
    if (r.feeBasis !== 'none') {
      if (r.feeBasis === 'fixed' && !(r.feeFixedP > 0)) E('fee', 'Enter the fixed fee amount.');
      if (r.feeBasis !== 'fixed' && !(r.feeBps > 0 && r.feeBps <= 10000)) E('fee', 'Enter a fee percentage between 0.01% and 100%.');
      if (r.feeTiming === 'selected' && !(r.feeRounds || []).length) E('feeRounds', 'Pick at least one round for the fee.');
      if (r.feeSource === 'discount' && r.feeBasis !== 'discount_pct') {
        const f = r.feeBasis === 'fixed' ? r.feeFixedP : Math.round(r.poolP * r.feeBps / 10000);
        if (f > r.minDiscountP) E('minDiscount', `The fee (${money(f)}) is taken from the discount, so the minimum discount must be at least ${money(f)}. Otherwise a valid low bid could not be settled.`);
      }
    }
    if (!r.startDate) E('startDate', 'Pick the first auction date.');
    return { errors, warnings, ok: !Object.keys(errors).length };
  }

  /* Monthly schedule from the first auction date. Day-of-month is kept, clamped to short months.
   * Dates are Asia/Kolkata wall-clock; ISO strings carry the +05:30 offset. */
  function schedule(r) {
    const [y, m, d] = r.startDate.split('-').map(Number);
    const [hh, mm] = (r.auctionTime || '19:00').split(':').map(Number);
    const out = [];
    for (let i = 0; i < r.rounds; i++) {
      const mi = m - 1 + i, yy = y + Math.floor(mi / 12), mo = mi % 12;
      const last = new Date(Date.UTC(yy, mo + 1, 0)).getUTCDate();
      const day = Math.min(d, last);
      const at = istISO(yy, mo + 1, day, hh, mm);
      const due = new Date(new Date(at).getTime() + (r.dueDays || 5) * 86400000).toISOString();
      out.push({ n: i + 1, auctionAt: at, dueAt: due });
    }
    return out;
  }
  function istISO(y, mo, d, h = 0, mi = 0) { return new Date(Date.UTC(y, mo - 1, d, h, mi) - 330 * 60000).toISOString(); }

  /* Bid validation (the server does this; the client shows the reason). */
  function checkBid(r, highestP, discountP) {
    if (!(discountP > 0)) return 'Enter a discount amount.';
    if (discountP % 100) return 'Bids must be in whole rupees.';
    if (discountP < r.minDiscountP) return 'Below the minimum allowed discount.';
    if (discountP > r.maxDiscountP) return 'Above the maximum allowed discount.';
    if (highestP && discountP < highestP + r.incrementP) return 'Must beat the current highest bid by at least the minimum increment.';
    if (!highestP && discountP < r.minDiscountP) return 'Below the starting discount.';
    return '';
  }

  return { VERSION, FEE_BASIS, FEE_TIMING, FEE_SOURCE, DIV_TO, REMAINDER, TIE_BREAK, NO_BID, feeLabel, feeApplies, fee, settle, allocationFor, validate, schedule, istISO, checkBid };
})();

if (typeof module !== 'undefined') module.exports = ChitEngine;
