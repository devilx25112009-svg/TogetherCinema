import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { isVercelRuntime, normalizeLegacyAssetPath, resolveCinemaStorageDir } from './runtimeEnv';

test('resolveCinemaStorageDir uses /tmp on Vercel and .cinema-storage locally', () => {
  assert.equal(isVercelRuntime({}), false);
  assert.equal(isVercelRuntime({ VERCEL: '1' }), true);
  assert.equal(isVercelRuntime({ VERCEL_ENV: 'production' }), true);

  assert.equal(resolveCinemaStorageDir({}), path.resolve('.cinema-storage'));
  assert.equal(
    resolveCinemaStorageDir({ VERCEL: '1' }),
    path.join(os.tmpdir(), 'together-cinema-storage')
  );
  assert.equal(
    resolveCinemaStorageDir({ VERCEL: '1', LOCAL_STORAGE_DIR: '/tmp/custom-cinema' }),
    path.resolve('/tmp/custom-cinema')
  );
});

test('normalizeLegacyAssetPath migrates /src/assets/images/* to /images/*', () => {
  assert.equal(
    normalizeLegacyAssetPath('/src/assets/images/poster_midnight_orbit_1794680182030.jpg'),
    '/images/poster_midnight_orbit_1794680182030.jpg'
  );
  assert.equal(
    normalizeLegacyAssetPath('/images/cinema_hero_couple_1794680184863.jpg'),
    '/images/cinema_hero_couple_1794680184863.jpg'
  );
  assert.equal(normalizeLegacyAssetPath(undefined), '');
});
