/**
 * NON-SENSITIVE config — safe to commit to GitHub.
 * List IDs, form IDs, property IDs, revisions, etc. live here.
 * Only actual SECRETS (API keys, tokens, JSON) stay in env vars.
 */

export const CONFIG = {
  klaviyo: {
    revision: "2024-07-15",
    lists: {
      quizSubmitters:  "X2ib44",   // Reset Quiz Submitters
      quizFinished:    "SHXf9v",   // Quiz - Finished
      checkout:        "VgLXm8",   // Back in the Body Checkout Pop up
      abandonedCart:   "TnSzYp",   // Back in the Body — Abandoned Cart
      friend:          "Y57czV",   // Back in the body buyer: Referred Friend
      buyersAll:       "XchbFC",   // Back in the Body Checkout - Any Buyers
      // Tier-specific buyer lists (for revenue calculation)
      buyer269:        "VSKrxG",   // Basic Program 269
      buyer419:        "SaxTTX",   // Basic Program 269 + VIP 150
      buyer468:        "ThAYpN",   // Basic Program 269 + Refer Friend 199
      buyer618:        "RJPBU4",   // Basic 269 + VIP 150 + Refer Friend 199
      buyerDownsell:   "UTGB8f",   // Downsell Offer $199
      buyerLate:       "TxQKsT",   // 48 Hours Before the Session ($495)
    },
    // Prices for revenue calc
    tierPrices: {
      tier269:     269,
      tier419:     419,
      tier468:     468,
      tier618:     618,
      downsell199: 199,
      late495:     495,
    },
  },

  typeform: {
    formId: "M2D0Bc3U",   // Quiz: What's Holding Your Body Back? (active form)
  },

  ga4: {
    propertyId: "522083775",   // Elevatewithcharlotte
  },
};
