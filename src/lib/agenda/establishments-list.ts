/**
 * Hospitals and courts of the Corrèze (Thomas, 2026-11-04), public
 * establishments, no personal data:
 * - hospitals: the official FINESS file (extract of 2026-05-04, data.gouv.fr),
 *   the establishments where someone stays (centres hospitaliers, psychiatry,
 *   SSR, long stay, clinics); day hospitals and screening centres are left out.
 *   Units sharing one building are one entry.
 * - courts: the official directory of the administration
 *   (api-lannuaire.service-public.fr, 2026-11-04), plus the Cour d'appel de
 *   Limoges, which covers the Corrèze.
 * Points from the Base Adresse Nationale, or the IGN point of interest when
 * the address is only a lieu-dit. `precise` = the point is the building.
 */
export type EstablishmentKind = "HOPITAL" | "TRIBUNAL";

export type Establishment = {
  readonly id: string;
  readonly kind: EstablishmentKind;
  readonly name: string;
  /** Other names people type (« hôpital de Tulle »), searched too. */
  readonly aka?: readonly string[];
  readonly street: string;
  readonly postcode: string;
  readonly city: string;
  readonly lat: number;
  readonly lon: number;
  readonly precise: boolean;
};

export const HOPITAUX_CORREZE: readonly Establishment[] = [
  { id: "190000018", kind: "HOPITAL", name: "Centre hospitalier de Brive (Dubois)", aka: ["hôpital de Brive", "CH Brive", "USLD Bel Air"], street: "3 Boulevard du Docteur Verlhac", postcode: "19100", city: "Brive-la-Gaillarde", lat: 45.168256, lon: 1.536205, precise: true },
  { id: "190013482", kind: "HOPITAL", name: "Centre hospitalier de Brive – site Saint-Germain", aka: ["clinique Saint-Germain"], street: "12 Boulevard Paul Painlevé", postcode: "19100", city: "Brive-la-Gaillarde", lat: 45.168024, lon: 1.538982, precise: true },
  { id: "190011601", kind: "HOPITAL", name: "Site spécialisé Henri Laborit", aka: ["psychiatrie Brive"], street: "1 Rue Jean Filliol", postcode: "19100", city: "Brive-la-Gaillarde", lat: 45.171255, lon: 1.537409, precise: true },
  { id: "190000125", kind: "HOPITAL", name: "Val Horizon, réhabilitation psychosociale", street: "49 Rue Émile Pagnon", postcode: "19100", city: "Brive-la-Gaillarde", lat: 45.153776, lon: 1.554368, precise: false },
  { id: "190000224", kind: "HOPITAL", name: "Clinique les Cèdres", street: "Impasse des Cèdres", postcode: "19100", city: "Brive-la-Gaillarde", lat: 45.160556, lon: 1.499682, precise: true },
  { id: "190005694", kind: "HOPITAL", name: "Clinique Saint-Jean lez Cèdres", street: "Impasse des Cèdres", postcode: "19100", city: "Brive-la-Gaillarde", lat: 45.161035, lon: 1.499754, precise: true },
  { id: "190005983", kind: "HOPITAL", name: "L'Escale, unité de soins psychiatriques", street: "Impasse des Aubazines", postcode: "19360", city: "Malemort", lat: 45.17555, lon: 1.57811, precise: false },
  { id: "190000026", kind: "HOPITAL", name: "Centre hospitalier Cœur de Corrèze", aka: ["hôpital de Tulle", "CH Tulle"], street: "3 Place du Docteur Maschat", postcode: "19000", city: "Tulle", lat: 45.270385, lon: 1.769612, precise: true },
  { id: "190002493", kind: "HOPITAL", name: "Centre hospitalier du Chandou (rééducation, long séjour)", aka: ["les 9 Pierres", "USLD Tulle", "convalescence Chandou"], street: "Chemin du Chandou", postcode: "19000", city: "Tulle", lat: 45.283838, lon: 1.768021, precise: true },
  { id: "190000091", kind: "HOPITAL", name: "Centre hospitalier d'Ussel", aka: ["hôpital d'Ussel", "USLD Ussel", "psychiatrie Ussel"], street: "2 Avenue du Docteur Roullet", postcode: "19200", city: "Ussel", lat: 45.544219, lon: 2.312738, precise: true },
  { id: "190000034", kind: "HOPITAL", name: "Hôpital de Bort-les-Orgues", aka: ["USLD Bort-les-Orgues"], street: "190 Rue Gustave Parre", postcode: "19110", city: "Bort-les-Orgues", lat: 45.392724, lon: 2.497296, precise: true },
  { id: "190005140", kind: "HOPITAL", name: "Hôpital d'Uzerche (long séjour)", aka: ["USLD Uzerche"], street: "Rue Raymond Sidois", postcode: "19140", city: "Uzerche", lat: 45.430578, lon: 1.56743, precise: false },
  { id: "190012476", kind: "HOPITAL", name: "Centre hospitalier Jean-Marie Dauzier (SSR, long séjour)", aka: ["hôpital de Cornil", "USLD Cornil"], street: "32 Grand'Rue", postcode: "19150", city: "Cornil", lat: 45.207798, lon: 1.691263, precise: true },
  { id: "190000711", kind: "HOPITAL", name: "Centre hospitalier du Pays d'Eygurande", aka: ["psychiatrie Eygurande"], street: "La Cellette", postcode: "19340", city: "Monestier-Merlines", lat: 45.640491, lon: 2.513501, precise: true },
  { id: "190011684", kind: "HOPITAL", name: "Unité de soins l'Atrium (CH du Pays d'Eygurande)", street: "Route d'Eygurande", postcode: "19340", city: "Monestier-Merlines", lat: 45.655027, lon: 2.465757, precise: false },
  { id: "190004796", kind: "HOPITAL", name: "Les Rouchauds, addictologie (CH du Pays d'Eygurande)", aka: ["UTMA", "SMR addictologie"], street: "L'Abeille", postcode: "19340", city: "Monestier-Merlines", lat: 45.652587, lon: 2.46292, precise: false },
  { id: "190005975", kind: "HOPITAL", name: "Unité de soins le Cantou (CH du Pays d'Eygurande)", street: "5 Route des Rouchauds", postcode: "19340", city: "Merlines", lat: 45.638031, lon: 2.463571, precise: true },
];

export const TRIBUNAUX: readonly Establishment[] = [
  { id: "tj-tulle", kind: "TRIBUNAL", name: "Tribunal judiciaire de Tulle", aka: ["palais de justice de Tulle", "juge des tutelles Tulle", "conseil de prud'hommes de Tulle"], street: "9 Quai Gabriel Péri", postcode: "19000", city: "Tulle", lat: 45.265574, lon: 1.770556, precise: true },
  { id: "tj-brive", kind: "TRIBUNAL", name: "Tribunal judiciaire de Brive-la-Gaillarde", aka: ["palais de justice de Brive", "juge des tutelles Brive", "tribunal pour enfants de Brive"], street: "Boulevard du Maréchal Lyautey", postcode: "19100", city: "Brive-la-Gaillarde", lat: 45.156727, lon: 1.532454, precise: true },
  { id: "cph-brive", kind: "TRIBUNAL", name: "Conseil de prud'hommes et tribunal de commerce de Brive-la-Gaillarde", street: "6 Rue Saint-Bernard", postcode: "19100", city: "Brive-la-Gaillarde", lat: 45.157549, lon: 1.531401, precise: true },
  { id: "ca-limoges", kind: "TRIBUNAL", name: "Cour d'appel de Limoges", street: "17 Place d'Aine", postcode: "87000", city: "Limoges", lat: 45.83026, lon: 1.254324, precise: true },
];
