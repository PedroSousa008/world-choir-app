/**
 * Map sponsor owner storage — unit tests (no network).
 */
const assert = require('assert');
const {
  normalizeUrl,
  publicSponsorRecord,
  DEFAULT_SPONSOR_CAPACITY,
} = require('../api/_lib/map-sponsors-owner');

function testNormalizeUrl() {
  assert.strictEqual(normalizeUrl('https://nike.com'), 'https://nike.com/');
  assert.strictEqual(normalizeUrl('nike.com'), 'https://nike.com/');
  assert.strictEqual(normalizeUrl('javascript:alert(1)'), '');
  assert.strictEqual(normalizeUrl(''), '');
}

function testPublicProjection() {
  const record = publicSponsorRecord({
    id: 'a',
    companyName: 'Nike',
    companyLogoUrl: '/api/media?path=logo.png',
    companyWebsiteUrl: 'https://nike.com',
    displayOrder: 1,
    contract: { value: 100000 },
    contacts: { primary: { email: 'secret@nike.com' } },
  });
  assert.deepStrictEqual(Object.keys(record).sort(), ['companyName', 'displayOrder', 'id', 'logo', 'websiteUrl']);
  assert.strictEqual(record.logo, '/api/media?path=logo.png');
  assert.strictEqual(record.contract, undefined);
}

function testCapacityConstant() {
  assert.strictEqual(DEFAULT_SPONSOR_CAPACITY, 20);
}

testNormalizeUrl();
testPublicProjection();
testCapacityConstant();
console.log('map-sponsors tests passed');
