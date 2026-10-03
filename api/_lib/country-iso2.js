/**
 * Shared country name / alias → ISO 3166-1 alpha-2.
 */
const COUNTRY_NAME_TO_ISO2 = {
  afghanistan: 'AF', albania: 'AL', algeria: 'DZ', andorra: 'AD', angola: 'AO',
  argentina: 'AR', armenia: 'AM', australia: 'AU', austria: 'AT', azerbaijan: 'AZ',
  bahrain: 'BH', bangladesh: 'BD', belarus: 'BY', belgium: 'BE', belize: 'BZ',
  benin: 'BJ', bhutan: 'BT', bolivia: 'BO', 'bosnia and herzegovina': 'BA',
  botswana: 'BW', brazil: 'BR', brasil: 'BR', brunei: 'BN', bulgaria: 'BG', 'burkina faso': 'BF',
  burundi: 'BI', 'cabo verde': 'CV', cambodia: 'KH', cameroon: 'CM', canada: 'CA',
  'central african republic': 'CF', chad: 'TD', chile: 'CL', china: 'CN',
  colombia: 'CO', comoros: 'KM', congo: 'CG', 'costa rica': 'CR', croatia: 'HR',
  cuba: 'CU', cyprus: 'CY', czechia: 'CZ', 'czech republic': 'CZ',
  'democratic republic of the congo': 'CD', denmark: 'DK', djibouti: 'DJ',
  dominica: 'DM', 'dominican republic': 'DO', ecuador: 'EC', egypt: 'EG',
  'el salvador': 'SV', 'equatorial guinea': 'GQ', eritrea: 'ER', estonia: 'EE',
  eswatini: 'SZ', ethiopia: 'ET', fiji: 'FJ', finland: 'FI', france: 'FR',
  gabon: 'GA', gambia: 'GM', georgia: 'GE', germany: 'DE', ghana: 'GH',
  greece: 'GR', guatemala: 'GT', guinea: 'GN', 'guinea-bissau': 'GW',
  guyana: 'GY', haiti: 'HT', honduras: 'HN', hungary: 'HU', iceland: 'IS',
  india: 'IN', indonesia: 'ID', iran: 'IR', iraq: 'IQ', ireland: 'IE',
  israel: 'IL', italy: 'IT', "côte d'ivoire": 'CI', 'ivory coast': 'CI',
  jamaica: 'JM', japan: 'JP', jordan: 'JO', kazakhstan: 'KZ', kenya: 'KE',
  kiribati: 'KI', kuwait: 'KW', kyrgyzstan: 'KG', laos: 'LA', latvia: 'LV',
  lebanon: 'LB', lesotho: 'LS', liberia: 'LR', libya: 'LY', liechtenstein: 'LI',
  lithuania: 'LT', luxembourg: 'LU', madagascar: 'MG', malawi: 'MW',
  malaysia: 'MY', maldives: 'MV', mali: 'ML', malta: 'MT', 'marshall islands': 'MH',
  mauritania: 'MR', mauritius: 'MU', mexico: 'MX', micronesia: 'FM', moldova: 'MD',
  monaco: 'MC', mongolia: 'MN', montenegro: 'ME', morocco: 'MA', mozambique: 'MZ',
  myanmar: 'MM', namibia: 'NA', nauru: 'NR', nepal: 'NP', netherlands: 'NL',
  'new zealand': 'NZ', nicaragua: 'NI', niger: 'NE', nigeria: 'NG',
  'north korea': 'KP', 'north macedonia': 'MK', norway: 'NO', oman: 'OM',
  pakistan: 'PK', palau: 'PW', palestine: 'PS', panama: 'PA',
  'papua new guinea': 'PG', paraguay: 'PY', peru: 'PE', philippines: 'PH',
  poland: 'PL', portugal: 'PT', qatar: 'QA', romania: 'RO', russia: 'RU',
  rwanda: 'RW', 'saint kitts and nevis': 'KN', 'saint lucia': 'LC',
  'saint vincent and the grenadines': 'VC', samoa: 'WS', 'san marino': 'SM',
  'sao tome and principe': 'ST', 'saudi arabia': 'SA', senegal: 'SN', serbia: 'RS',
  seychelles: 'SC', 'sierra leone': 'SL', singapore: 'SG', slovakia: 'SK',
  slovenia: 'SI', 'solomon islands': 'SB', somalia: 'SO', 'south africa': 'ZA',
  'south korea': 'KR', 'south sudan': 'SS', spain: 'ES', 'sri lanka': 'LK',
  sudan: 'SD', suriname: 'SR', sweden: 'SE', switzerland: 'CH', syria: 'SY',
  taiwan: 'TW', tajikistan: 'TJ', tanzania: 'TZ', thailand: 'TH',
  'timor-leste': 'TL', togo: 'TG', tonga: 'TO', 'trinidad and tobago': 'TT',
  tunisia: 'TN', turkey: 'TR', türkiye: 'TR', turkmenistan: 'TM', tuvalu: 'TV',
  uganda: 'UG', ukraine: 'UA', 'united arab emirates': 'AE',
  'united kingdom': 'GB', 'united states': 'US', 'united states of america': 'US',
  uruguay: 'UY', uzbekistan: 'UZ', vanuatu: 'VU', 'vatican city': 'VA',
  venezuela: 'VE', vietnam: 'VN', yemen: 'YE', zambia: 'ZM', zimbabwe: 'ZW',
};

/** Common ISO2 aliases that are not the official codes. */
const COUNTRY_CODE_ALIASES = Object.freeze({
  UK: 'GB',
  EL: 'GR',
  EN: 'GB',
});

function resolveCountryCode(countryOrCode) {
  const raw = String(countryOrCode || '').trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) {
    const code = raw.toUpperCase();
    return COUNTRY_CODE_ALIASES[code] || code;
  }
  return COUNTRY_NAME_TO_ISO2[raw.toLowerCase()] || null;
}


function resolveCountryIso2(countryOrCode) {
  return resolveCountryCode(countryOrCode);
}

module.exports = {
  COUNTRY_NAME_TO_ISO2,
  COUNTRY_CODE_ALIASES,
  resolveCountryCode,
  resolveCountryIso2,
};
