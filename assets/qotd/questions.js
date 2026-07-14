/* Den 1880 — Question of the Day config.
 *
 * QUESTIONS NOW LIVE IN THE GOOGLE SHEET ("questions" tab) — post a question,
 * enter whiteboard votes, and finalize results there; the site picks changes
 * up on every visit and re-checks every minute while the page is open.
 * See QOTD-Backend-Setup.md.
 *
 * The list below is only the OFFLINE FALLBACK, used if the Sheet backend is
 * unreachable. Keep one sensible question in it.
 */
window.QOTD_API = "https://script.google.com/macros/s/AKfycbwkv5qEoUsRACWkoRKkEM8L-TqEcz0b4Z0nIGZLNODPul4l-6mXgRxKpBRa7jepvHgG4Q/exec"; // ends in /exec — see QOTD-Backend-Setup.md
window.QOTD_POLL_MS = 60000; // how often an open page re-checks the sheet

window.QOTD_QUESTIONS = [
  {
    id: "qd-001",
    eyebrow: "Question of the Day · No. 001",
    question: "Would you rather lose all of your <em>past</em> memory, or all of your <em>future</em> memory?",
    questionPlain: "Would you rather lose all of your past memory, or all of your future memory?",
    options: ["My past can go", "My future can go"],
    opensAt: "2026-07-14T13:00:00-04:00",
    durationHours: 24,
    hero: "/assets/qotd/qd-001-hero.jpg",
    heroOg: "https://den1880.co/assets/qotd/qd-001-hero-og.jpg",
    heroAlt: "A longitudinal study of one life's memories, split at now: the archive behind, the unwritten ahead",
    audience: "the Den 1880 community",
    blurbTemplate: "{pct}% of {audience} would rather {answer}.",
    answerPhrases: ["give up every memory they've made", "give up every memory still to come"],
    closers: [
      "Torch the archive, keep the pen. So the point of a memory was never keeping it?",
      "Keep the tape, give up the pen. What are you saving it all for, if nothing new sticks?"
    ],
    tieCloser: "Split right down the middle. Half the room lives for the story so far, half for the chapters ahead."
  }
];
