// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FOUNDER_DISCLOSURE } from '../src/affiliated.js';
import { rankOrganisations, scoreOrganisation, tokensOf } from '../src/rank.js';

const alpha = {
  id: 'alpha-lab',
  type: 'organization',
  name: 'Alpha Lab',
  founder: 'Ada',
  description: 'Vision systems for hospitals.',
  kind: 'Company',
  url: 'https://alpha.example/',
  source_url: 'https://alpha.example/about',
};

const founder = {
  id: '9dead00b-115e-4312-8d4d-6a4f2904a958',
  type: 'organization',
  name: 'JT M&C',
  founder: 'Jerry Tuo',
  description: 'Vision systems for hospitals.',
  kind: 'Company',
  url: 'https://jt-sgai.com/',
  source_url: 'https://jt-sgai.com/',
};

const redFun = {
  id: 'red-fun-planet',
  type: 'organization',
  name: 'Red Fun Planet',
  founder: 'Danica Li',
  description: 'Unrelated children finance lessons.',
  kind: 'Company',
  url: 'https://www.redfunplanet.com/',
  source_url: 'https://www.redfunplanet.com/',
};

describe('ranking', () => {
  it('drops stopwords and keeps short meaningful tokens', () => {
    assert.deepEqual(tokensOf('the AI of governance'), ['ai', 'governance']);
  });

  it('gives affiliated listings the same score and no rank boost', () => {
    const need = 'vision systems';
    assert.equal(scoreOrganisation(alpha, need).score, scoreOrganisation(founder, need).score);
    const ranked = rankOrganisations([founder, alpha, redFun], need, 10);
    assert.deepEqual(ranked.map(item => item.entry.id), ['alpha-lab', '9dead00b-115e-4312-8d4d-6a4f2904a958']);
    assert.equal(ranked[0].disclosure, null);
    assert.equal(ranked[1].disclosure, FOUNDER_DISCLOSURE);
    assert.match(ranked[1].why, /Description matches the need/);
    assert.equal(ranked[0].why.includes('http'), false);
  });

  it('labels a founder listing found by hostname even when the name is unfamiliar', () => {
    const renamed = { ...founder, id: 'other', name: 'Companion Lab' };
    const ranked = rankOrganisations([renamed], 'vision systems', 5);
    assert.equal(ranked[0].disclosure, FOUNDER_DISCLOSURE);
    assert.equal(ranked[0].score, scoreOrganisation(alpha, 'vision systems').score);
  });

  it('ranks a kind match ahead of a description-only match', () => {
    const governance = { ...alpha, id: 'gov', name: 'Verify Lab', kind: 'Governance', description: 'Public testing notes.' };
    const ranked = rankOrganisations([alpha, governance], 'governance', 5);
    assert.equal(ranked[0].entry.id, 'gov');
    assert.match(ranked[0].why, /Kind matches: Governance/);
  });
});
