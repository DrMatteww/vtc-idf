import { describe, expect, it } from 'vitest';

import {
  combienAfficher, dansManger, dansService, dansWc, pastillesDe, pourMoi,
} from '../lieux';
import type { Manger, Service, Toilette } from '../types';

const rien = () => false;
const tout = () => true;

function service(p: Partial<Service>): Service {
  return {
    id: 'st1', name: 'Station', address: 'Paris 16e', dept: '75',
    lat: 48.8, lon: 2.2, h24: false, t: 'station',
    o: [], f: [], ...p,
  } as Service;
}

describe('ce que conduit le chauffeur filtre les stations', () => {
  it('en thermique, toutes les stations passent', () => {
    expect(pourMoi(service({ energie: ['carburant'] }), 'carburant')).toBe(true);
    expect(pourMoi(service({ energie: ['electrique'] }), 'carburant')).toBe(true);
  });

  it('en électrique, seules celles qui rechargent', () => {
    expect(pourMoi(service({ energie: ['carburant'] }), 'electrique')).toBe(false);
    expect(pourMoi(service({ energie: ['carburant', 'electrique'] }), 'electrique')).toBe(true);
  });

  it('un lavage ou une pharmacie ne vend pas d’énergie : montré à tous', () => {
    expect(pourMoi(service({ t: 'lavage' }), 'electrique')).toBe(true);
    expect(pourMoi(service({ t: 'pharmacie' }), 'electrique')).toBe(true);
  });
});

describe('les pastilles de services', () => {
  const s = service({ t: 'lavage' });
  it('« Tout » laisse passer', () => {
    expect(dansService(s, 'all', rien, 'carburant')).toBe(true);
  });
  it('filtre par nature', () => {
    expect(dansService(s, 'lavage', rien, 'carburant')).toBe(true);
    expect(dansService(s, 'station', rien, 'carburant')).toBe(false);
  });
  it('les favoris sont une nature comme une autre', () => {
    expect(dansService(s, 'fav', tout, 'carburant')).toBe(true);
    expect(dansService(s, 'fav', rien, 'carburant')).toBe(false);
  });
});

describe('les familles de Manger', () => {
  const m = { id: 'm1', t: 'sandwich' } as Manger;
  it('la famille vient de la donnée, jamais devinée', () => {
    expect(dansManger(m, 'sandwich', rien)).toBe(true);
    expect(dansManger(m, 'pizza', rien)).toBe(false);
  });
});

describe('les toilettes', () => {
  const t = { id: 'wc1', h24: false } as Toilette;
  it('« Ouvert 24h » ne garde que celles qui le sont', () => {
    expect(dansWc(t, '24', rien)).toBe(false);
    expect(dansWc({ ...t, h24: true }, '24', rien)).toBe(true);
  });
});

describe('combien on en montre', () => {
  it('cinq quand on sait où tu es — pas un annuaire', () => {
    expect(combienAfficher({ enFavoris: false, recherche: false, aUnePosition: true })).toBe(5);
  });
  it('douze sans position, faute de tri par distance', () => {
    expect(combienAfficher({ enFavoris: false, recherche: false, aUnePosition: false })).toBe(12);
  });
  it('dix en recherche : on cherche une enseigne, pas ce qui est autour', () => {
    expect(combienAfficher({ enFavoris: false, recherche: true, aUnePosition: true })).toBe(10);
  });
  it('les favoris en entier, c’est sa liste', () => {
    expect(combienAfficher({ enFavoris: true, recherche: false, aUnePosition: true })).toBe(50);
  });
});

describe('Trafic n’a pas de filtre', () => {
  it('une seule nuit, donc rien à filtrer', () => {
    expect(pastillesDe('trafic')).toBeNull();
    expect(pastillesDe('wc')).not.toBeNull();
  });
});
