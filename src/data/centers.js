// src/data/centers.js
// Structured directory of US cell therapy programs (FACT-accredited /
// NMDP-recognized / publicly documented as CAR-T centers).
//
// Curation rules:
//   - High-volume, publicly verifiable programs only
//   - State-level location (no street addresses — keeps the data
//     dependency low and is sufficient for state-based nearest-match)
//   - Indications array drives matching to a patient's cancer type
//   - Products array drives matching to a specific therapy when known
//
// Source: FACT accreditation registry · NMDP transplant center directory ·
// publicly disclosed CAR-T program announcements. Not a contracted
// partnership list — this is a public directory.

export const US_REGIONS = {
  NE: ["ME", "NH", "VT", "MA", "RI", "CT", "NY", "NJ", "PA"],
  SE: ["DE", "MD", "DC", "VA", "WV", "NC", "SC", "GA", "FL", "TN", "KY", "AL", "MS", "AR", "LA"],
  MW: ["OH", "IN", "MI", "IL", "WI", "MN", "IA", "MO", "ND", "SD", "NE", "KS"],
  SW: ["TX", "OK", "NM", "AZ"],
  W:  ["CO", "WY", "MT", "ID", "UT", "NV", "CA", "OR", "WA", "AK", "HI"],
};

export function regionOf(state) {
  if (!state) return null;
  const s = state.toUpperCase();
  for (const [region, states] of Object.entries(US_REGIONS)) {
    if (states.includes(s)) return region;
  }
  return null;
}

export const CENTERS = [
  // ── Northeast ──────────────────────────────────────────────────────────
  { id: "msk",        name: "Memorial Sloan Kettering Cancer Center",   city: "New York",     state: "NY", indications: ["dlbcl", "fl", "mcl", "cll", "all", "mm"], products: ["yescarta", "kymriah", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://www.mskcc.org" },
  { id: "dfci",       name: "Dana-Farber Cancer Institute",             city: "Boston",       state: "MA", indications: ["dlbcl", "fl", "mcl", "cll", "all", "mm"], products: ["yescarta", "kymriah", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://www.dana-farber.org" },
  { id: "penn",       name: "Penn Medicine — Abramson Cancer Center",    city: "Philadelphia", state: "PA", indications: ["dlbcl", "fl", "mcl", "cll", "all", "mm"], products: ["yescarta", "kymriah", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://www.pennmedicine.org" },
  { id: "yale",       name: "Smilow Cancer Hospital — Yale",             city: "New Haven",    state: "CT", indications: ["dlbcl", "fl", "mcl", "all", "mm"],         products: ["yescarta", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://www.ynhh.org" },
  { id: "columbia",   name: "Columbia / NYP Herbert Irving CCC",         city: "New York",     state: "NY", indications: ["dlbcl", "fl", "mcl", "cll", "all", "mm"], products: ["yescarta", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://www.cancer.columbia.edu" },
  { id: "mt-sinai",   name: "Mount Sinai Tisch Cancer Center",           city: "New York",     state: "NY", indications: ["dlbcl", "fl", "mcl", "mm"],                products: ["yescarta", "breyanzi", "abecma", "carvykti"],             factAccredited: true, nmdpAffiliated: true, url: "https://www.mountsinai.org" },
  { id: "fox-chase",  name: "Fox Chase Cancer Center",                   city: "Philadelphia", state: "PA", indications: ["dlbcl", "fl", "mm"],                         products: ["yescarta", "breyanzi", "carvykti"],                        factAccredited: true, nmdpAffiliated: true, url: "https://www.foxchase.org" },
  { id: "roswell",    name: "Roswell Park Comprehensive Cancer Center",  city: "Buffalo",      state: "NY", indications: ["dlbcl", "mcl", "all", "mm"],                products: ["yescarta", "tecartus", "abecma"],                          factAccredited: true, nmdpAffiliated: true, url: "https://www.roswellpark.org" },
  { id: "hackensack", name: "Hackensack Meridian John Theurer CC",        city: "Hackensack",   state: "NJ", indications: ["dlbcl", "fl", "mm"],                         products: ["yescarta", "breyanzi", "abecma", "carvykti"],             factAccredited: true, nmdpAffiliated: true, url: "https://www.hackensackmeridianhealth.org" },

  // ── Southeast ──────────────────────────────────────────────────────────
  { id: "duke",       name: "Duke Cancer Institute",                     city: "Durham",       state: "NC", indications: ["dlbcl", "fl", "mcl", "cll", "all", "mm"], products: ["yescarta", "kymriah", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://dukecancerinstitute.org" },
  { id: "unc",        name: "UNC Lineberger Comprehensive Cancer Center", city: "Chapel Hill",  state: "NC", indications: ["dlbcl", "fl", "mcl", "mm"],                products: ["yescarta", "breyanzi", "carvykti"],                        factAccredited: true, nmdpAffiliated: true, url: "https://unclineberger.org" },
  { id: "emory",      name: "Emory Winship Cancer Institute",            city: "Atlanta",      state: "GA", indications: ["dlbcl", "fl", "mcl", "cll", "mm"],         products: ["yescarta", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://winshipcancer.emory.edu" },
  { id: "moffitt",    name: "Moffitt Cancer Center",                     city: "Tampa",        state: "FL", indications: ["dlbcl", "fl", "mcl", "cll", "all", "mm"], products: ["yescarta", "kymriah", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://moffitt.org" },
  { id: "miami",      name: "Sylvester Comprehensive Cancer Center",     city: "Miami",        state: "FL", indications: ["dlbcl", "fl", "mm"],                         products: ["yescarta", "breyanzi", "abecma", "carvykti"],             factAccredited: true, nmdpAffiliated: true, url: "https://umiamihealth.org/sylvester" },
  { id: "vanderbilt", name: "Vanderbilt-Ingram Cancer Center",           city: "Nashville",    state: "TN", indications: ["dlbcl", "fl", "mcl", "all", "mm"],          products: ["yescarta", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://www.vicc.org" },
  { id: "uab",        name: "UAB O'Neal Comprehensive Cancer Center",    city: "Birmingham",   state: "AL", indications: ["dlbcl", "fl", "mm"],                         products: ["yescarta", "breyanzi", "abecma"],                           factAccredited: true, nmdpAffiliated: true, url: "https://www.uab.edu/onealcancercenter" },
  { id: "hopkins",    name: "Johns Hopkins Sidney Kimmel CCC",            city: "Baltimore",    state: "MD", indications: ["dlbcl", "fl", "mcl", "cll", "all", "mm"], products: ["yescarta", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://www.hopkinsmedicine.org/kimmel-cancer-center" },
  { id: "vcu",        name: "VCU Massey Cancer Center",                  city: "Richmond",     state: "VA", indications: ["dlbcl", "mm"],                                products: ["yescarta", "abecma"],                                        factAccredited: true, nmdpAffiliated: true, url: "https://www.massey.vcu.edu" },

  // ── Midwest ────────────────────────────────────────────────────────────
  { id: "mayo-roch",  name: "Mayo Clinic — Rochester",                   city: "Rochester",    state: "MN", indications: ["dlbcl", "fl", "mcl", "cll", "all", "mm"], products: ["yescarta", "kymriah", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://www.mayoclinic.org" },
  { id: "ccf",        name: "Cleveland Clinic Taussig Cancer Institute",  city: "Cleveland",    state: "OH", indications: ["dlbcl", "fl", "mcl", "cll", "mm"],         products: ["yescarta", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://my.clevelandclinic.org/departments/cancer" },
  { id: "osu",        name: "Ohio State James Cancer Hospital",          city: "Columbus",     state: "OH", indications: ["dlbcl", "fl", "mcl", "cll", "all", "mm"], products: ["yescarta", "kymriah", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://cancer.osu.edu" },
  { id: "umich",      name: "University of Michigan Rogel Cancer Center", city: "Ann Arbor",    state: "MI", indications: ["dlbcl", "fl", "mcl", "all", "mm"],          products: ["yescarta", "breyanzi", "tecartus", "abecma"],               factAccredited: true, nmdpAffiliated: true, url: "https://www.rogelcancercenter.org" },
  { id: "karmanos",   name: "Karmanos Cancer Institute",                  city: "Detroit",      state: "MI", indications: ["dlbcl", "fl", "mm"],                         products: ["yescarta", "breyanzi", "carvykti"],                          factAccredited: true, nmdpAffiliated: true, url: "https://www.karmanos.org" },
  { id: "northwestern", name: "Northwestern Lurie Cancer Center",         city: "Chicago",      state: "IL", indications: ["dlbcl", "fl", "mcl", "cll", "mm"],         products: ["yescarta", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://cancer.northwestern.edu" },
  { id: "uchicago",   name: "University of Chicago Medicine CCC",         city: "Chicago",      state: "IL", indications: ["dlbcl", "fl", "mcl", "all", "mm"],          products: ["yescarta", "kymriah", "breyanzi", "tecartus", "abecma"],   factAccredited: true, nmdpAffiliated: true, url: "https://www.uchicagomedicine.org" },
  { id: "rush",       name: "Rush University Cancer Center",              city: "Chicago",      state: "IL", indications: ["dlbcl", "mm"],                                products: ["yescarta", "abecma"],                                         factAccredited: true, nmdpAffiliated: true, url: "https://www.rush.edu" },
  { id: "froedtert",  name: "Froedtert / Medical College of Wisconsin",   city: "Milwaukee",    state: "WI", indications: ["dlbcl", "fl", "mcl", "mm"],                  products: ["yescarta", "breyanzi", "tecartus", "abecma"],               factAccredited: true, nmdpAffiliated: true, url: "https://www.froedtert.com" },
  { id: "siteman",    name: "Siteman Cancer Center — Washington Univ.",   city: "St. Louis",    state: "MO", indications: ["dlbcl", "fl", "mcl", "all", "mm"],          products: ["yescarta", "kymriah", "breyanzi", "tecartus", "abecma"],   factAccredited: true, nmdpAffiliated: true, url: "https://siteman.wustl.edu" },
  { id: "kumc",       name: "University of Kansas Cancer Center",         city: "Kansas City",  state: "KS", indications: ["dlbcl", "fl", "mm"],                         products: ["yescarta", "breyanzi", "abecma", "carvykti"],                factAccredited: true, nmdpAffiliated: true, url: "https://www.kucancercenter.org" },
  { id: "nebraska",   name: "Nebraska Medicine Fred & Pamela Buffett CC", city: "Omaha",        state: "NE", indications: ["dlbcl", "fl", "mcl", "mm"],                  products: ["yescarta", "breyanzi", "tecartus", "abecma"],               factAccredited: true, nmdpAffiliated: true, url: "https://www.unmc.edu" },

  // ── Southwest ──────────────────────────────────────────────────────────
  { id: "mdacc",      name: "MD Anderson Cancer Center",                 city: "Houston",      state: "TX", indications: ["dlbcl", "fl", "mcl", "cll", "all", "mm"], products: ["yescarta", "kymriah", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://www.mdanderson.org" },
  { id: "baylor",     name: "Baylor College of Medicine — Dan L Duncan", city: "Houston",      state: "TX", indications: ["dlbcl", "fl", "all", "mm"],                products: ["yescarta", "breyanzi", "abecma"],                            factAccredited: true, nmdpAffiliated: true, url: "https://www.bcm.edu/centers/cancer-center" },
  { id: "utsw",       name: "UT Southwestern Simmons Cancer Center",     city: "Dallas",       state: "TX", indications: ["dlbcl", "fl", "mcl", "mm"],                  products: ["yescarta", "breyanzi", "tecartus", "abecma"],               factAccredited: true, nmdpAffiliated: true, url: "https://utswmed.org" },
  { id: "mays",       name: "Mays Cancer Center — UT Health San Antonio", city: "San Antonio",  state: "TX", indications: ["dlbcl", "mm"],                                products: ["yescarta", "abecma"],                                         factAccredited: true, nmdpAffiliated: true, url: "https://cancer.uthscsa.edu" },
  { id: "mayo-az",    name: "Mayo Clinic — Arizona",                     city: "Phoenix",      state: "AZ", indications: ["dlbcl", "fl", "mcl", "mm"],                  products: ["yescarta", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://www.mayoclinic.org" },
  { id: "banner",     name: "Banner MD Anderson Cancer Center",          city: "Gilbert",      state: "AZ", indications: ["dlbcl", "fl", "mm"],                         products: ["yescarta", "breyanzi", "abecma"],                            factAccredited: true, nmdpAffiliated: false, url: "https://www.bannerhealth.com" },

  // ── West ───────────────────────────────────────────────────────────────
  { id: "stanford",   name: "Stanford Cancer Institute",                 city: "Stanford",     state: "CA", indications: ["dlbcl", "fl", "mcl", "cll", "all", "mm"], products: ["yescarta", "kymriah", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://stanfordhealthcare.org" },
  { id: "ucsf",       name: "UCSF Helen Diller Family CCC",               city: "San Francisco", state: "CA", indications: ["dlbcl", "fl", "mcl", "cll", "all", "mm"],products: ["yescarta", "kymriah", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://cancer.ucsf.edu" },
  { id: "city-hope",  name: "City of Hope National Medical Center",      city: "Duarte",       state: "CA", indications: ["dlbcl", "fl", "mcl", "cll", "all", "mm"], products: ["yescarta", "kymriah", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://www.cityofhope.org" },
  { id: "ucla",       name: "UCLA Jonsson Comprehensive Cancer Center",   city: "Los Angeles",  state: "CA", indications: ["dlbcl", "fl", "mcl", "all", "mm"],          products: ["yescarta", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://www.uclahealth.org/cancer" },
  { id: "ucsd",       name: "UC San Diego Moores Cancer Center",          city: "La Jolla",     state: "CA", indications: ["dlbcl", "fl", "mm"],                         products: ["yescarta", "breyanzi", "abecma"],                            factAccredited: true, nmdpAffiliated: true, url: "https://health.ucsd.edu/cancer" },
  { id: "ucdavis",    name: "UC Davis Comprehensive Cancer Center",       city: "Sacramento",   state: "CA", indications: ["dlbcl", "fl", "mm"],                         products: ["yescarta", "breyanzi", "abecma"],                            factAccredited: true, nmdpAffiliated: true, url: "https://health.ucdavis.edu/cancer" },
  { id: "fred-hutch", name: "Fred Hutchinson Cancer Center",              city: "Seattle",      state: "WA", indications: ["dlbcl", "fl", "mcl", "cll", "all", "mm"], products: ["yescarta", "kymriah", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://www.fredhutch.org" },
  { id: "ohsu",       name: "OHSU Knight Cancer Institute",               city: "Portland",     state: "OR", indications: ["dlbcl", "fl", "mcl", "mm"],                  products: ["yescarta", "breyanzi", "tecartus", "abecma"],               factAccredited: true, nmdpAffiliated: true, url: "https://www.ohsu.edu/knight-cancer-institute" },
  { id: "huntsman",   name: "Huntsman Cancer Institute — Utah",            city: "Salt Lake City", state: "UT", indications: ["dlbcl", "fl", "mm"],                      products: ["yescarta", "breyanzi", "abecma"],                            factAccredited: true, nmdpAffiliated: true, url: "https://healthcare.utah.edu/huntsmancancerinstitute" },
  { id: "uc-denver",  name: "University of Colorado Cancer Center",       city: "Aurora",       state: "CO", indications: ["dlbcl", "fl", "mcl", "all", "mm"],          products: ["yescarta", "breyanzi", "tecartus", "abecma", "carvykti"], factAccredited: true, nmdpAffiliated: true, url: "https://medschool.cuanschutz.edu/colorado-cancer-center" },
];

export const CENTER_COUNT_BY_STATE = CENTERS.reduce((acc, c) => {
  acc[c.state] = (acc[c.state] || 0) + 1;
  return acc;
}, {});

export const TOTAL_CENTERS = CENTERS.length;
