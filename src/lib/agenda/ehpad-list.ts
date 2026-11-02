/**
 * EHPAD de la Corrèze (19), from the official FINESS file (category 500,
 * extract of 2026-05-04, data.gouv.fr), geolocated with the Base Adresse
 * Nationale. `precise` = the point is the building (house number), else the
 * street. Public establishments, no personal data.
 */
export type Ehpad = {
  readonly id: string;
  readonly name: string;
  readonly street: string;
  readonly postcode: string;
  readonly city: string;
  readonly lat: number;
  readonly lon: number;
  readonly precise: boolean;
};

export const EHPADS_CORREZE: readonly Ehpad[] = [
  { id: "190000083", name: "EHPAD Neuvic", street: "1 Rue de la Grive", postcode: "19160", city: "Neuvic", lat: 45.381419, lon: 2.269391, precise: true },
  { id: "190000299", name: "EHPAD Argentat", street: "14 Avenue Raymond Poincaré", postcode: "19400", city: "Argentat-sur-Dordogne", lat: 45.091, lon: 1.943814, precise: true },
  { id: "190001438", name: "EHPAD la Chataigneraie de Beynat", street: "59 Rue Suzanne Issoulie", postcode: "19190", city: "Beynat", lat: 45.124855, lon: 1.724905, precise: true },
  { id: "190001834", name: "EHPAD des Fontaines", street: "Rue du Grand Soleil", postcode: "19000", city: "Tulle", lat: 45.285142, lon: 1.773322, precise: false },
  { id: "190002097", name: "EHPAD d'Allassac", street: "Place Michel Labrousse", postcode: "19240", city: "Allassac", lat: 45.258267, lon: 1.476598, precise: false },
  { id: "190002113", name: "EHPAD Cornil", street: "32 Grand'Rue", postcode: "19150", city: "Cornil", lat: 45.207798, lon: 1.691263, precise: true },
  { id: "190002121", name: "EHPAD de Meymac", street: "13 Place de la Coulee Verte", postcode: "19250", city: "Meymac", lat: 45.534616, lon: 2.141842, precise: true },
  { id: "190002139", name: "EHPAD les Mille Sources", street: "25 Avenue du 8 Mai 1945", postcode: "19260", city: "Treignac", lat: 45.532287, lon: 1.797701, precise: true },
  { id: "190002170", name: "EHPAD de Correze", street: "1 Rue de Goutteredon", postcode: "19800", city: "Corrèze", lat: 45.372836, lon: 1.865229, precise: true },
  { id: "190002188", name: "EHPAD Ernest Coutaud", street: "Route du Rat", postcode: "19290", city: "Peyrelevade", lat: 45.705757, lon: 2.051527, precise: false },
  { id: "190002733", name: "EHPAD de l'Hopital Local de Bort les Orgues", street: "190 Rue Gustave Parre", postcode: "19110", city: "Bort-les-Orgues", lat: 45.392724, lon: 2.497296, precise: true },
  { id: "190002964", name: "EHPAD le Jardin de Bagatelle", street: "3 Rue des Médaillés Militaires", postcode: "19210", city: "Lubersac", lat: 45.440264, lon: 1.397815, precise: true },
  { id: "190003665", name: "EHPAD Merlines", street: "Avenue Paul Vergely", postcode: "19340", city: "Merlines", lat: 45.64837, lon: 2.458599, precise: false },
  { id: "190003673", name: "EHPAD Chamberet", street: "6 Route de Boisse", postcode: "19370", city: "Chamberet", lat: 45.579266, lon: 1.712573, precise: true },
  { id: "190003681", name: "EHPAD Bruyeres et Genets", street: "8 Rue Virgile Meyer et l’Parel", postcode: "19170", city: "Bugeat", lat: 45.593375, lon: 1.930794, precise: true },
  { id: "190003699", name: "EHPAD les Pres de Chignac - Arnac-Pompadour", street: "5 Avenue du Saupiquet", postcode: "19230", city: "Arnac-Pompadour", lat: 45.401244, lon: 1.383881, precise: true },
  { id: "190003723", name: "Residence Medicalisee Pour Personnes Agees Uzerche", street: "Rue Raymond Sidois", postcode: "19140", city: "Uzerche", lat: 45.430578, lon: 1.56743, precise: false },
  { id: "190003731", name: "EHPAD J et M Colaud", street: "11 Rue de Bellevue", postcode: "19220", city: "Saint-Privat", lat: 45.138023, lon: 2.090915, precise: true },
  { id: "190003749", name: "EHPAD de Seilhac", street: "34 Avenue Nationale", postcode: "19700", city: "Seilhac", lat: 45.366443, lon: 1.717227, precise: true },
  { id: "190003756", name: "EHPAD l'Oree des Bois", street: "6 Rue Antoine Deshors", postcode: "19470", city: "Le Lonzac", lat: 45.469078, lon: 1.739007, precise: true },
  { id: "190003764", name: "EHPAD Marcillac-la-Croisille", street: "3 Rue Marthe Metivier", postcode: "19320", city: "Marcillac-la-Croisille", lat: 45.270606, lon: 2.022439, precise: true },
  { id: "190003772", name: "EHPAD Residence du Clos Joli", street: "Rue du Clos Joli", postcode: "19500", city: "Meyssac", lat: 45.056815, lon: 1.67358, precise: false },
  { id: "190003780", name: "EHPAD Residence les Grands Pres", street: "2 Impasse Des Grands Prés", postcode: "19130", city: "Objat", lat: 45.270696, lon: 1.412105, precise: true },
  { id: "190003806", name: "EHPAD de Lagrauliere - Residence Pre du Puy", street: "2 Allée du Pré du Puy", postcode: "19700", city: "Lagraulière", lat: 45.351625, lon: 1.633645, precise: true },
  { id: "190003814", name: "EHPAD Donzenac", street: "Rue Du Martel", postcode: "19270", city: "Donzenac", lat: 45.219941, lon: 1.5254, precise: false },
  { id: "190003822", name: "EHPAD de Chamboulive", street: "Voie du Tacot", postcode: "19450", city: "Chamboulive", lat: 45.430597, lon: 1.704433, precise: false },
  { id: "190003905", name: "EHPAD de Mansac", street: "621 Route De Charles Gobert", postcode: "19520", city: "Mansac", lat: 45.182277, lon: 1.354151, precise: true },
  { id: "190004028", name: "EHPAD de Sornac", street: "2 Route de l’Etang", postcode: "19290", city: "Sornac", lat: 45.669817, lon: 2.189516, precise: true },
  { id: "190004036", name: "EHPAD Egletons", street: "6 Rue du Cardinal Fabri", postcode: "19300", city: "Égletons", lat: 45.406193, lon: 2.04006, precise: true },
  { id: "190004044", name: "PUV Sainte-Fortunade", street: "12 Rue des Lauriers", postcode: "19490", city: "Sainte-Fortunade", lat: 45.203806, lon: 1.770958, precise: true },
  { id: "190004119", name: "EHPAD Residence les Ecureuils", street: "2 Avenue du Docteur Roullet", postcode: "19200", city: "Ussel", lat: 45.544219, lon: 2.312738, precise: true },
  { id: "190005207", name: "EHPAD les Gabariers de Beaulieu sur Dordogne", street: "11 Rue Saint-Roch", postcode: "19120", city: "Beaulieu-sur-Dordogne", lat: 44.978912, lon: 1.840461, precise: true },
  { id: "190005231", name: "EHPAD Residence Commaignac", street: "25 Route de Brive", postcode: "19410", city: "Vigeois", lat: 45.378074, lon: 1.520308, precise: true },
  { id: "190005520", name: "EHPAD Eygurande", street: "2 Rue du Parc", postcode: "19340", city: "Eygurande", lat: 45.662621, lon: 2.450434, precise: true },
  { id: "190005652", name: "EHPAD Brive", street: "Rue De La Concorde", postcode: "19100", city: "Brive-la-Gaillarde", lat: 45.166943, lon: 1.536823, precise: false },
  { id: "190005926", name: "EHPAD les Hortensias", street: "Impasse Laschamps", postcode: "19350", city: "Chabrignac", lat: 45.321291, lon: 1.329102, precise: false },
  { id: "190008128", name: "EHPAD Res Novel", street: "Allee Du Docteur Charcot", postcode: "19240", city: "Varetz", lat: 45.18817, lon: 1.448616, precise: false },
  { id: "190008169", name: "EHPAD du Pays de Brive", street: "2 Allee Roger Combe", postcode: "19100", city: "Brive-la-Gaillarde", lat: 45.168482, lon: 1.498216, precise: true },
  { id: "190008508", name: "EHPAD Residence les Jardins de l'Etang", street: "6 Rue Pierre Pradoux", postcode: "19460", city: "Naves", lat: 45.314279, lon: 1.769227, precise: true },
  { id: "190010884", name: "EHPAD Residence du Chateau de Cosnac", street: "Avenue Du 8 Mai 1945", postcode: "19360", city: "Cosnac", lat: 45.137465, lon: 1.582014, precise: false },
  { id: "190011395", name: "EHPAD le Chandou - Tulle", street: "Chemin du Chandou", postcode: "19000", city: "Tulle", lat: 45.284064, lon: 1.767424, precise: false },
  { id: "190011544", name: "EHPAD Brive - Bel Air", street: "14 Rue De Bel Air", postcode: "19100", city: "Brive-la-Gaillarde", lat: 45.173454, lon: 1.540827, precise: true },
  { id: "190011635", name: "EHPAD de Perpezac-le-Noir", street: "40 Rue Principale", postcode: "19410", city: "Perpezac-le-Noir", lat: 45.325869, lon: 1.553333, precise: true },
  { id: "190012369", name: "EHPAD du Pays de Brive - Site Malemort", street: "Rue Alfred De Musset", postcode: "19360", city: "Malemort", lat: 45.168956, lon: 1.584808, precise: false },
];
