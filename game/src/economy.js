// The economy: money between rounds, spent in the buy menu. Win pays, a losing
// streak pays more each round, and kills, plants and defuses pay on the spot.
// Weapons bought are lost when the buyer dies in a lost round.
import { CFG } from './config.js';

const E = CFG.economy;

export function createEconomy() {
  const state = {
    money: E.start,
    lossStreak: 0,
    roundWins: 0,
    roundLosses: 0,
  };

  return {
    state,
    canAfford(price) {
      return state.money >= price;
    },
    spend(price) {
      if (state.money < price) return false;
      state.money -= price;
      return true;
    },
    award(amount) {
      state.money += amount;
    },
    // Called when a round ends: win pays flat, loss pays base plus streak bonus.
    settleRound(won) {
      if (won) {
        state.money += E.win;
        state.lossStreak = 0;
        state.roundWins += 1;
      } else {
        state.money += Math.min(E.lossCap, E.lossBase + state.lossStreak * E.lossStreakBonus);
        state.lossStreak += 1;
        state.roundLosses += 1;
      }
    },
    reset() {
      state.money = E.start;
      state.lossStreak = 0;
      state.roundWins = 0;
      state.roundLosses = 0;
    },
  };
}
