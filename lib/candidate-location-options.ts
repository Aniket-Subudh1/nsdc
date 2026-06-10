// Auto-generated from SIDH Bulk Candidate_upload Template.xlsx (Master Reference Data).
// Regenerate with: npm run extract:candidate-locations -- <workbook-path>

export const CANDIDATE_STATE_OPTIONS = [
  "ANDAMAN AND NICOBAR ISLANDS",
  "ANDHRA PRADESH",
  "ARUNACHAL PRADESH",
  "ASSAM",
  "BIHAR",
  "CHANDIGARH",
  "CHHATTISGARH",
  "DADRA AND NAGAR HAVELI",
  "DAMAN AND DIU",
  "DELHI",
  "GOA",
  "GUJARAT",
  "HARYANA",
  "HIMACHAL PRADESH",
  "JAMMU AND KASHMIR",
  "JHARKHAND",
  "KARNATAKA",
  "KERALA",
  "LAKSHADWEEP",
  "MADHYA PRADESH",
  "MAHARASHTRA",
  "MANIPUR",
  "MEGHALAYA",
  "MIZORAM",
  "NAGALAND",
  "ODISHA",
  "PUDUCHERRY",
  "PUNJAB",
  "RAJASTHAN",
  "SIKKIM",
  "TAMIL NADU",
  "TELANGANA",
  "TRIPURA",
  "UTTAR PRADESH",
  "UTTARAKHAND",
  "WEST BENGAL",
  "LADAKH"
] as const;

export type CandidateState = (typeof CANDIDATE_STATE_OPTIONS)[number];

export const CANDIDATE_STATE_DISTRICT_MAP: Record<CandidateState, readonly string[]> = {
  "ANDAMAN AND NICOBAR ISLANDS": [
    "NICOBARS",
    "NORTH AND MIDDLE ANDAMAN",
    "SOUTH ANDAMANS"
  ],
  "ANDHRA PRADESH": [
    "ANANTAPUR",
    "CHITTOOR",
    "EAST GODAVARI",
    "GUNTUR",
    "KRISHNA",
    "KURNOOL",
    "PRAKASAM",
    "SPSR NELLORE",
    "SRIKAKULAM",
    "VISAKHAPATANAM",
    "VIZIANAGARAM",
    "WEST GODAVARI",
    "Y.S.R."
  ],
  "ARUNACHAL PRADESH": [
    "ANJAW",
    "CHANGLANG",
    "DIBANG VALLEY",
    "EAST KAMENG",
    "EAST SIANG",
    "KAMLE",
    "KURUNG KUMEY",
    "KRA DAADI",
    "LOHIT",
    "LONGDING",
    "LOWER DIBANG VALLEY",
    "LOWER SIANG",
    "LOWER SUBANSIRI",
    "NAMSAI",
    "PAPUM PARE",
    "SIANG",
    "TAWANG",
    "TIRAP",
    "UPPER SIANG",
    "UPPER SUBANSIRI",
    "WEST KAMENG",
    "WEST SIANG"
  ],
  "ASSAM": [
    "BAKSA",
    "BARPETA",
    "BONGAIGAON",
    "Biswanath",
    "CACHAR",
    "CHARAIDEO",
    "CHIRANG",
    "DARRANG",
    "DHEMAJI",
    "DHUBRI",
    "DIBRUGARH",
    "DIMA HASAO",
    "GOALPARA",
    "GOLAGHAT",
    "HAILAKANDI",
    "HOJAI",
    "JORHAT",
    "KAMRUP",
    "KAMRUP METRO",
    "KARBI ANGLONG",
    "KARIMGANJ",
    "KOKRAJHAR",
    "LAKHIMPUR",
    "MAJULI",
    "MARIGAON",
    "NAGAON",
    "NALBARI",
    "SIVASAGAR",
    "SONITPUR",
    "SOUTH SALMARA MANCACHAR",
    "TINSUKIA",
    "UDALGURI",
    "WEST KARBI ANGLONG"
  ],
  "BIHAR": [
    "ARARIA",
    "ARWAL",
    "AURANGABAD",
    "BANKA",
    "BEGUSARAI",
    "BHAGALPUR",
    "BHOJPUR",
    "BUXAR",
    "DARBHANGA",
    "GAYA",
    "GOPALGANJ",
    "JAMUI",
    "JEHANABAD",
    "KAIMUR (BHABUA)",
    "KATIHAR",
    "KHAGARIA",
    "KISHANGANJ",
    "LAKHISARAI",
    "MADHEPURA",
    "MADHUBANI",
    "MUNGER",
    "MUZAFFARPUR",
    "NALANDA",
    "NAWADA",
    "PASHCHIM CHAMPARAN",
    "PATNA",
    "PURBI CHAMPARAN",
    "PURNIA",
    "ROHTAS",
    "SAHARSA",
    "SAMASTIPUR",
    "SARAN",
    "SHEIKHPURA",
    "SHEOHAR",
    "SITAMARHI",
    "SIWAN",
    "SUPAUL",
    "VAISHALI"
  ],
  "CHANDIGARH": [
    "CHANDIGARH"
  ],
  "CHHATTISGARH": [
    "BALOD",
    "BALODA BAZAR",
    "BALRAMPUR",
    "BASTAR",
    "BEMETARA",
    "BIJAPUR",
    "BILASPUR",
    "DANTEWADA",
    "DHAMTARI",
    "DURG",
    "GARIYABAND",
    "JANJGIR-CHAMPA",
    "JASHPUR",
    "KABIRDHAM",
    "KANKER",
    "KONDAGAON",
    "KORBA",
    "KOREA",
    "MAHASAMUND",
    "MUNGELI",
    "NARAYANPUR",
    "RAIGARH",
    "RAIPUR",
    "RAJNANDGAON",
    "SUKMA",
    "SURAJPUR",
    "SURGUJA"
  ],
  "DADRA AND NAGAR HAVELI": [
    "DADRA AND NAGAR HAVELI"
  ],
  "DAMAN AND DIU": [
    "DAMAN",
    "DIU"
  ],
  "DELHI": [
    "CENTRAL",
    "EAST",
    "NEW DELHI",
    "NORTH",
    "NORTH EAST",
    "NORTH WEST",
    "SHAHDARA",
    "SOUTH",
    "SOUTH WEST",
    "South East",
    "WEST"
  ],
  "GOA": [
    "NORTH GOA",
    "SOUTH GOA"
  ],
  "GUJARAT": [
    "AHMADABAD",
    "AMRELI",
    "ANAND",
    "ARVALLI",
    "BANAS KANTHA",
    "BHARUCH",
    "BHAVNAGAR",
    "BOTAD",
    "CHHOTAUDEPUR",
    "DANG",
    "DEVBHUMI DWARKA",
    "DOHAD",
    "GANDHINAGAR",
    "GIR SOMNATH",
    "JAMNAGAR",
    "JUNAGADH",
    "KACHCHH",
    "KHEDA",
    "MAHESANA",
    "MORBI",
    "Mahisagar",
    "NARMADA",
    "NAVSARI",
    "PANCH MAHALS",
    "PATAN",
    "PORBANDAR",
    "RAJKOT",
    "SABAR KANTHA",
    "SURAT",
    "SURENDRANAGAR",
    "TAPI",
    "VADODARA",
    "VALSAD"
  ],
  "HARYANA": [
    "AMBALA",
    "BHIWANI",
    "CHARKI DADRI",
    "FARIDABAD",
    "FATEHABAD",
    "GURUGRAM",
    "HISAR",
    "JHAJJAR",
    "JIND",
    "KAITHAL",
    "KARNAL",
    "KURUKSHETRA",
    "MAHENDRAGARH",
    "NUH",
    "PALWAL",
    "PANCHKULA",
    "PANIPAT",
    "REWARI",
    "ROHTAK",
    "SIRSA",
    "SONIPAT",
    "YAMUNANAGAR"
  ],
  "HIMACHAL PRADESH": [
    "BILASPUR",
    "CHAMBA",
    "HAMIRPUR",
    "KANGRA",
    "KINNAUR",
    "KULLU",
    "LAHUL AND SPITI",
    "MANDI",
    "SHIMLA",
    "SIRMAUR",
    "SOLAN",
    "UNA"
  ],
  "JAMMU AND KASHMIR": [
    "ANANTNAG",
    "BUDGAM",
    "BANDIPORA",
    "BARAMULLA",
    "DODA",
    "GANDERBAL",
    "JAMMU",
    "KARGIL",
    "KATHUA",
    "KISHTWAR",
    "KULGAM",
    "KUPWARA",
    "LEH LADAKH",
    "POONCH",
    "PULWAMA",
    "RAJOURI",
    "RAMBAN",
    "REASI",
    "SAMBA",
    "SHOPIAN",
    "SRINAGAR",
    "UDHAMPUR"
  ],
  "JHARKHAND": [
    "BOKARO",
    "CHATRA",
    "DEOGHAR",
    "DHANBAD",
    "DUMKA",
    "EAST SINGHBUM",
    "GARHWA",
    "GIRIDIH",
    "GODDA",
    "GUMLA",
    "HAZARIBAGH",
    "JAMTARA",
    "KHUNTI",
    "KODERMA",
    "LATEHAR",
    "LOHARDAGA",
    "PAKUR",
    "PALAMU",
    "RAMGARH",
    "RANCHI",
    "SAHEBGANJ",
    "SARAIKELA KHARSAWAN",
    "SIMDEGA",
    "WEST SINGHBHUM"
  ],
  "KARNATAKA": [
    "BAGALKOTE",
    "BALLARI",
    "BELAGAVI",
    "BENGALURU RURAL",
    "BENGALURU URBAN",
    "BIDAR",
    "CHAMARAJANAGARA",
    "CHIKKABALLAPURA",
    "CHIKKAMAGALURU",
    "CHITRADURGA",
    "DAKSHINA KANNADA",
    "DAVANGERE",
    "DHARWAD",
    "GADAG",
    "HASSAN",
    "HAVERI",
    "KALABURAGI",
    "KODAGU",
    "KOLAR",
    "KOPPAL",
    "MANDYA",
    "MYSURU",
    "RAICHUR",
    "RAMANAGARA",
    "SHIVAMOGGA",
    "TUMAKURU",
    "UDUPI",
    "UTTARA KANNADA",
    "VIJAYAPURA",
    "YADGIR"
  ],
  "KERALA": [
    "ALAPPUZHA",
    "ERNAKULAM",
    "IDUKKI",
    "KANNUR",
    "KASARAGOD",
    "KOLLAM",
    "KOTTAYAM",
    "KOZHIKODE",
    "MALAPPURAM",
    "PALAKKAD",
    "PATHANAMTHITTA",
    "THIRUVANANTHAPURAM",
    "THRISSUR",
    "WAYANAD"
  ],
  "LAKSHADWEEP": [
    "LAKSHADWEEP DISTRICT"
  ],
  "MADHYA PRADESH": [
    "AGAR MALWA",
    "ALIRAJPUR",
    "ANUPPUR",
    "ASHOKNAGAR",
    "BALAGHAT",
    "BARWANI",
    "BETUL",
    "BHIND",
    "BHOPAL",
    "BURHANPUR",
    "CHHATARPUR",
    "CHHINDWARA",
    "DAMOH",
    "DATIA",
    "DEWAS",
    "DHAR",
    "DINDORI",
    "EAST NIMAR",
    "GUNA",
    "GWALIOR",
    "HARDA",
    "HOSHANGABAD",
    "INDORE",
    "JABALPUR",
    "JHABUA",
    "KATNI",
    "KHARGONE",
    "MANDLA",
    "MANDSAUR",
    "MORENA",
    "NARSINGHPUR",
    "NEEMUCH",
    "PANNA",
    "RAISEN",
    "RAJGARH",
    "RATLAM",
    "REWA",
    "SAGAR",
    "SATNA",
    "SEHORE",
    "SEONI",
    "SHAHDOL",
    "SHAJAPUR",
    "SHEOPUR",
    "SHIVPURI",
    "SIDHI",
    "SINGRAULI",
    "TIKAMGARH",
    "UJJAIN",
    "UMARIA",
    "VIDISHA"
  ],
  "MAHARASHTRA": [
    "AHMEDNAGAR",
    "AKOLA",
    "AMRAVATI",
    "AURANGABAD",
    "BEED",
    "BHANDARA",
    "BULDHANA",
    "CHANDRAPUR",
    "DHULE",
    "GADCHIROLI",
    "GONDIA",
    "HINGOLI",
    "JALGAON",
    "JALNA",
    "KOLHAPUR",
    "LATUR",
    "MUMBAI",
    "MUMBAI SUBURBAN",
    "NAGPUR",
    "NANDED",
    "NANDURBAR",
    "NASHIK",
    "OSMANABAD",
    "PALGHAR",
    "PARBHANI",
    "PUNE",
    "RAIGAD",
    "RATNAGIRI",
    "SANGLI",
    "SATARA",
    "SINDHUDURG",
    "SOLAPUR",
    "THANE",
    "WARDHA",
    "WASHIM",
    "YAVATMAL"
  ],
  "MANIPUR": [
    "BISHNUPUR",
    "CHANDEL",
    "CHURACHANDPUR",
    "IMPHAL EAST",
    "IMPHAL WEST",
    "JIRIBAM",
    "KAKCHING",
    "KAMJONG",
    "KANGPOKPI",
    "NONEY",
    "PHERZAWL",
    "SENAPATI",
    "TAMENGLONG",
    "TENGNOUPAL",
    "THOUBAL",
    "UKHRUL"
  ],
  "MEGHALAYA": [
    "EAST GARO HILLS",
    "EAST JAINTIA HILLS",
    "EAST KHASI HILLS",
    "NORTH GARO HILLS",
    "RI BHOI",
    "SOUTH GARO HILLS",
    "SOUTH WEST GARO HILLS",
    "SOUTH WEST KHASI HILLS",
    "WEST GARO HILLS",
    "WEST JAINTIA HILLS",
    "WEST KHASI HILLS"
  ],
  "MIZORAM": [
    "AIZAWL",
    "CHAMPHAI",
    "KOLASIB",
    "LAWNGTLAI",
    "LUNGLEI",
    "MAMIT",
    "SAIHA",
    "SERCHHIP"
  ],
  "NAGALAND": [
    "DIMAPUR",
    "KIPHIRE",
    "KOHIMA",
    "LONGLENG",
    "MOKOKCHUNG",
    "MON",
    "PEREN",
    "PHEK",
    "TUENSANG",
    "WOKHA",
    "ZUNHEBOTO"
  ],
  "ODISHA": [
    "ANUGUL",
    "BALANGIR",
    "BALESHWAR",
    "BARGARH",
    "BHADRAK",
    "BOUDH",
    "CUTTACK",
    "DEOGARH",
    "DHENKANAL",
    "GAJAPATI",
    "GANJAM",
    "JAGATSINGHAPUR",
    "JAJAPUR",
    "JHARSUGUDA",
    "KALAHANDI",
    "KANDHAMAL",
    "KENDRAPARA",
    "KENDUJHAR",
    "KHORDHA",
    "KORAPUT",
    "MALKANGIRI",
    "MAYURBHANJ",
    "NABARANGPUR",
    "NAYAGARH",
    "NUAPADA",
    "PURI",
    "RAYAGADA",
    "SAMBALPUR",
    "SONEPUR",
    "SUNDARGARH"
  ],
  "PUDUCHERRY": [
    "KARAIKAL",
    "MAHE",
    "PONDICHERRY",
    "YANAM"
  ],
  "PUNJAB": [
    "AMRITSAR",
    "BARNALA",
    "BATHINDA",
    "FARIDKOT",
    "FATEHGARH SAHIB",
    "FAZILKA",
    "FIROZEPUR",
    "GURDASPUR",
    "HOSHIARPUR",
    "JALANDHAR",
    "KAPURTHALA",
    "LUDHIANA",
    "MANSA",
    "MOGA",
    "PATHANKOT",
    "PATIALA",
    "RUPNAGAR",
    "S.A.S NAGAR",
    "SANGRUR",
    "SRI MUKTSAR SAHIB",
    "Shahid Bhagat Singh Nagar",
    "Tarn Taran"
  ],
  "RAJASTHAN": [
    "AJMER",
    "ALWAR",
    "BANSWARA",
    "BARAN",
    "BARMER",
    "BHARATPUR",
    "BHILWARA",
    "BIKANER",
    "BUNDI",
    "CHITTORGARH",
    "CHURU",
    "DAUSA",
    "DHOLPUR",
    "DUNGARPUR",
    "GANGANAGAR",
    "HANUMANGARH",
    "JAIPUR",
    "JAISALMER",
    "JALORE",
    "JHALAWAR",
    "JHUNJHUNU",
    "JODHPUR",
    "KARAULI",
    "KOTA",
    "NAGAUR",
    "PALI",
    "PRATAPGARH",
    "RAJSAMAND",
    "SAWAI MADHOPUR",
    "SIKAR",
    "SIROHI",
    "TONK",
    "UDAIPUR"
  ],
  "SIKKIM": [
    "EAST DISTRICT",
    "NORTH DISTRICT",
    "SOUTH DISTRICT",
    "WEST DISTRICT"
  ],
  "TAMIL NADU": [
    "Ariyalur",
    "CHENNAI",
    "COIMBATORE",
    "CUDDALORE",
    "DHARMAPURI",
    "DINDIGUL",
    "ERODE",
    "KANCHIPURAM",
    "KANNIYAKUMARI",
    "KARUR",
    "KRISHNAGIRI",
    "MADURAI",
    "NAGAPATTINAM",
    "NAMAKKAL",
    "PERAMBALUR",
    "PUDUKKOTTAI",
    "RAMANATHAPURAM",
    "SALEM",
    "SIVAGANGA",
    "THANJAVUR",
    "THE NILGIRIS",
    "THENI",
    "THIRUVALLUR",
    "THIRUVARUR",
    "TIRUCHIRAPPALLI",
    "TIRUNELVELI",
    "TIRUPPUR",
    "TIRUVANNAMALAI",
    "TUTICORIN",
    "VELLORE",
    "VILLUPURAM",
    "VIRUDHUNAGAR"
  ],
  "TELANGANA": [
    "ADILABAD",
    "BHADRADRI KOTHAGUDEM",
    "HYDERABAD",
    "JANGOAN",
    "JAYASHANKAR BHUPALAPALLY",
    "JOGULAMBA GADWAL",
    "Jagitial",
    "KAMAREDDY",
    "KARIMNAGAR",
    "KHAMMAM",
    "KUMURAM BHEEM ASIFABAD",
    "MAHABUBABAD",
    "MAHABUBNAGAR",
    "MANCHERIAL",
    "MEDAK",
    "MEDCHAL MALKAJGIRI",
    "NAGARKURNOOL",
    "NALGONDA",
    "NIZAMABAD",
    "Nirmal",
    "PEDDAPALLI",
    "RAJANNA SIRCILLA",
    "RANGA REDDY",
    "SANGAREDDY",
    "SIDDIPET",
    "SURYAPET",
    "VIKARABAD",
    "WANAPARTHY",
    "WARANGAL RURAL",
    "WARANGAL URBAN",
    "YADADRI BHUVANAGIRI"
  ],
  "TRIPURA": [
    "Dhalai",
    "Gomati",
    "Khowai",
    "North Tripura",
    "Sepahijala",
    "South Tripura",
    "Unakoti",
    "West Tripura"
  ],
  "UTTAR PRADESH": [
    "AGRA",
    "ALIGARH",
    "PRAYAGRAJ",
    "AMBEDKAR NAGAR",
    "AMROHA",
    "AURAIYA",
    "AZAMGARH",
    "Amethi",
    "BAGHPAT",
    "BAHRAICH",
    "BALLIA",
    "BALRAMPUR",
    "BANDA",
    "BARABANKI",
    "BAREILLY",
    "BASTI",
    "BHADOHI",
    "BIJNOR",
    "BUDAUN",
    "BULANDSHAHR",
    "CHANDAULI",
    "CHITRAKOOT",
    "DEORIA",
    "ETAH",
    "ETAWAH",
    "AYODHYA",
    "FARRUKHABAD",
    "FATEHPUR",
    "FIROZABAD",
    "GAUTAM BUDDHA NAGAR",
    "GHAZIABAD",
    "GHAZIPUR",
    "GONDA",
    "GORAKHPUR",
    "HAMIRPUR",
    "HAPUR",
    "HARDOI",
    "HATHRAS",
    "JALAUN",
    "JAUNPUR",
    "JHANSI",
    "KANNAUJ",
    "KANPUR DEHAT",
    "KANPUR NAGAR",
    "KAUSHAMBI",
    "KHERI",
    "KUSHI NAGAR",
    "Kasganj",
    "LALITPUR",
    "LUCKNOW",
    "MAHARAJGANJ",
    "MAHOBA",
    "MAINPURI",
    "MATHURA",
    "MAU",
    "MEERUT",
    "MIRZAPUR",
    "MORADABAD",
    "MUZAFFARNAGAR",
    "PILIBHIT",
    "PRATAPGARH",
    "RAE BARELI",
    "RAMPUR",
    "SAHARANPUR",
    "SAMBHAL",
    "SANT KABEER NAGAR",
    "SHAHJAHANPUR",
    "SHAMLI",
    "SHRAVASTI",
    "SIDDHARTH NAGAR",
    "SITAPUR",
    "SONBHADRA",
    "SULTANPUR",
    "UNNAO",
    "VARANASI"
  ],
  "UTTARAKHAND": [
    "ALMORA",
    "BAGESHWAR",
    "CHAMOLI",
    "CHAMPAWAT",
    "DEHRADUN",
    "HARIDWAR",
    "NAINITAL",
    "PAURI GARHWAL",
    "PITHORAGARH",
    "RUDRA PRAYAG",
    "TEHRI GARHWAL",
    "UDAM SINGH NAGAR",
    "UTTAR KASHI"
  ],
  "WEST BENGAL": [
    "24 PARAGANAS NORTH",
    "24 PARAGANAS SOUTH",
    "Alipurduar",
    "BANKURA",
    "BIRBHUM",
    "COOCHBEHAR",
    "DARJEELING",
    "DINAJPUR DAKSHIN",
    "DINAJPUR UTTAR",
    "HOOGHLY",
    "HOWRAH",
    "JALPAIGURI",
    "Jhargram",
    "KALIMPONG",
    "KOLKATA",
    "MALDAH",
    "MEDINIPUR EAST",
    "MEDINIPUR WEST",
    "MURSHIDABAD",
    "NADIA",
    "PASCHIM BARDHAMAN",
    "PURBA BARDHAMAN",
    "PURULIA"
  ],
  "LADAKH": [
    "KARGIL",
    "LEH LADAKH"
  ]
} as const;

function normalizeLocationToken(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeStateLookupKey(value: string) {
  return normalizeLocationToken(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeDistrictLookupKey(value: string) {
  return normalizeLocationToken(value).toUpperCase().replace(/\./g, "").replace(/[^A-Z0-9]/g, "");
}

const CANDIDATE_STATE_LOOKUP = Object.fromEntries(
  CANDIDATE_STATE_OPTIONS.map((state) => [normalizeStateLookupKey(state), state]),
) as Record<string, CandidateState>;

const CANDIDATE_DISTRICT_LOOKUP = Object.fromEntries(
  CANDIDATE_STATE_OPTIONS.map((state) => [
    state,
    Object.fromEntries(
      CANDIDATE_STATE_DISTRICT_MAP[state].map((district) => [normalizeDistrictLookupKey(district), district]),
    ),
  ]),
) as Record<CandidateState, Record<string, string>>;

export function resolveCandidateState(value: string) {
  const trimmed = normalizeLocationToken(value);
  if (!trimmed) {
    return "";
  }

  const exactMatch = CANDIDATE_STATE_OPTIONS.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  if (exactMatch) {
    return exactMatch;
  }

  return CANDIDATE_STATE_LOOKUP[normalizeStateLookupKey(trimmed)] ?? "";
}

export function resolveCandidateDistrict(state: string, value: string) {
  const trimmed = normalizeLocationToken(value);
  if (!trimmed) {
    return "";
  }

  const resolvedState = resolveCandidateState(state);
  if (!resolvedState) {
    return "";
  }

  const districts = CANDIDATE_STATE_DISTRICT_MAP[resolvedState];
  const exactMatch = districts.find((option) => option.toLowerCase() === trimmed.toLowerCase());
  if (exactMatch) {
    return exactMatch;
  }

  return CANDIDATE_DISTRICT_LOOKUP[resolvedState][normalizeDistrictLookupKey(trimmed)] ?? "";
}

export function listCandidateDistrictsForState(state: string) {
  const resolvedState = resolveCandidateState(String(state ?? ""));
  if (!resolvedState) {
    return [] as string[];
  }

  return [...CANDIDATE_STATE_DISTRICT_MAP[resolvedState]];
}

export function normalizeCandidateState(value: unknown) {
  return resolveCandidateState(String(value ?? ""));
}

export function normalizeCandidateDistrict(state: unknown, value: unknown) {
  return resolveCandidateDistrict(String(state ?? ""), String(value ?? ""));
}

export function isKnownCandidateState(value: unknown) {
  const trimmed = normalizeLocationToken(String(value ?? ""));
  if (!trimmed) {
    return true;
  }

  return resolveCandidateState(trimmed) !== "";
}

export function isKnownCandidateDistrictForState(state: unknown, value: unknown) {
  const trimmed = normalizeLocationToken(String(value ?? ""));
  if (!trimmed) {
    return true;
  }

  return resolveCandidateDistrict(String(state ?? ""), trimmed) !== "";
}

export const CANDIDATE_STATE_ERROR = `State must be one of the SIDH LGD values: ${CANDIDATE_STATE_OPTIONS.slice(0, 5).join(", ")}, ... (${CANDIDATE_STATE_OPTIONS.length} total)`;

export function candidateDistrictError(state: string) {
  const districts = listCandidateDistrictsForState(state);
  const resolvedState = normalizeCandidateState(state);
  if (districts.length === 0) {
    return "District must match a SIDH LGD value for the selected state";
  }

  return `District must be one of the SIDH LGD values for ${resolvedState || state}: ${districts.slice(0, 5).join(", ")}${districts.length > 5 ? ", ..." : ""}`;
}

/** @deprecated Use listCandidateDistrictsForState */
export const listCandidateCitiesForState = listCandidateDistrictsForState;

/** @deprecated Use normalizeCandidateDistrict */
export const normalizeCandidateCity = normalizeCandidateDistrict;

/** @deprecated Use isKnownCandidateDistrictForState */
export const isKnownCandidateCityForState = isKnownCandidateDistrictForState;

/** @deprecated Use candidateDistrictError */
export const candidateCityError = candidateDistrictError;

/** @deprecated Use CANDIDATE_STATE_DISTRICT_MAP */
export const CANDIDATE_STATE_CITY_MAP = CANDIDATE_STATE_DISTRICT_MAP;
