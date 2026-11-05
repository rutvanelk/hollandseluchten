// Tweetalige teksten. Nederlands is de standaard; t(nl, en) kiest op het moment van tonen.
(function () {
  "use strict";

  const EXAMPLES = [
    { nl: "Hoe verhouden de PM2.5-waarden in januari zich tot december?", en: "How do the PM2.5 values in January compare with December?" },
    { nl: "Welke sensor heeft de slechtste luchtkwaliteit in Haarlem-Noord?", en: "Which sensor has the worst air quality in Haarlem-Noord?" },
    { nl: "Is de luchtkwaliteit dit jaar beter of slechter geworden?", en: "Has air quality got better or worse this year?" },
    { nl: "Waren er vorige maand opvallende pieken?", en: "Were there any unusual peaks last month?" },
    { nl: "Is de lucht in het weekend beter dan doordeweeks?", en: "Is the air better at the weekend than on weekdays?" },
    { nl: "Wanneer kwam fijnstof boven de WHO-norm?", en: "When did particulate matter exceed the WHO guideline?" },
    { nl: "Hoe verhouden onze sensoren zich tot het officiële meetstation?", en: "How do our sensors compare with the official monitoring station?" },
    { nl: "Wat is de gemiddelde luchtkwaliteit in Schalkwijk?", en: "What is the average air quality in Schalkwijk?" },
    { nl: "Welke soorten metingen doen de sensoren?", en: "What kinds of measurements do the sensors take?" },
    { nl: "Wat is het effect van de bouwplaats op mijn straat?", en: "What is the effect of the construction site on my street?" },
    { nl: "Hoe wordt de luchtkwaliteit volgende week?", en: "What will air quality be like next week?" },
  ];

  // Vervolgvragen, gekoppeld aan de voorbeelden hierboven zodat de planner ze herkent.
  const FOLLOW = {
    peaks: 3,
    vsRef: 6,
    who: 5,
    trend: 2,
    worst: 1,
    weekend: 4,
    janDec: 0,
    average: 7,
  };

  const I18N = {
    lang: "nl",
    listeners: [],
    examples: EXAMPLES,
    t(nl, en) {
      return this.lang === "en" ? en : nl;
    },
    follow(key) {
      const ex = EXAMPLES[FOLLOW[key]];
      return this.t(ex.nl, ex.en);
    },
    exampleIn(question, lang) {
      const ex = EXAMPLES.find((e) => e.nl === question || e.en === question);
      return ex ? ex[lang] : null;
    },
    refName() {
      return this.t("Referentiestation Haarlem (mock)", "Haarlem reference station (mock)");
    },
    onChange(fn) {
      this.listeners.push(fn);
    },
    set(lang) {
      this.lang = lang === "en" ? "en" : "nl";
      document.documentElement.lang = this.lang;
      document.querySelectorAll(".lang-toggle button").forEach((b) => b.classList.toggle("on", b.dataset.lang === this.lang));
      this.listeners.forEach((fn) => fn());
    },
  };

  window.I18N = I18N;
})();
