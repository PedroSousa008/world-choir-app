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
    'United Kingdom': 'GB', 'United States': 'US', 'United States of America': 'US',
    Uruguay: 'UY', Uzbekistan: 'UZ', Vanuatu: 'VU', 'Vatican City': 'VA',
    Venezuela: 'VE', Vietnam: 'VN', Yemen: 'YE', Zambia: 'ZM', Zimbabwe: 'ZW',
  };

  function iso2ForCountry(country) {
    const raw = String(country || '').trim();
    if (!raw) return null;
    if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
    return NAME_TO_ISO2[raw] || null;
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
    return `https://hatscripts.github.io/circle-flags/flags/${iso.toLowerCase()}.svg`;
  }

  function formatPlace(city, country) {
    const flag = flagEmoji(country);
    const place = [city, country].filter(Boolean).join(', ');
    return flag ? `${place} ${flag}` : place;
  }

  return { iso2ForCountry, flagEmoji, flagCircleUrl, formatPlace, NAME_TO_ISO2 };
})();
