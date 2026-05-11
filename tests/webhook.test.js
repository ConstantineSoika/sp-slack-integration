// Node.js built-in test runner — run with: node --test tests/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// We test the pure functions without spinning up a server
const { buildBlocks } = require('../services/slack');

describe('buildBlocks', () => {
  test('includes name and email in fields', () => {
    const blocks = buildBlocks({ name: 'Jane', email: 'jane@test.com' });
    const section = blocks.find(b => b.type === 'section');
    assert.ok(section, 'has a section block');
    const texts = section.fields.map(f => f.text);
    assert.ok(texts.some(t => t.includes('Jane')),  'has name');
    assert.ok(texts.some(t => t.includes('jane@test.com')), 'has email');
  });

  test('includes phone when present', () => {
    const blocks = buildBlocks({ name: 'Joe', email: 'j@t.com', phone: '+1234' });
    const section = blocks.find(b => b.type === 'section');
    const texts = section.fields.map(f => f.text);
    assert.ok(texts.some(t => t.includes('+1234')), 'has phone');
  });

  test('omits phone field when absent', () => {
    const blocks = buildBlocks({ name: 'Joe', email: 'j@t.com' });
    const section = blocks.find(b => b.type === 'section');
    assert.ok(section.fields.length === 2, 'only 2 fields without phone');
  });

  test('has header block', () => {
    const blocks = buildBlocks({ email: 'a@b.com' });
    const header = blocks.find(b => b.type === 'header');
    assert.ok(header, 'has header');
    assert.ok(header.text.text.includes('New lead'), 'header text correct');
  });

  test('has CRM action button', () => {
    const blocks = buildBlocks({ email: 'a@b.com' });
    const actions = blocks.find(b => b.type === 'actions');
    assert.ok(actions, 'has actions block');
    assert.ok(actions.elements[0].url.includes('sendpulse.com'), 'button links to SP');
  });

  test('handles SP variables[] format after flattenVariables', () => {
    // After flattenVariables the array syntax is already resolved;
    // buildBlocks receives clean key→value pairs
    const blocks = buildBlocks({ name: 'Alice', email: 'a@a.com', company: 'Acme' });
    const section = blocks.find(b => b.type === 'section');
    const texts = section.fields.map(f => f.text);
    assert.ok(texts.some(t => t.includes('Acme')), 'custom variable included');
  });
});
