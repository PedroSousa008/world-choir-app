/**
 * World Choir — country display name → flag emoji (via ISO2 regional indicators).
 */
const WorldChoirFlags = (() => {
  const NAME_TO_ISO2 = {
    Afghanistan: 'AF', Albania: 'AL', Algeria: 'DZ', Andorra: 'AD', Angola: 'AO',
    Argentina: 'AR', Armenia: 'AM', Australia: 'AU', Austria: 'AT', Azerbaijan: 'AZ',
    Bahrain: 'BH', Bangladesh: 'BD', Belarus: 'BY', Belgium: 'BE', Belize: 'BZ',
    Benin: 'BJ', Bhutan: 'BT', Bolivia: 'BO', 'Bosnia and Herzegovina': 'BA',
    Botswana: 'BW', Brazil: 'BR', Brunei: 'BN', Bulgaria: 'BG', 'Burkina Faso': 'BF',
    Burundi: 'BI', 'Cabo Verde': 'CV', Cambodia: 'KH', Cameroon: 'CM', Canada: 'CA',
    'Central African Republic': 'CF', Chad: 'TD', Chile: 'CL', China: 'CN',
    Colombia: 'CO', Comoros: 'KM', Congo: 'CG', 'Costa Rica': 'CR', Croatia: 'HR',
    Cuba: 'CU', Cyprus: 'CY', Czechia: 'CZ', 'Czech Republic': 'CZ',
    'Democratic Republic of the Congo': 'CD', Denmark: 'DK', Djibouti: 'DJ',
    Dominica: 'DM', 'Dominican Republic': 'DO', Ecuador: 'EC', Egypt: 'EG',
    'El Salvador': 'SV', 'Equatorial Guinea': 'GQ', Eritrea: 'ER', Estonia: 'EE',
    Eswatini: 'SZ', Ethiopia: 'ET', Fiji: 'FJ', Finland: 'FI', France: 'FR',
    Gabon: 'GA', Gambia: 'GM', Georgia: 'GE', Germany: 'DE', Ghana: 'GH',
    Greece: 'GR', Guatemala: 'GT', Guinea: 'GN', 'Guinea-Bissau': 'GW',
    Guyana: 'GY', Haiti: 'HT', Honduras: 'HN', Hungary: 'HU', Iceland: 'IS',
    India: 'IN', Indonesia: 'ID', Iran: 'IR', Iraq: 'IQ', Ireland: 'IE',
    Israel: 'IL', Italy: 'IT', "Côte d'Ivoire": 'CI', 'Ivory Coast': 'CI',
    Jamaica: 'JM', Japan: 'JP', Jordan: 'JO', Kazakhstan: 'KZ', Kenya: 'KE',
    Kiribati: 'KI', Kuwait: 'KW', Kyrgyzstan: 'KG', Laos: 'LA', Latvia: 'LV',
    Lebanon: 'LB', Lesotho: 'LS', Liberia: 'LR', Libya: 'LY', Liechtenstein: 'LI',
    Lithuania: 'LT', Luxembourg: 'LU', Madagascar: 'MG', Malawi: 'MW',
    Malaysia: 'MY', Maldives: 'MV', Mali: 'ML', Malta: 'MT', 'Marshall Islands': 'MH',
    Mauritania: 'MR', Mauritius: 'MU', Mexico: 'MX', Micronesia: 'FM', Moldova: 'MD',
    Monaco: 'MC', Mongolia: 'MN', Montenegro: 'ME', Morocco: 'MA', Mozambique: 'MZ',
    Myanmar: 'MM', Namibia: 'NA', Nauru: 'NR', Nepal: 'NP', Netherlands: 'NL',
    'New Zealand': 'NZ', Nicaragua: 'NI', Niger: 'NE', Nigeria: 'NG',
    'North Korea': 'KP', 'North Macedonia': 'MK', Norway: 'NO', Oman: 'OM',
    Pakistan: 'PK', Palau: 'PW', Palestine: 'PS', Panama: 'PA',
    'Papua New Guinea': 'PG', Paraguay: 'PY', Peru: 'PE', Philippines: 'PH',
    Poland: 'PL', Portugal: 'PT', Qatar: 'QA', Romania: 'RO', Russia: 'RU',
    Rwanda: 'RW', 'Saint Kitts and Nevis': 'KN', 'Saint Lucia': 'LC',
    'Saint Vincent and the Grenadines': 'VC', Samoa: 'WS', 'San Marino': 'SM',
    'Sao Tome and Principe': 'ST', 'Saudi Arabia': 'SA', Senegal: 'SN', Serbia: 'RS',
    Seychelles: 'SC', 'Sierra Leone': 'SL', Singapore: 'SG', Slovakia: 'SK',
    Slovenia: 'SI', 'Solomon Islands': 'SB', Somalia: 'SO', 'South Africa': 'ZA',
    'South Korea': 'KR', 'South Sudan': 'SS', Spain: 'ES', 'Sri Lanka': 'LK',
    Sudan: 'SD', Suriname: 'SR', Sweden: 'SE', Switzerland: 'CH', Syria: 'SY',
    Taiwan: 'TW', Tajikistan: 'TJ', Tanzania: 'TZ', Thailand: 'TH',
    'Timor-Leste': 'TL', Togo: 'TG', Tonga: 'TO', 'Trinidad and Tobago': 'TT',
    Tunisia: 'TN', Turkey: 'TR', Türkiye: 'TR', Turkmenistan: 'TM', Tuvalu: 'TV',
    Uganda: 'UG', Ukraine: 'UA', 'United Arab Emirates': 'AE',
    'United Kingdom': 'GB', Scotland: 'GB', 'United States': 'US', 'United States of America': 'US',
    Uruguay: 'UY', Uzbekistan: 'UZ', Vanuatu: 'VU', 'Vatican City': 'VA',
    Venezuela: 'VE', Vietnam: 'VN', Yemen: 'YE', Zambia: 'ZM', Zimbabwe: 'ZW',
  };

  /** Prefer IOC / common 3-letter codes for compact route strips. */
  const NAME_TO_ISO3 = {
    Afghanistan: 'AFG', Albania: 'ALB', Algeria: 'DZA', Andorra: 'AND', Angola: 'AGO',
    Argentina: 'ARG', Armenia: 'ARM', Australia: 'AUS', Austria: 'AUT', Azerbaijan: 'AZE',
    Bahrain: 'BHR', Bangladesh: 'BGD', Belarus: 'BLR', Belgium: 'BEL', Belize: 'BLZ',
    Benin: 'BEN', Bhutan: 'BTN', Bolivia: 'BOL', 'Bosnia and Herzegovina': 'BIH',
    Botswana: 'BWA', Brazil: 'BRA', Brunei: 'BRN', Bulgaria: 'BGR', 'Burkina Faso': 'BFA',
    Burundi: 'BDI', 'Cabo Verde': 'CPV', Cambodia: 'KHM', Cameroon: 'CMR', Canada: 'CAN',
    'Central African Republic': 'CAF', Chad: 'TCD', Chile: 'CHL', China: 'CHN',
    Colombia: 'COL', Comoros: 'COM', Congo: 'CGO', 'Costa Rica': 'CRC', Croatia: 'CRO',
    Cuba: 'CUB', Cyprus: 'CYP', Czechia: 'CZE', 'Czech Republic': 'CZE',
    'Democratic Republic of the Congo': 'COD', Denmark: 'DEN', Djibouti: 'DJI',
    Dominica: 'DMA', 'Dominican Republic': 'DOM', Ecuador: 'ECU', Egypt: 'EGY',
    'El Salvador': 'ESA', 'Equatorial Guinea': 'GEQ', Eritrea: 'ERI', Estonia: 'EST',
    Eswatini: 'SWZ', Ethiopia: 'ETH', Fiji: 'FIJ', Finland: 'FIN', France: 'FRA',
    Gabon: 'GAB', Gambia: 'GAM', Georgia: 'GEO', Germany: 'GER', Ghana: 'GHA',
    Greece: 'GRE', Guatemala: 'GUA', Guinea: 'GUI', 'Guinea-Bissau': 'GBS',
    Guyana: 'GUY', Haiti: 'HAI', Honduras: 'HON', Hungary: 'HUN', Iceland: 'ISL',
    India: 'IND', Indonesia: 'IDN', Iran: 'IRI', Iraq: 'IRQ', Ireland: 'IRL',
    Israel: 'ISR', Italy: 'ITA', "Côte d'Ivoire": 'CIV', 'Ivory Coast': 'CIV',
    Jamaica: 'JAM', Japan: 'JPN', Jordan: 'JOR', Kazakhstan: 'KAZ', Kenya: 'KEN',
    Kiribati: 'KIR', Kuwait: 'KUW', Kyrgyzstan: 'KGZ', Laos: 'LAO', Latvia: 'LAT',
    Lebanon: 'LBN', Lesotho: 'LES', Liberia: 'LBR', Libya: 'LBA', Liechtenstein: 'LIE',
    Lithuania: 'LTU', Luxembourg: 'LUX', Madagascar: 'MAD', Malawi: 'MAW',
    Malaysia: 'MAS', Maldives: 'MDV', Mali: 'MLI', Malta: 'MLT', 'Marshall Islands': 'MHL',
    Mauritania: 'MTN', Mauritius: 'MRI', Mexico: 'MEX', Micronesia: 'FSM', Moldova: 'MDA',
    Monaco: 'MON', Mongolia: 'MGL', Montenegro: 'MNE', Morocco: 'MAR', Mozambique: 'MOZ',
    Myanmar: 'MYA', Namibia: 'NAM', Nauru: 'NRU', Nepal: 'NEP', Netherlands: 'NED',
    'New Zealand': 'NZL', Nicaragua: 'NCA', Niger: 'NIG', Nigeria: 'NGR',
    'North Korea': 'PRK', 'North Macedonia': 'MKD', Norway: 'NOR', Oman: 'OMA',
    Pakistan: 'PAK', Palau: 'PLW', Palestine: 'PLE', Panama: 'PAN',
    'Papua New Guinea': 'PNG', Paraguay: 'PAR', Peru: 'PER', Philippines: 'PHI',
    Poland: 'POL', Portugal: 'POR', Qatar: 'QAT', Romania: 'ROU', Russia: 'RUS',
    Rwanda: 'RWA', 'Saint Kitts and Nevis': 'SKN', 'Saint Lucia': 'LCA',
    'Saint Vincent and the Grenadines': 'VIN', Samoa: 'SAM', 'San Marino': 'SMR',
    'Sao Tome and Principe': 'STP', 'Saudi Arabia': 'KSA', Senegal: 'SEN', Serbia: 'SRB',
    Seychelles: 'SEY', 'Sierra Leone': 'SLE', Singapore: 'SGP', Slovakia: 'SVK',
    Slovenia: 'SLO', 'Solomon Islands': 'SOL', Somalia: 'SOM', 'South Africa': 'RSA',
    'South Korea': 'KOR', 'South Sudan': 'SSD', Spain: 'ESP', 'Sri Lanka': 'SRI',
    Sudan: 'SUD', Suriname: 'SUR', Sweden: 'SWE', Switzerland: 'SUI', Syria: 'SYR',
    Taiwan: 'TPE', Tajikistan: 'TJK', Tanzania: 'TAN', Thailand: 'THA',
    'Timor-Leste': 'TLS', Togo: 'TOG', Tonga: 'TGA', 'Trinidad and Tobago': 'TTO',
    Tunisia: 'TUN', Turkey: 'TUR', Türkiye: 'TUR', Turkmenistan: 'TKM', Tuvalu: 'TUV',
    Uganda: 'UGA', Ukraine: 'UKR', 'United Arab Emirates': 'ARE', UAE: 'ARE',
    'United Kingdom': 'GBR', Scotland: 'SCO', 'United States': 'USA', 'United States of America': 'USA',
    Uruguay: 'URU', Uzbekistan: 'UZB', Vanuatu: 'VAN', 'Vatican City': 'VAT',
    Venezuela: 'VEN', Vietnam: 'VIE', Yemen: 'YEM', Zambia: 'ZAM', Zimbabwe: 'ZIM',
  };

  function iso2ForCountry(country) {
    const raw = String(country || '').trim();
    if (!raw) return null;
    if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
    return NAME_TO_ISO2[raw] || null;
  }

  function iso3ForCountry(country) {
    const raw = String(country || '').trim();
    if (!raw) return '';
    if (/^[A-Za-z]{3}$/.test(raw)) return raw.toUpperCase();
    if (NAME_TO_ISO3[raw]) return NAME_TO_ISO3[raw];
    const iso2 = iso2ForCountry(raw);
    return iso2 || raw.slice(0, 3).toUpperCase();
  }

  function flagEmoji(countryOrCode) {
    const iso = iso2ForCountry(countryOrCode);
    if (!iso) return '';
    const chars = iso.toUpperCase();
    return String.fromCodePoint(
      ...[...chars].map((c) => 127397 + c.charCodeAt(0))
    );
  }

  function flagCircleUrl(countryOrCode) {
    const iso = iso2ForCountry(countryOrCode);
    if (!iso) return null;
    return `https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.3/flags/1x1/${iso.toLowerCase()}.svg`;
  }

  function formatPlace(city, country) {
    const flag = flagEmoji(country);
    const place = [city, country].filter(Boolean).join(', ');
    return flag ? `${place} ${flag}` : place;
  }

  return { iso2ForCountry, iso3ForCountry, flagEmoji, flagCircleUrl, formatPlace, NAME_TO_ISO2 };
})();
