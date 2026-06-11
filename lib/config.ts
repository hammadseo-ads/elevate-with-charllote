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
     * 7-day welcome flow engagement tracking. Each entry is a Klaviyo
     * SEGMENT that contains profiles who opened that day's email.
     * Leave segmentId="" and the dashboard hides that card.
     *
     * Setup in Klaviyo (one-time):
     *   Audience -> Lists & Segments -> Create Segment
     *     Definition: "What someone has done (or not done)"
     *     Choose metric: "Opened Email"
     *     Filter: Subject contains "Day 1"   (or use $message_name / Campaign Name
     *                                          depending on how your flow emails are tagged)
     *     Name it: "Opened Day 1 Email"
     *   Copy the segment ID from the URL (e.g. abc123 from /segment/abc123/...)
     *
     * Repeat for Days 2-7, paste IDs below.
     */
    emailSequence: {
      label: "7-Day Welcome Flow Engagement",
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
