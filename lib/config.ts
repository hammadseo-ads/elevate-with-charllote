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
    /**
     * 7-day welcome flow engagement. TWO modes:
     *
     * MODE A — auto-compute from events (default, no Klaviyo setup needed):
     *   Leave all `segmentId` empty. The dashboard:
     *     1. Pulls profiles from `sourceListId`
     *     2. Pulls all "Opened Email" events in the last `lookbackDays`
     *     3. Matches each event's subject against `subjectPattern` to extract
     *        the day number (e.g. "Day 1: Welcome..." → day=1)
     *     4. Each profile lands in their FURTHEST day reached (one bucket per
     *        person), so the cards naturally show a dropoff funnel.
     *
     * MODE B — explicit Klaviyo segments (override per stage):
     *   Fill any `segmentId` and that stage reads from the segment instead.
     *   Mix-and-match is supported (some stages auto, some segment-backed).
     */
    emailSequence: {
      label:          "7-Day Welcome Flow Engagement",
      sourceListId:   "X2ib44",        // Quiz Submitters list
      metricName:     "Opened Email",  // Klaviyo metric to match events against
      subjectPattern: "Day\\s*(\\d+)", // regex (string) — captures day number from subject
      lookbackDays:   30,              // how far back to scan events
      stages: [
        { day: 1, label: "Day 1 Opened", segmentId: "" },
        { day: 2, label: "Day 2 Opened", segmentId: "" },
        { day: 3, label: "Day 3 Opened", segmentId: "" },
        { day: 4, label: "Day 4 Opened", segmentId: "" },
        { day: 5, label: "Day 5 Opened", segmentId: "" },
        { day: 6, label: "Day 6 Opened", segmentId: "" },
        { day: 7, label: "Day 7 Opened", segmentId: "" },
      ],
    },
    /**
     * Same machinery as emailSequence, but tracks DELIVERY instead of opens.
     * Renders as a separate section above the Opens section so you can
     * compare delivery dropoff (bounces / unsubscribes) vs engagement dropoff.
     */
    emailReceived: {
      label:          "7-Day Welcome Flow Delivery",
      sourceListId:   "X2ib44",
      metricName:     "Received Email",
      subjectPattern: "Day\\s*(\\d+)",
      lookbackDays:   30,
      stages: [
        { day: 1, label: "Day 1 Received", segmentId: "" },
        { day: 2, label: "Day 2 Received", segmentId: "" },
        { day: 3, label: "Day 3 Received", segmentId: "" },
        { day: 4, label: "Day 4 Received", segmentId: "" },
        { day: 5, label: "Day 5 Received", segmentId: "" },
        { day: 6, label: "Day 6 Received", segmentId: "" },
        { day: 7, label: "Day 7 Received", segmentId: "" },
      ],
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
    /**
     * Restrict the dashboard's GA4 numbers (visitors + traffic source) to ONLY
     * sessions that hit one of these landing pages. The dashboard UI shows a
     * picker built from this list so the user can filter to one page at a time.
     *
     * - path: GA4 pagePath (no domain, no query string). Trailing slash MUST
     *         match what GA4 sees, otherwise the filter returns zero.
     * - label: short display name for the picker button (keep under ~16 chars).
     */
    landingPages: [
      { path: "/back-in-the-body-in-8-weeks/", label: "8-Weeks Page" },
      { path: "/back-in-the-body-in-8/",       label: "Short Page"   },
    ],
  },
};
