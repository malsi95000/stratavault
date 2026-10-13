// Export réaliste au format de la bêta 1.8 (JSON.stringify(st)), utilisé par les tests.
export const BETA_EXPORT = {
  notes: { FRA: "Puissance nucléaire, membre permanent du Conseil de sécurité.", UKR: "Conflit depuis 2014." },
  dates: { FRA: "2024-05-01" },
  links: [
    // Ancien format : codes pays sans préfixe.
    { id: "lv1abc0q7k2", a: "FRA", b: "DEU", title: "Moteur franco-allemand", note: "Traité de l'Élysée" },
    { id: "lv1abc1m3xz", a: "c:UKR", b: "p:lv1abd2r8wn", title: "", note: "", date: "2022-02-24" },
    { id: "lv1abc2k9pq", a: "o:lv1abe5t2aa", b: "t:lv1abf7h1bb", title: "Route", note: "" },
    { id: "lv1abc3z0zz", a: "z:lv1abg0c4cc", b: "c:XKX", title: "", note: "" },
  ],
  pings: [
    { id: "lv1abd2r8wn", ll: [30.5234, 50.4501], title: "Kyiv", note: "Capitale", type: "crise" },
    { id: "lv1abd3qq01", ll: [32.3, 31.2], title: "", note: "", type: "maritime", date: "2023-10-07" },
    // Balise d'une version antérieure, sans type.
    { id: "lv1abd4ab12", ll: [-5.6, 36.0], title: "Gibraltar", note: "" },
  ],
  points: [{ id: "lv1abe5t2aa", ll: [2.3522, 48.8566], title: "Paris", note: "", date: "" }],
  zones: [
    {
      id: "lv1abg0c4cc",
      ring: [
        [20, 42],
        [20, 44],
        [22, 44],
        [22, 42],
        [20, 42],
      ],
      title: "Balkans occidentaux",
      note: "Zone d'influence",
    },
  ],
  texts: [{ id: "lv1abf7h1bb", ll: [10, 45], title: "Route de la soie", note: "", date: "", size: 18 }],
  flux: {
    jaune: [
      {
        id: "lv1abh1dd01",
        points: [
          [0, 40],
          [5, 42],
          [10, 45],
        ],
        width: 4,
        opacity: 0.65,
      },
    ],
    "bleu-fonce": [
      {
        id: "lv1abh2ee02",
        points: [
          [-10, 30],
          [-5, 35],
        ],
        width: 12,
        opacity: 0.65,
      },
    ],
  },
  // Sortie réelle de la bêta : ses traits n'ont pas de propriété color, la saisie dans une fiche de flux
  // écrit donc dans st.fluxFiches[undefined].
  fluxFiches: { undefined: { title: "Gaz", note: "Gazoducs", date: "2024-01-01" } },
};
